"""
Godmode accuracy pipeline — POST /pipeline

Full multi-stage processing for a single document page (or all pages of a PDF):

  Stage 1  — Image preprocessing (orientation, quality, contrast)
  Stage 2  — Page classification (VLM + rule-based)
  Stage 3  — Multi-engine extraction (4 parallel lanes)
  Stage 4  — Field validation (deterministic aviation rules)
  Stage 5  — Arbitration (disposition decision + review packet)
  Stage 6  — Return structured result (trigger.dev stores in DB)

This router does NOT write to Supabase directly.
It returns a rich payload that the Trigger.dev job persists.
"""

import asyncio
import base64
import io
import logging
import time
from typing import Optional

import fitz  # PyMuPDF
import httpx
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from services.image_preprocessor import ImagePreprocessor
from services.page_classifier import PageClassifier
from services.multi_engine_extractor import MultiEngineExtractor
from services.field_validator import FieldValidator
from services.arbitration_engine import ArbitrationEngine

logger = logging.getLogger(__name__)

router = APIRouter()

# ─── Request / Response models ────────────────────────────────────────────────

class PipelineRequest(BaseModel):
    document_id: str
    file_url: str               # signed URL for PDF or image
    org_id: str
    aircraft_id: Optional[str] = None
    doc_type: str               # 'logbook','ad','work_order', etc.
    title: str
    # Optional: supply aircraft context for plausibility checks
    aircraft_context: Optional[dict] = None
    # Optional: limit to specific pages (1-based); None = all pages
    page_numbers: Optional[list[int]] = None


class PagePipelineResult(BaseModel):
    page_number: int
    page_type: str
    classification_confidence: float
    extraction_strategy: str
    is_compliance_critical: bool
    page_quality_score: float
    is_blank: bool
    is_double_spread: bool
    preprocessing_metadata: dict

    # Extraction runs (for DB storage)
    extraction_runs: list[dict]

    # Field candidates aggregated across all engines
    combined_candidates: dict

    # Validation results per field
    validation_results: dict

    # Field conflicts
    conflicts: list[dict]

    # Arbitration
    disposition: str
    arbitration_score: float
    review_reasons: list[str]
    needs_human_review: bool

    # Recommended canonical fields
    recommended_fields: dict

    # Full review packet for human reviewer
    review_packet: dict

    # Best text (from highest-confidence engine)
    best_text: str


class PipelineResponse(BaseModel):
    document_id: str
    is_text_native: bool
    total_pages: int
    processed_pages: int
    page_results: list[PagePipelineResult]
    auto_accepted_count: int
    review_required_count: int
    rejected_count: int


# ─── Helpers ─────────────────────────────────────────────────────────────────

async def _download_file(url: str) -> bytes:
    async with httpx.AsyncClient(timeout=120.0, follow_redirects=True) as client:
        response = await client.get(url)
        response.raise_for_status()
        return response.content


def _render_page_to_png(page: fitz.Page, dpi: int = 300) -> bytes:
    zoom = dpi / 72.0
    mat = fitz.Matrix(zoom, zoom)
    pix = page.get_pixmap(matrix=mat, alpha=False)
    return pix.tobytes("png")


def _detect_text_native(doc: fitz.Document, sample: int = 3) -> bool:
    sample_count = min(sample, len(doc))
    text_rich = 0
    for i in range(sample_count):
        text = doc[i].get_text("text")
        if len(text.strip()) >= 100:
            text_rich += 1
    return text_rich > (sample_count // 2)


# ─── Single-page pipeline ─────────────────────────────────────────────────────

async def _process_page(
    page_number: int,
    img_bytes: bytes,
    page_text: str,
    doc_type: str,
    aircraft_context: Optional[dict],
    neighbor_text: Optional[str] = None,
) -> PagePipelineResult:
    """Run the full pipeline for a single page."""
    start = time.time()

    # Stage 1: Preprocess
    preprocessor = ImagePreprocessor()
    prep = preprocessor.process(img_bytes)

    # Stage 2: Classify
    classifier = PageClassifier()
    classification = classifier.classify(
        page_text=page_text,
        image_bytes=prep.processed_bytes,
        quality_score=prep.quality_score,
    )

    if classification.page_type == "blank":
        return PagePipelineResult(
            page_number=page_number,
            page_type="blank",
            classification_confidence=classification.confidence,
            extraction_strategy="skip",
            is_compliance_critical=False,
            page_quality_score=prep.quality_score,
            is_blank=True,
            is_double_spread=prep.is_double_spread,
            preprocessing_metadata=prep.preprocessing_metadata,
            extraction_runs=[],
            combined_candidates={},
            validation_results={},
            conflicts=[],
            disposition="auto_accept",
            arbitration_score=1.0,
            review_reasons=[],
            needs_human_review=False,
            recommended_fields={},
            review_packet={},
            best_text="",
        )

    # Stage 3: Multi-engine extraction
    extractor = MultiEngineExtractor()
    multi_result = await extractor.extract(
        image_bytes=prep.processed_bytes,
        page_text=page_text,
        page_type=classification.page_type,
        extraction_strategy=classification.extraction_strategy,
        quality_score=prep.quality_score,
        neighbor_context=neighbor_text,
    )

    # Stage 4: Validate fields
    validator = FieldValidator(aircraft_context)

    # Flatten combined_candidates to {field_name: {value, confidence}}
    flat_candidates: dict = {}
    for field_name, candidates in multi_result.combined_candidates.items():
        if candidates:
            # Pick best confidence candidate for validation
            best = max(candidates, key=lambda c: float(c.get("confidence", 0)))
            flat_candidates[field_name] = best

    validation_results = validator.validate_all(flat_candidates)

    # Stage 5: Arbitrate
    arbitrator = ArbitrationEngine()
    runs_as_dicts = [
        {
            "engine_name": r.engine_name,
            "engine_type": r.engine_type,
            "raw_text": r.raw_text,
            "raw_output": r.raw_output,
            "confidence_score": r.confidence_score,
            "field_candidates": r.field_candidates,
            "processing_ms": r.processing_ms,
            "error_message": r.error_message,
        }
        for r in multi_result.runs
    ]

    arb_result = arbitrator.arbitrate(
        combined_candidates=multi_result.combined_candidates,
        validation_results=validation_results,
        extraction_runs=runs_as_dicts,
        page_type=classification.page_type,
        classification_confidence=classification.confidence,
        page_quality_score=prep.quality_score,
        is_compliance_critical=classification.is_compliance_critical,
    )

    # Best text = text from highest-confidence run
    best_run = max(
        (r for r in multi_result.runs if r.raw_text),
        key=lambda r: r.confidence_score,
        default=None,
    )
    best_text = best_run.raw_text if best_run else page_text

    # Serialize validation results
    val_dict: dict = {}
    for field_name, vr in validation_results.items():
        val_dict[field_name] = {
            "validation_status": vr.validation_status,
            "validation_notes": vr.validation_notes,
            "confidence_adjustment": vr.confidence_adjustment,
            "normalized_value": vr.normalized_value,
        }

    logger.info(
        "Page %d processed: type=%s disposition=%s score=%.2f time=%dms",
        page_number,
        classification.page_type,
        arb_result.disposition,
        arb_result.arbitration_score,
        int((time.time() - start) * 1000),
    )

    return PagePipelineResult(
        page_number=page_number,
        page_type=classification.page_type,
        classification_confidence=classification.confidence,
        extraction_strategy=classification.extraction_strategy,
        is_compliance_critical=classification.is_compliance_critical,
        page_quality_score=prep.quality_score,
        is_blank=prep.is_blank,
        is_double_spread=prep.is_double_spread,
        preprocessing_metadata=prep.preprocessing_metadata,
        extraction_runs=runs_as_dicts,
        combined_candidates=multi_result.combined_candidates,
        validation_results=val_dict,
        conflicts=arb_result.conflicts,
        disposition=arb_result.disposition,
        arbitration_score=arb_result.arbitration_score,
        review_reasons=arb_result.review_reasons,
        needs_human_review=arb_result.needs_human_review,
        recommended_fields=arb_result.recommended_fields,
        review_packet=arb_result.review_packet,
        best_text=best_text,
    )


# ─── Main endpoint ────────────────────────────────────────────────────────────

@router.post("", response_model=PipelineResponse)
async def run_pipeline(req: PipelineRequest) -> PipelineResponse:
    """
    Run the full multi-stage godmode accuracy pipeline on a document.

    Downloads the PDF/image, processes each page through all pipeline stages,
    and returns structured results per page.
    """
    logger.info(
        "Pipeline start document_id=%s doc_type=%s title=%r",
        req.document_id,
        req.doc_type,
        req.title,
    )

    try:
        file_bytes = await _download_file(req.file_url)
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to download file: {exc}",
        ) from exc

    # Determine if PDF or image
    is_pdf = file_bytes[:4] == b"%PDF" or req.file_url.lower().endswith(".pdf")

    if is_pdf:
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        is_text_native = _detect_text_native(doc)
        total_pages = len(doc)
        page_numbers = req.page_numbers or list(range(1, total_pages + 1))

        # Build (page_number, img_bytes, page_text) list
        page_inputs: list[tuple[int, bytes, str]] = []
        for page_num in page_numbers:
            if page_num < 1 or page_num > total_pages:
                continue
            page = doc[page_num - 1]
            img_bytes = _render_page_to_png(page, dpi=300)
            page_text = page.get_text("text") if is_text_native else ""
            page_inputs.append((page_num, img_bytes, page_text))

        doc.close()
    else:
        # Single image
        is_text_native = False
        total_pages = 1
        page_inputs = [(1, file_bytes, "")]

    # Process pages concurrently (max 3 at a time to avoid OOM / rate limits)
    page_results: list[PagePipelineResult] = []
    semaphore = asyncio.Semaphore(3)

    async def process_with_semaphore(
        page_num: int,
        img_bytes: bytes,
        page_text: str,
        idx: int,
    ) -> PagePipelineResult:
        # Neighbor context: use previous page text
        neighbor = page_inputs[idx - 1][2] if idx > 0 else None
        async with semaphore:
            return await _process_page(
                page_number=page_num,
                img_bytes=img_bytes,
                page_text=page_text,
                doc_type=req.doc_type,
                aircraft_context=req.aircraft_context,
                neighbor_text=neighbor,
            )

    tasks = [
        process_with_semaphore(page_num, img, text, idx)
        for idx, (page_num, img, text) in enumerate(page_inputs)
    ]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    for res in results:
        if isinstance(res, PagePipelineResult):
            page_results.append(res)
        elif isinstance(res, Exception):
            logger.error("Page processing failed: %s", res)

    # Sort by page number
    page_results.sort(key=lambda r: r.page_number)

    auto_accepted   = sum(1 for r in page_results if r.disposition == "auto_accept")
    review_required = sum(1 for r in page_results if r.disposition in ("review_required", "accept_with_caution"))
    rejected        = sum(1 for r in page_results if r.disposition == "reject")

    logger.info(
        "Pipeline done document_id=%s pages=%d auto_accept=%d review=%d reject=%d",
        req.document_id,
        len(page_results),
        auto_accepted,
        review_required,
        rejected,
    )

    return PipelineResponse(
        document_id=req.document_id,
        is_text_native=is_text_native,
        total_pages=total_pages,
        processed_pages=len(page_results),
        page_results=page_results,
        auto_accepted_count=auto_accepted,
        review_required_count=review_required,
        rejected_count=rejected,
    )
