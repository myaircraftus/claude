"""
Multi-engine extraction orchestrator.

Runs 4 extraction lanes in parallel for each page:

  Lane 1 — Tesseract OCR/HTR (primary document extraction)
  Lane 2 — GPT-4o Vision OCR (secondary, high-quality fallback)
  Lane 3 — GPT-4o VLM structured extraction (reasoning + field extraction)
  Lane 4 — Regex/rule-based pattern extraction (deterministic structured fields)

Returns per-lane raw text + structured field candidates, plus per-lane
confidence scores for arbitration.
"""

import asyncio
import base64
import io
import json
import logging
import os
import re
import time
from dataclasses import dataclass, field
from typing import Optional

import pytesseract
from openai import AsyncOpenAI
from PIL import Image

logger = logging.getLogger(__name__)

# ─── Field names ─────────────────────────────────────────────────────────────

FIELD_NAMES = [
    "entry_date",
    "tach_time",
    "total_time_airframe",
    "tsoh",
    "tsmoh",
    "work_description",
    "work_type",
    "return_to_service",
    "mechanic_name",
    "ap_cert_number",
    "ia_cert_number",
    "repair_station_cert",
    "part_numbers",
    "serial_numbers",
    "ad_references",
    "far_references",
    "manual_references",
    "inspection_type",
    "ata_chapter",
    "logbook_type",
]

# ─── Data models ─────────────────────────────────────────────────────────────

@dataclass
class ExtractionRunResult:
    engine_name: str
    engine_type: str           # 'ocr','vlm','rule_based'
    raw_text: str
    raw_output: dict
    confidence_score: float
    field_candidates: dict     # field_name -> {value, confidence, normalized}
    processing_ms: int
    error_message: Optional[str] = None


@dataclass
class MultiEngineResult:
    runs: list[ExtractionRunResult]
    combined_candidates: dict  # field_name -> list of {engine, value, confidence}


# ─── Regex patterns for deterministic extraction ──────────────────────────────

_AD_PATTERN      = re.compile(r'\bAD[-\s]?(\d{4}-\d{2}-\d{2}(?:\s+amdt\s+\d+)?)\b', re.I)
_PART_NUMBER     = re.compile(r'(?:P/N|PN|PART\s+NO\.?|PART#)\s*:?\s*([A-Z0-9\-]{4,20})', re.I)
_SERIAL_NUMBER   = re.compile(r'(?:S/N|SN|SERIAL\s+NO\.?|SERIAL#)\s*:?\s*([A-Z0-9\-]{4,25})', re.I)
_AP_CERT         = re.compile(r'(?:A&P|AP|A\s*&\s*P)\s*(?:CERT\.?|NO\.?|#)?\s*:?\s*([0-9]{5,10})', re.I)
_IA_CERT         = re.compile(r'(?:IA|INSP\.\s*AUTH\.?)\s*(?:CERT\.?|NO\.?|#)?\s*:?\s*([0-9]{5,10})', re.I)
_TACH            = re.compile(r'(?:TACH|HOBBS|TACH\s+TIME)\s*:?\s*([0-9]{3,6}\.?[0-9]{0,1})', re.I)
_TOTAL_TIME      = re.compile(r'(?:TT|TOTAL\s+TIME|AIRFRAME\s+TT|ATT)\s*:?\s*([0-9]{3,6}\.?[0-9]{0,1})', re.I)
_TSOH            = re.compile(r'\bTSOH\s*:?\s*([0-9]{1,6}\.?[0-9]{0,1})', re.I)
_DATE_PATTERNS   = [
    re.compile(r'\b(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\b'),
    re.compile(r'\b(\d{4}-\d{2}-\d{2})\b'),
    re.compile(r'\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})\b', re.I),
]
_ATA_CHAPTER     = re.compile(r'(?:ATA|CHAPTER)\s*:?\s*(\d{2}[-.]?\d{0,2})', re.I)
_FAR_REF         = re.compile(r'(?:FAR|CFR|§)\s*(?:Part\s+)?(\d{1,3}\.?\d{0,5})', re.I)
_RETURN_TO_SVC   = re.compile(
    r'(?:return(?:ed)?\s+to\s+service|aircraft\s+(?:is\s+)?returned|RTS\b|approved\s+for\s+return)',
    re.I
)
_ANNUAL_INSP     = re.compile(r'annual\s+inspection\s+(?:performed|completed|accomplished)', re.I)
_100HR_INSP      = re.compile(r'100[-\s]?hour\s+inspection\s+(?:performed|completed|accomplished)', re.I)


# ─── Main extractor ──────────────────────────────────────────────────────────

class MultiEngineExtractor:

    def __init__(self):
        self._openai_client: Optional[AsyncOpenAI] = None

    async def extract(
        self,
        image_bytes: bytes,
        page_text: str,            # already-extracted text (from basic parser)
        page_type: str,
        extraction_strategy: str,
        quality_score: float = 1.0,
        neighbor_context: Optional[str] = None,
    ) -> MultiEngineResult:
        """
        Run all applicable extraction lanes in parallel.

        Returns a MultiEngineResult with all lane outputs and combined candidates.
        """
        tasks = []

        # Always run Lane 4 (regex) — it is free and deterministic
        tasks.append(self._run_regex_lane(page_text))

        if extraction_strategy == "skip":
            # Blank or cover pages — skip AI lanes
            runs = await asyncio.gather(*tasks, return_exceptions=True)
            return self._build_result([r for r in runs if isinstance(r, ExtractionRunResult)])

        # Lane 1: Tesseract (skip if we already have good text)
        if quality_score < 0.85 or not page_text.strip():
            tasks.append(self._run_tesseract_lane(image_bytes))

        # Lane 2: GPT-4o Vision OCR (for scanned/low-quality or compliance-critical)
        needs_vision = (
            quality_score < 0.7
            or extraction_strategy in ("full_arbitration", "form_primary", "vlm_primary")
            or page_type in {"annual_inspection", "100hr_inspection", "ad_compliance",
                              "faa_form_337", "faa_form_8130"}
        )
        if needs_vision and image_bytes:
            tasks.append(self._run_gpt4o_vision_lane(image_bytes, page_type))

        # Lane 3: GPT-4o VLM structured extraction (field-level reasoning)
        if extraction_strategy in ("full_arbitration", "vlm_primary", "form_primary") or needs_vision:
            tasks.append(self._run_vlm_structured_lane(image_bytes, page_text, page_type, neighbor_context))

        results = await asyncio.gather(*tasks, return_exceptions=True)
        valid_runs = [r for r in results if isinstance(r, ExtractionRunResult)]

        return self._build_result(valid_runs)

    # ─── Lane 1: Tesseract ────────────────────────────────────────────────────

    async def _run_tesseract_lane(self, image_bytes: bytes) -> ExtractionRunResult:
        start = time.time()
        engine_name = "tesseract"
        try:
            loop = asyncio.get_event_loop()
            text, confidence = await loop.run_in_executor(None, self._tesseract_sync, image_bytes)
            candidates = _extract_regex_candidates(text)
            return ExtractionRunResult(
                engine_name=engine_name,
                engine_type="ocr",
                raw_text=text,
                raw_output={"text": text, "confidence": confidence},
                confidence_score=confidence,
                field_candidates=candidates,
                processing_ms=int((time.time() - start) * 1000),
            )
        except Exception as exc:
            logger.warning("Tesseract lane failed: %s", exc)
            return ExtractionRunResult(
                engine_name=engine_name,
                engine_type="ocr",
                raw_text="",
                raw_output={},
                confidence_score=0.0,
                field_candidates={},
                processing_ms=int((time.time() - start) * 1000),
                error_message=str(exc),
            )

    def _tesseract_sync(self, image_bytes: bytes) -> tuple[str, float]:
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        data = pytesseract.image_to_data(
            image,
            output_type=pytesseract.Output.DICT,
            config="--oem 3 --psm 6",
        )
        confidences = [c for c in data["conf"] if isinstance(c, (int, float)) and c >= 0]
        avg_conf = (sum(confidences) / len(confidences) / 100.0) if confidences else 0.0
        text = pytesseract.image_to_string(image, config="--oem 3 --psm 6")
        return text, avg_conf

    # ─── Lane 2: GPT-4o Vision OCR ───────────────────────────────────────────

    async def _run_gpt4o_vision_lane(self, image_bytes: bytes, page_type: str) -> ExtractionRunResult:
        start = time.time()
        engine_name = "gpt4o_vision"
        try:
            client = self._get_client()
            b64 = base64.b64encode(image_bytes).decode("utf-8")

            response = await client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are an expert OCR assistant for aviation maintenance documents "
                            "(logbooks, ADs, work orders, yellow tags, FAA forms). "
                            "Extract ALL text from the image exactly as written, preserving "
                            "layout, line breaks, handwriting, stamps, and annotations. "
                            "Do not summarize — output raw text only."
                        ),
                    },
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image_url",
                                "image_url": {"url": f"data:image/png;base64,{b64}", "detail": "high"},
                            },
                            {
                                "type": "text",
                                "text": f"Page type: {page_type}. Extract all text from this aviation document page.",
                            },
                        ],
                    },
                ],
                max_tokens=4096,
                temperature=0,
            )

            text = response.choices[0].message.content or ""
            candidates = _extract_regex_candidates(text)
            return ExtractionRunResult(
                engine_name=engine_name,
                engine_type="ocr",
                raw_text=text,
                raw_output={"text": text},
                confidence_score=0.88,
                field_candidates=candidates,
                processing_ms=int((time.time() - start) * 1000),
            )
        except Exception as exc:
            logger.warning("GPT-4o Vision lane failed: %s", exc)
            return ExtractionRunResult(
                engine_name=engine_name,
                engine_type="ocr",
                raw_text="",
                raw_output={},
                confidence_score=0.0,
                field_candidates={},
                processing_ms=int((time.time() - start) * 1000),
                error_message=str(exc),
            )

    # ─── Lane 3: GPT-4o VLM structured extraction ────────────────────────────

    async def _run_vlm_structured_lane(
        self,
        image_bytes: bytes,
        page_text: str,
        page_type: str,
        neighbor_context: Optional[str],
    ) -> ExtractionRunResult:
        start = time.time()
        engine_name = "gpt4o_vlm"
        try:
            client = self._get_client()
            b64 = base64.b64encode(image_bytes).decode("utf-8") if image_bytes else None

            neighbor_block = ""
            if neighbor_context:
                neighbor_block = f"\n\nNEIGHBORING PAGE CONTEXT:\n{neighbor_context[:800]}"

            system_msg = (
                "You are an expert aviation maintenance records analyst. "
                "Extract structured fields from this aviation document page. "
                "Return ONLY a valid JSON object with these fields (null if not found):\n"
                '{"entry_date": null, "tach_time": null, "total_time_airframe": null, '
                '"tsoh": null, "tsmoh": null, "work_description": null, "work_type": null, '
                '"return_to_service": null, "mechanic_name": null, "ap_cert_number": null, '
                '"ia_cert_number": null, "repair_station_cert": null, '
                '"part_numbers": [], "serial_numbers": [], "ad_references": [], '
                '"far_references": [], "manual_references": [], "inspection_type": null, '
                '"ata_chapter": null, "logbook_type": null, '
                '"confidence": 0.0, "reasoning": ""}'
            )

            content: list = []
            if b64:
                content.append({
                    "type": "image_url",
                    "image_url": {"url": f"data:image/png;base64,{b64}", "detail": "high"},
                })
            content.append({
                "type": "text",
                "text": (
                    f"Page type: {page_type}\n"
                    f"Extracted text:\n{(page_text or '')[:3000]}"
                    f"{neighbor_block}\n\n"
                    "Extract all structured fields as JSON."
                ),
            })

            response = await client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": system_msg},
                    {"role": "user", "content": content},
                ],
                max_tokens=2048,
                temperature=0,
                response_format={"type": "json_object"},
            )

            raw_json = response.choices[0].message.content or "{}"
            data = json.loads(raw_json)
            confidence = float(data.pop("confidence", 0.8))
            data.pop("reasoning", None)

            # Build field candidates from structured output
            candidates: dict = {}
            for field_name in FIELD_NAMES:
                val = data.get(field_name)
                if val is not None and val != "" and val != [] and val != {}:
                    candidates[field_name] = {
                        "value": val,
                        "confidence": confidence,
                        "normalized": str(val) if not isinstance(val, (list, dict)) else val,
                    }

            return ExtractionRunResult(
                engine_name=engine_name,
                engine_type="vlm",
                raw_text=str(data.get("work_description", "")),
                raw_output=data,
                confidence_score=confidence,
                field_candidates=candidates,
                processing_ms=int((time.time() - start) * 1000),
            )
        except Exception as exc:
            logger.warning("VLM structured lane failed: %s", exc)
            return ExtractionRunResult(
                engine_name=engine_name,
                engine_type="vlm",
                raw_text="",
                raw_output={},
                confidence_score=0.0,
                field_candidates={},
                processing_ms=int((time.time() - start) * 1000),
                error_message=str(exc),
            )

    # ─── Lane 4: Regex/rule-based ─────────────────────────────────────────────

    async def _run_regex_lane(self, page_text: str) -> ExtractionRunResult:
        start = time.time()
        try:
            candidates = _extract_regex_candidates(page_text)
            confidence = 0.95 if candidates else 0.0
            return ExtractionRunResult(
                engine_name="regex_patterns",
                engine_type="rule_based",
                raw_text=page_text,
                raw_output={"candidates": candidates},
                confidence_score=confidence,
                field_candidates=candidates,
                processing_ms=int((time.time() - start) * 1000),
            )
        except Exception as exc:
            logger.warning("Regex lane failed: %s", exc)
            return ExtractionRunResult(
                engine_name="regex_patterns",
                engine_type="rule_based",
                raw_text="",
                raw_output={},
                confidence_score=0.0,
                field_candidates={},
                processing_ms=int((time.time() - start) * 1000),
                error_message=str(exc),
            )

    # ─── Build combined result ────────────────────────────────────────────────

    def _build_result(self, runs: list[ExtractionRunResult]) -> MultiEngineResult:
        combined: dict = {}
        for run in runs:
            for field_name, candidate in run.field_candidates.items():
                if field_name not in combined:
                    combined[field_name] = []
                combined[field_name].append({
                    "engine": run.engine_name,
                    "value": candidate.get("value"),
                    "confidence": candidate.get("confidence", run.confidence_score),
                    "normalized": candidate.get("normalized"),
                })
        return MultiEngineResult(runs=runs, combined_candidates=combined)

    def _get_client(self) -> AsyncOpenAI:
        if self._openai_client is None:
            api_key = os.getenv("OPENAI_API_KEY", "")
            if not api_key:
                raise RuntimeError("OPENAI_API_KEY environment variable is not set")
            self._openai_client = AsyncOpenAI(api_key=api_key)
        return self._openai_client


# ─── Regex candidate extractor ───────────────────────────────────────────────

def _extract_regex_candidates(text: str) -> dict:
    """Extract structured fields from text using deterministic patterns."""
    if not text:
        return {}

    candidates: dict = {}

    # AD references
    ads = _AD_PATTERN.findall(text)
    if ads:
        candidates["ad_references"] = {
            "value": ads,
            "confidence": 0.95,
            "normalized": ads,
        }

    # Part numbers
    parts = _PART_NUMBER.findall(text)
    if parts:
        candidates["part_numbers"] = {
            "value": parts,
            "confidence": 0.90,
            "normalized": parts,
        }

    # Serial numbers
    serials = _SERIAL_NUMBER.findall(text)
    if serials:
        candidates["serial_numbers"] = {
            "value": serials,
            "confidence": 0.90,
            "normalized": serials,
        }

    # A&P certificate
    ap = _AP_CERT.search(text)
    if ap:
        candidates["ap_cert_number"] = {
            "value": ap.group(1),
            "confidence": 0.90,
            "normalized": ap.group(1),
        }

    # IA certificate
    ia = _IA_CERT.search(text)
    if ia:
        candidates["ia_cert_number"] = {
            "value": ia.group(1),
            "confidence": 0.90,
            "normalized": ia.group(1),
        }

    # Tach time
    tach = _TACH.search(text)
    if tach:
        candidates["tach_time"] = {
            "value": tach.group(1),
            "confidence": 0.85,
            "normalized": tach.group(1),
        }

    # Total time
    tt = _TOTAL_TIME.search(text)
    if tt:
        candidates["total_time_airframe"] = {
            "value": tt.group(1),
            "confidence": 0.85,
            "normalized": tt.group(1),
        }

    # TSOH
    tsoh = _TSOH.search(text)
    if tsoh:
        candidates["tsoh"] = {
            "value": tsoh.group(1),
            "confidence": 0.90,
            "normalized": tsoh.group(1),
        }

    # Entry date — take the first plausible date found
    for pattern in _DATE_PATTERNS:
        m = pattern.search(text)
        if m and "entry_date" not in candidates:
            candidates["entry_date"] = {
                "value": m.group(1),
                "confidence": 0.75,
                "normalized": m.group(1),
            }

    # ATA chapter
    ata = _ATA_CHAPTER.search(text)
    if ata:
        candidates["ata_chapter"] = {
            "value": ata.group(1),
            "confidence": 0.85,
            "normalized": ata.group(1),
        }

    # FAR references
    fars = _FAR_REF.findall(text)
    if fars:
        candidates["far_references"] = {
            "value": fars,
            "confidence": 0.85,
            "normalized": fars,
        }

    # Return to service language
    if _RETURN_TO_SVC.search(text):
        candidates["return_to_service"] = {
            "value": True,
            "confidence": 0.90,
            "normalized": "true",
        }

    # Inspection type
    if _ANNUAL_INSP.search(text):
        candidates["inspection_type"] = {
            "value": "annual",
            "confidence": 0.92,
            "normalized": "annual",
        }
    elif _100HR_INSP.search(text):
        candidates["inspection_type"] = {
            "value": "100hr",
            "confidence": 0.92,
            "normalized": "100hr",
        }

    return candidates
