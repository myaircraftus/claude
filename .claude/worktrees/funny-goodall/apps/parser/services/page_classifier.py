"""
Page classification for aviation documents.

Classifies each page into one of 25 categories using a two-stage approach:
  1. Rule-based pre-classification (fast, deterministic) based on page image stats
  2. GPT-4o Vision classification with structured output for ambiguous pages

The classification drives the extraction strategy:
  - Which engines to run
  - How aggressively to preprocess
  - Whether VLM reasoning mode is needed
  - Whether table extraction mode is needed
"""

import base64
import io
import json
import logging
import os
import re
from dataclasses import dataclass
from typing import Optional

from openai import OpenAI
from PIL import Image

logger = logging.getLogger(__name__)

# ─── Page type taxonomy ───────────────────────────────────────────────────────

PAGE_TYPES = [
    "cover",
    "index_contents",
    "engine_log",
    "prop_log",
    "airframe_log",
    "avionics_log",
    "maintenance_entry",
    "annual_inspection",
    "100hr_inspection",
    "progressive_inspection",
    "ad_compliance",
    "faa_form_337",
    "faa_form_8130",
    "work_order",
    "yellow_tag",
    "discrepancy_sheet",
    "status_sheet",
    "weight_and_balance",
    "stc_reference",
    "table_heavy",
    "graph_diagram_heavy",
    "mixed_attachment",
    "blank",
    "unknown_needs_review",
    "other",
]

# Page types that require VLM reasoning mode
VLM_PRIORITY_TYPES = {
    "faa_form_337",
    "faa_form_8130",
    "yellow_tag",
    "weight_and_balance",
    "graph_diagram_heavy",
    "mixed_attachment",
    "unknown_needs_review",
}

# Page types that are compliance-critical (stricter thresholds)
COMPLIANCE_CRITICAL_TYPES = {
    "annual_inspection",
    "100hr_inspection",
    "progressive_inspection",
    "ad_compliance",
    "faa_form_337",
    "faa_form_8130",
    "return_to_service",
}

# Keywords for fast rule-based detection
_KEYWORDS = {
    "annual_inspection":    [r"annual\s+inspection", r"annual\s+insp"],
    "100hr_inspection":     [r"100[-\s]hour", r"100\s*hr", r"100-hr"],
    "ad_compliance":        [r"airworthiness\s+directive", r"\bAD\s+\d{4}-\d{2}-\d{2}", r"AD\s+compliance"],
    "faa_form_337":         [r"form\s*337", r"major\s+repair", r"major\s+alteration"],
    "faa_form_8130":        [r"8130[-\s]?3", r"airworthiness\s+approval"],
    "yellow_tag":           [r"serviceable\s+tag", r"yellow\s+tag", r"removed\s+from\s+service"],
    "weight_and_balance":   [r"weight\s+and\s+balance", r"w\s*&\s*b\s+report", r"datum\s+arm\s+moment"],
    "work_order":           [r"work\s+order", r"wo\s*#", r"shop\s+order"],
    "cover":                [r"table\s+of\s+contents", r"aircraft\s+log\s*book", r"maintenance\s+record"],
    "engine_log":           [r"engine\s+log", r"power\s+plant", r"lycoming", r"continental\s+motors"],
    "prop_log":             [r"propeller\s+log", r"prop\s+log", r"hartzell", r"mccauley"],
}

_COMPILED = {
    page_type: [re.compile(p, re.IGNORECASE) for p in patterns]
    for page_type, patterns in _KEYWORDS.items()
}


@dataclass
class ClassificationResult:
    page_type: str
    confidence: float          # 0.0 – 1.0
    is_compliance_critical: bool
    needs_vlm_priority: bool
    needs_table_mode: bool
    needs_diagram_mode: bool
    extraction_strategy: str   # 'text_primary','vlm_primary','form_primary','pattern_primary','full_arbitration'
    classification_method: str # 'rule_based','vlm','combined'
    raw_vlm_response: Optional[str] = None


class PageClassifier:
    """Classify aviation document pages by type."""

    def __init__(self):
        self._openai_client: Optional[OpenAI] = None

    def classify(
        self,
        page_text: str,
        image_bytes: Optional[bytes] = None,
        quality_score: float = 1.0,
    ) -> ClassificationResult:
        """
        Classify a page. Uses rule-based approach first; falls back to VLM
        if text is insufficient or quality is low.

        Args:
            page_text:    Extracted text from the page (may be empty for scanned).
            image_bytes:  PNG bytes of the (preprocessed) page image.
            quality_score: Page quality score from preprocessor.
        """
        # Stage 1: rule-based from text
        rule_result = self._rule_based_classify(page_text)

        # If high confidence or no image, use rule result
        if rule_result.confidence >= 0.85 or image_bytes is None:
            return rule_result

        # Stage 2: VLM classification for low-confidence or poor-quality pages
        try:
            vlm_result = self._vlm_classify(image_bytes, page_text, quality_score)
            # Combine: take VLM if it is more confident, else take rule result
            if vlm_result.confidence >= rule_result.confidence:
                return vlm_result
        except Exception as exc:
            logger.warning("VLM page classification failed: %s", exc)

        return rule_result

    # ─── Rule-based ──────────────────────────────────────────────────────────

    def _rule_based_classify(self, text: str) -> ClassificationResult:
        """Fast keyword/pattern scan of page text."""
        if not text or not text.strip():
            return self._build_result("unknown_needs_review", 0.4, "rule_based")

        text_lower = text.lower()
        best_type = "maintenance_entry"
        best_score = 0.3

        for page_type, patterns in _COMPILED.items():
            hits = sum(1 for p in patterns if p.search(text))
            if hits:
                score = min(0.95, 0.5 + 0.15 * hits)
                if score > best_score:
                    best_score = score
                    best_type = page_type

        # Basic heuristics
        if best_score < 0.5:
            if len(text.strip()) < 50:
                best_type = "blank"
                best_score = 0.8
            elif re.search(r"tach|hobbs|total\s+time|airframe\s+t", text, re.I):
                best_type = "maintenance_entry"
                best_score = 0.65
            elif re.search(r"part\s+number|p/n|serial\s+number|s/n", text, re.I):
                best_type = "maintenance_entry"
                best_score = 0.55

        return self._build_result(best_type, best_score, "rule_based")

    # ─── VLM classification ───────────────────────────────────────────────────

    def _vlm_classify(
        self,
        image_bytes: bytes,
        page_text: str,
        quality_score: float,
    ) -> ClassificationResult:
        """Use GPT-4o Vision to classify the page type."""
        client = self._get_openai_client()
        b64 = base64.b64encode(image_bytes).decode("utf-8")

        type_list = "\n".join(f"- {t}" for t in PAGE_TYPES)
        text_snippet = (page_text or "")[:500]

        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are an aviation document classification expert. "
                        "Classify the provided aircraft maintenance document page into exactly ONE of these types:\n"
                        f"{type_list}\n\n"
                        "Respond ONLY with a JSON object: "
                        '{"page_type": "<type>", "confidence": <0.0-1.0>, "reasoning": "<brief>"}'
                    ),
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/png;base64,{b64}",
                                "detail": "low",
                            },
                        },
                        {
                            "type": "text",
                            "text": (
                                f"Page quality score: {quality_score:.2f}\n"
                                f"Extracted text snippet: {text_snippet}\n\n"
                                "Classify this aviation document page."
                            ),
                        },
                    ],
                },
            ],
            max_tokens=150,
            temperature=0,
        )

        raw = response.choices[0].message.content or ""
        try:
            data = json.loads(raw)
            page_type = data.get("page_type", "unknown_needs_review")
            if page_type not in PAGE_TYPES:
                page_type = "unknown_needs_review"
            confidence = float(data.get("confidence", 0.7))
        except Exception:
            page_type = "unknown_needs_review"
            confidence = 0.5

        return self._build_result(page_type, confidence, "vlm", raw)

    # ─── Helpers ─────────────────────────────────────────────────────────────

    def _build_result(
        self,
        page_type: str,
        confidence: float,
        method: str,
        raw_vlm: Optional[str] = None,
    ) -> ClassificationResult:
        needs_vlm = page_type in VLM_PRIORITY_TYPES
        is_critical = page_type in COMPLIANCE_CRITICAL_TYPES
        needs_table = page_type in {"table_heavy", "weight_and_balance", "status_sheet"}
        needs_diagram = page_type in {"graph_diagram_heavy", "mixed_attachment"}

        # Determine extraction strategy
        if page_type in {"blank", "cover", "index_contents"}:
            strategy = "skip"
        elif page_type in {"faa_form_337", "faa_form_8130", "yellow_tag", "work_order"}:
            strategy = "form_primary"
        elif page_type in {"graph_diagram_heavy", "weight_and_balance"}:
            strategy = "vlm_primary"
        elif page_type in {"unknown_needs_review", "mixed_attachment"}:
            strategy = "full_arbitration"
        elif confidence >= 0.85:
            strategy = "text_primary"
        else:
            strategy = "full_arbitration"

        return ClassificationResult(
            page_type=page_type,
            confidence=confidence,
            is_compliance_critical=is_critical,
            needs_vlm_priority=needs_vlm,
            needs_table_mode=needs_table,
            needs_diagram_mode=needs_diagram,
            extraction_strategy=strategy,
            classification_method=method,
            raw_vlm_response=raw_vlm,
        )

    def _get_openai_client(self) -> OpenAI:
        if self._openai_client is None:
            api_key = os.getenv("OPENAI_API_KEY", "")
            if not api_key:
                raise RuntimeError("OPENAI_API_KEY environment variable is not set")
            self._openai_client = OpenAI(api_key=api_key)
        return self._openai_client
