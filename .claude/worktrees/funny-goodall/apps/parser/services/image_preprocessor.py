"""
Image preprocessing pipeline for aviation document pages.

Runs before any OCR/extraction to improve page quality and detect
characteristics that affect extraction strategy selection.

Operations performed (using Pillow only — no cv2 dependency):
  - Orientation detection and correction (via page dimensions / Tesseract OSD)
  - Grayscale conversion
  - Contrast enhancement (CLAHE-equivalent via ImageOps)
  - Sharpening
  - Noise reduction (median filter)
  - Quality scoring (measures blur, contrast, brightness variance)
  - Blank page detection
  - Double-spread detection (wide aspect ratio)
"""

import io
import logging
import math
import os
from dataclasses import dataclass, field
from typing import Optional

from PIL import Image, ImageEnhance, ImageFilter, ImageOps, ImageStat

logger = logging.getLogger(__name__)

# Quality thresholds
BLANK_PAGE_BRIGHTNESS_THRESHOLD = 240   # avg pixel brightness > this = likely blank
BLANK_PAGE_STD_THRESHOLD = 8            # std dev < this = very uniform = likely blank
SPREAD_ASPECT_RATIO_THRESHOLD = 1.8     # width/height > this = double-spread page
LOW_QUALITY_SCORE_THRESHOLD = 0.4       # score < this = needs extra attention


@dataclass
class PreprocessingResult:
    """Output of the preprocessing pipeline for a single page."""
    original_bytes: bytes
    processed_bytes: bytes
    width: int
    height: int
    orientation_degrees: int             # 0, 90, 180, 270
    is_blank: bool
    is_double_spread: bool
    quality_score: float                 # 0.0 – 1.0
    avg_brightness: float
    contrast_score: float
    sharpness_score: float
    needs_vlm_assist: bool              # true when quality is very low
    preprocessing_metadata: dict = field(default_factory=dict)


class ImagePreprocessor:
    """
    Preprocess a page image (PNG/JPEG bytes) for OCR.

    Usage:
        preprocessor = ImagePreprocessor()
        result = preprocessor.process(png_bytes)
    """

    def process(self, image_bytes: bytes) -> PreprocessingResult:
        """
        Run the full preprocessing pipeline on raw image bytes.

        Returns a PreprocessingResult with the processed image and metadata.
        """
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        original_size = (image.width, image.height)

        # 1. Orientation correction
        image, orientation_degrees = self._correct_orientation(image)

        # 2. Grayscale for analysis (keep colour version for storage)
        gray = image.convert("L")

        # 3. Measure original quality
        avg_brightness = self._measure_brightness(gray)
        contrast_score = self._measure_contrast(gray)
        sharpness_score = self._measure_sharpness(gray)

        # 4. Detect blank page
        is_blank = self._detect_blank(gray, avg_brightness)

        # 5. Detect double-spread
        is_double_spread = self._detect_double_spread(image)

        # 6. Enhancement pipeline (applied to colour image)
        if not is_blank:
            image = self._enhance(image, avg_brightness, contrast_score)

        # 7. Compute final quality score
        gray_processed = image.convert("L")
        quality_score = self._compute_quality_score(
            gray_processed,
            avg_brightness,
            contrast_score,
            sharpness_score,
        )

        # 8. Serialize processed image back to PNG bytes
        buf = io.BytesIO()
        image.save(buf, format="PNG", optimize=False)
        processed_bytes = buf.getvalue()

        needs_vlm_assist = quality_score < LOW_QUALITY_SCORE_THRESHOLD and not is_blank

        return PreprocessingResult(
            original_bytes=image_bytes,
            processed_bytes=processed_bytes,
            width=image.width,
            height=image.height,
            orientation_degrees=orientation_degrees,
            is_blank=is_blank,
            is_double_spread=is_double_spread,
            quality_score=quality_score,
            avg_brightness=avg_brightness,
            contrast_score=contrast_score,
            sharpness_score=sharpness_score,
            needs_vlm_assist=needs_vlm_assist,
            preprocessing_metadata={
                "original_width": original_size[0],
                "original_height": original_size[1],
                "processed_width": image.width,
                "processed_height": image.height,
                "orientation_corrected": orientation_degrees != 0,
                "orientation_degrees": orientation_degrees,
                "is_blank": is_blank,
                "is_double_spread": is_double_spread,
                "quality_score": round(quality_score, 4),
                "avg_brightness": round(avg_brightness, 2),
                "contrast_score": round(contrast_score, 4),
                "sharpness_score": round(sharpness_score, 4),
                "needs_vlm_assist": needs_vlm_assist,
            },
        )

    # ─── Private helpers ──────────────────────────────────────────────────────

    def _correct_orientation(self, image: Image.Image) -> tuple[Image.Image, int]:
        """
        Attempt orientation correction using Tesseract OSD (if available).
        Falls back to 0-degree assumption on any error.
        """
        try:
            import pytesseract
            buf = io.BytesIO()
            image.convert("L").save(buf, format="PNG")
            buf.seek(0)
            osd = pytesseract.image_to_osd(
                Image.open(buf),
                config="--psm 0 -c min_characters_to_try=5",
                output_type=pytesseract.Output.DICT,
            )
            rotation = int(osd.get("rotate", 0))
            if rotation in (90, 180, 270):
                image = image.rotate(-rotation, expand=True)
                return image, rotation
        except Exception as exc:
            logger.debug("OSD orientation detection failed: %s", exc)
        return image, 0

    def _measure_brightness(self, gray: Image.Image) -> float:
        """Return average pixel brightness 0–255."""
        stat = ImageStat.Stat(gray)
        return stat.mean[0]

    def _measure_contrast(self, gray: Image.Image) -> float:
        """
        Return a contrast score 0–1 based on standard deviation of pixel values.
        Higher std dev = more contrast.
        """
        stat = ImageStat.Stat(gray)
        return min(1.0, stat.stddev[0] / 128.0)

    def _measure_sharpness(self, gray: Image.Image) -> float:
        """
        Estimate sharpness using a Laplacian-like approach via PIL.
        Returns a 0–1 score.
        """
        try:
            # Apply edge detection kernel and measure variance
            edges = gray.filter(ImageFilter.FIND_EDGES)
            stat = ImageStat.Stat(edges)
            variance = stat.var[0]
            # Normalise: variance > 500 is considered sharp
            return min(1.0, variance / 500.0)
        except Exception:
            return 0.5

    def _detect_blank(self, gray: Image.Image, avg_brightness: float) -> bool:
        """Return True if the page appears blank (nearly all white)."""
        if avg_brightness < BLANK_PAGE_BRIGHTNESS_THRESHOLD:
            return False
        stat = ImageStat.Stat(gray)
        return stat.stddev[0] < BLANK_PAGE_STD_THRESHOLD

    def _detect_double_spread(self, image: Image.Image) -> bool:
        """Return True if the image appears to be a double-page spread."""
        if image.height == 0:
            return False
        return (image.width / image.height) > SPREAD_ASPECT_RATIO_THRESHOLD

    def _enhance(
        self,
        image: Image.Image,
        avg_brightness: float,
        contrast_score: float,
    ) -> Image.Image:
        """
        Apply enhancement pipeline:
          1. Brightness normalisation (if very dark or very bright)
          2. Contrast boost (if contrast is low)
          3. Sharpening
          4. Slight median denoise
        """
        # Brightness normalisation
        if avg_brightness < 80:
            factor = min(2.0, 128.0 / max(avg_brightness, 10))
            image = ImageEnhance.Brightness(image).enhance(factor)
        elif avg_brightness > 210:
            factor = max(0.7, 180.0 / avg_brightness)
            image = ImageEnhance.Brightness(image).enhance(factor)

        # Contrast boost for low-contrast pages
        if contrast_score < 0.3:
            image = ImageEnhance.Contrast(image).enhance(1.6)
        elif contrast_score < 0.5:
            image = ImageEnhance.Contrast(image).enhance(1.3)

        # Sharpening for readability
        image = ImageEnhance.Sharpness(image).enhance(1.4)

        # Light median filter for noise reduction (3x3)
        image = image.filter(ImageFilter.MedianFilter(size=3))

        return image

    def _compute_quality_score(
        self,
        gray: Image.Image,
        orig_brightness: float,
        orig_contrast: float,
        orig_sharpness: float,
    ) -> float:
        """
        Compute an overall quality score 0–1.

        Weights:
          - Contrast: 40%
          - Sharpness: 40%
          - Brightness (distance from ideal ~128): 20%
        """
        contrast = self._measure_contrast(gray)
        sharpness = self._measure_sharpness(gray)

        # Brightness score: 1.0 at avg_brightness=128, decays toward 0 at extremes
        brightness_score = 1.0 - abs(orig_brightness - 128.0) / 128.0
        brightness_score = max(0.0, brightness_score)

        score = (
            0.40 * contrast
            + 0.40 * sharpness
            + 0.20 * brightness_score
        )
        return round(min(1.0, max(0.0, score)), 4)
