"""
PDF parsing service.

Strategy:
  1. Open the PDF with PyMuPDF (fitz).
  2. Detect whether it is text-native (embedded text) or image-only.
  3. For text-native docs: extract text directly from each page.
  4. For image-only (scanned) docs: render each page at 300 dpi, run
     Tesseract OCR, fall back to GPT-4o Vision if Tesseract confidence
     is below 0.5.
"""

import base64
import io
import logging
import os
from typing import Optional

import fitz  # PyMuPDF
import pytesseract
from PIL import Image
from openai import OpenAI
from pydantic import BaseModel

logger = logging.getLogger(__name__)

# Minimum Tesseract average confidence to skip GPT-4o fallback (0–1 scale)
OCR_CONFIDENCE_THRESHOLD = 0.5
# Minimum chars on a page to consider it text-native
TEXT_NATIVE_MIN_CHARS = 100
# Number of pages to sample when deciding text-native vs scanned
TEXT_NATIVE_SAMPLE_PAGES = 3


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class PageResult(BaseModel):
    page_number: int          # 1-based
    text: str
    ocr_confidence: float     # 0.0–1.0 (1.0 for text-native pages)
    image_bytes: Optional[bytes] = None  # PNG bytes, populated for OCR pages
    word_count: int
    char_count: int

    model_config = {"arbitrary_types_allowed": True}


class ParseResult(BaseModel):
    document_id: str
    is_text_native: bool
    pages: list[PageResult]
    page_count: int


# ---------------------------------------------------------------------------
# PDFParser
# ---------------------------------------------------------------------------

class PDFParser:
    """Parse a PDF (bytes) into per-page text with OCR fallback."""

    def __init__(self):
        self._openai_client: Optional[OpenAI] = None

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def parse(
        self,
        pdf_bytes: bytes,
        document_id: str,
        doc_type: str,
        title: str,
    ) -> ParseResult:
        """
        Parse pdf_bytes and return a ParseResult containing one PageResult
        per page.
        """
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        is_text_native = self._detect_text_native(doc)

        pages: list[PageResult] = []
        for page_index in range(len(doc)):
            page = doc[page_index]
            page_number = page_index + 1  # 1-based

            if is_text_native:
                text = page.get_text("text")  # type: ignore[arg-type]
                pages.append(
                    PageResult(
                        page_number=page_number,
                        text=text,
                        ocr_confidence=1.0,
                        word_count=len(text.split()),
                        char_count=len(text),
                    )
                )
            else:
                img_bytes = self._render_page_to_png(page)
                text, confidence = self._run_ocr(img_bytes)
                pages.append(
                    PageResult(
                        page_number=page_number,
                        text=text,
                        ocr_confidence=confidence,
                        image_bytes=img_bytes,
                        word_count=len(text.split()),
                        char_count=len(text),
                    )
                )

        doc.close()

        return ParseResult(
            document_id=document_id,
            is_text_native=is_text_native,
            pages=pages,
            page_count=len(pages),
        )

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _detect_text_native(self, doc: fitz.Document) -> bool:
        """
        Sample the first TEXT_NATIVE_SAMPLE_PAGES pages.  If the majority
        contain more than TEXT_NATIVE_MIN_CHARS of extractable text, the
        document is considered text-native.
        """
        sample_count = min(TEXT_NATIVE_SAMPLE_PAGES, len(doc))
        text_rich = 0
        for i in range(sample_count):
            text = doc[i].get_text("text")  # type: ignore[arg-type]
            if len(text.strip()) >= TEXT_NATIVE_MIN_CHARS:
                text_rich += 1

        return text_rich > (sample_count // 2)

    def _render_page_to_png(self, page: fitz.Page, dpi: int = 300) -> bytes:
        """Render a fitz Page to PNG bytes at the specified DPI."""
        zoom = dpi / 72.0
        mat = fitz.Matrix(zoom, zoom)
        pix = page.get_pixmap(matrix=mat, alpha=False)  # type: ignore[call-arg]
        return pix.tobytes("png")

    def _run_ocr(self, img_bytes: bytes) -> tuple[str, float]:
        """
        Run Tesseract OCR on the given PNG bytes.

        Returns (text, confidence) where confidence is 0.0–1.0.
        If Tesseract confidence < OCR_CONFIDENCE_THRESHOLD, falls back to
        GPT-4o Vision OCR.
        """
        try:
            image = Image.open(io.BytesIO(img_bytes)).convert("RGB")
            data = pytesseract.image_to_data(
                image,
                output_type=pytesseract.Output.DICT,
                config="--oem 3 --psm 6",
            )

            # Calculate average confidence from Tesseract output
            confidences = [
                c for c in data["conf"] if isinstance(c, (int, float)) and c >= 0
            ]
            avg_conf = (sum(confidences) / len(confidences) / 100.0) if confidences else 0.0

            text = pytesseract.image_to_string(
                image,
                config="--oem 3 --psm 6",
            )

            if avg_conf < OCR_CONFIDENCE_THRESHOLD:
                logger.info(
                    "Tesseract confidence %.2f < %.2f – falling back to GPT-4o Vision",
                    avg_conf,
                    OCR_CONFIDENCE_THRESHOLD,
                )
                return self._gpt4o_vision_ocr(img_bytes)

            return text, avg_conf

        except Exception as exc:  # noqa: BLE001
            logger.warning("Tesseract OCR failed (%s) – trying GPT-4o Vision", exc)
            return self._gpt4o_vision_ocr(img_bytes)

    def _gpt4o_vision_ocr(self, img_bytes: bytes) -> tuple[str, float]:
        """
        Use GPT-4o Vision to extract text from an image.

        Returns (text, 0.9) – we assign a fixed high confidence since GPT-4o
        Vision is used as the high-quality fallback.
        """
        client = self._get_openai_client()

        b64_image = base64.b64encode(img_bytes).decode("utf-8")

        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are an expert OCR assistant specializing in aviation documents "
                        "(maintenance logbooks, POH/AFM manuals, airworthiness directives). "
                        "Extract ALL text from the provided image exactly as it appears, "
                        "preserving layout, line breaks, and formatting. "
                        "Do not add commentary or summaries – output only the extracted text."
                    ),
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/png;base64,{b64_image}",
                                "detail": "high",
                            },
                        },
                        {
                            "type": "text",
                            "text": "Please extract all text from this aviation document page.",
                        },
                    ],
                },
            ],
            max_tokens=4096,
            temperature=0,
        )

        text = response.choices[0].message.content or ""
        return text, 0.9

    def _get_openai_client(self) -> OpenAI:
        if self._openai_client is None:
            api_key = os.getenv("OPENAI_API_KEY", "")
            if not api_key:
                raise RuntimeError("OPENAI_API_KEY environment variable is not set")
            self._openai_client = OpenAI(api_key=api_key)
        return self._openai_client
