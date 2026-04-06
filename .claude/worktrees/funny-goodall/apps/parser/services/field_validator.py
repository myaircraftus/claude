"""
Deterministic aviation field validation.

Validates extracted field candidates against:
  - Format correctness (regex patterns, value ranges)
  - Chronological plausibility (dates relative to aircraft history)
  - Tach/total-time progression plausibility
  - AD reference format correctness
  - A&P/IA certificate format
  - Inspection language correctness
  - Return-to-service wording

Each field is assigned:
  - validation_status: 'valid' | 'invalid' | 'suspicious' | 'unchecked'
  - validation_notes: human-readable reason for any issue
  - adjusted_confidence: confidence after applying validation
"""

import logging
import re
from dataclasses import dataclass
from datetime import date, datetime
from typing import Optional

logger = logging.getLogger(__name__)

# ─── Patterns ─────────────────────────────────────────────────────────────────

_AD_FORMAT = re.compile(r'^\d{4}-\d{2}-\d{2}(?: amdt \d+)?$', re.I)
_AP_IA_FORMAT = re.compile(r'^\d{5,10}$')
_TACH_RANGE = (0.0, 99999.9)
_TOTAL_TIME_RANGE = (0.0, 99999.9)
_YEAR_RANGE = (1940, 2030)

# Date formats we can parse
_DATE_FMTS = [
    "%Y-%m-%d",
    "%m/%d/%Y",
    "%m/%d/%y",
    "%m-%d-%Y",
    "%m-%d-%y",
    "%d/%m/%Y",
    "%B %d, %Y",
    "%b %d, %Y",
    "%B %d %Y",
    "%b %d %Y",
]

COMPLIANCE_CRITICAL_FIELDS = {
    "ap_cert_number",
    "ia_cert_number",
    "ad_references",
    "return_to_service",
    "inspection_type",
    "entry_date",
}


@dataclass
class FieldValidationResult:
    field_name: str
    raw_value: object
    validation_status: str    # 'valid','invalid','suspicious','unchecked'
    validation_notes: str
    confidence_adjustment: float  # multiplicative; 1.0 = no change, <1.0 = penalty
    normalized_value: Optional[object] = None


class FieldValidator:
    """
    Validate extracted aviation fields.

    Usage:
        validator = FieldValidator(aircraft_context)
        results = validator.validate_all(candidates)
    """

    def __init__(self, aircraft_context: Optional[dict] = None):
        """
        aircraft_context may contain:
          - last_known_tach: float
          - last_known_date: str (ISO)
          - total_time_airframe: float
          - manufacture_year: int
        """
        self._ctx = aircraft_context or {}
        self._last_tach: Optional[float] = None
        self._last_date: Optional[date] = None
        self._manufacture_year: Optional[int] = None

        if "last_known_tach" in self._ctx:
            try:
                self._last_tach = float(self._ctx["last_known_tach"])
            except (ValueError, TypeError):
                pass

        if "last_known_date" in self._ctx:
            d = _parse_date(str(self._ctx["last_known_date"]))
            if d:
                self._last_date = d

        if "manufacture_year" in self._ctx:
            try:
                self._manufacture_year = int(self._ctx["manufacture_year"])
            except (ValueError, TypeError):
                pass

    def validate_all(self, candidates: dict) -> dict[str, FieldValidationResult]:
        """
        Validate all field candidates.

        candidates: {field_name: {value, confidence, normalized}}
        Returns: {field_name: FieldValidationResult}
        """
        results: dict[str, FieldValidationResult] = {}
        for field_name, candidate in candidates.items():
            value = candidate.get("value")
            results[field_name] = self.validate_field(field_name, value)
        return results

    def validate_field(self, field_name: str, value: object) -> FieldValidationResult:
        if value is None or value == "" or value == []:
            return FieldValidationResult(
                field_name=field_name,
                raw_value=value,
                validation_status="unchecked",
                validation_notes="No value provided",
                confidence_adjustment=1.0,
            )

        dispatch = {
            "entry_date": self._validate_date,
            "tach_time": self._validate_tach,
            "total_time_airframe": self._validate_total_time,
            "tsoh": self._validate_time_field,
            "tsmoh": self._validate_time_field,
            "ett": self._validate_time_field,
            "ap_cert_number": self._validate_ap_ia,
            "ia_cert_number": self._validate_ap_ia,
            "ad_references": self._validate_ad_refs,
            "return_to_service": self._validate_rts,
            "inspection_type": self._validate_inspection_type,
            "ata_chapter": self._validate_ata_chapter,
        }

        validator_fn = dispatch.get(field_name)
        if validator_fn:
            return validator_fn(field_name, value)

        # Generic pass-through for other fields
        return FieldValidationResult(
            field_name=field_name,
            raw_value=value,
            validation_status="valid",
            validation_notes="No specific validator; accepted as-is",
            confidence_adjustment=1.0,
            normalized_value=value,
        )

    # ─── Per-field validators ─────────────────────────────────────────────────

    def _validate_date(self, field_name: str, value: object) -> FieldValidationResult:
        parsed = _parse_date(str(value))
        if parsed is None:
            return FieldValidationResult(
                field_name=field_name,
                raw_value=value,
                validation_status="invalid",
                validation_notes=f"Could not parse date: {value!r}",
                confidence_adjustment=0.3,
            )

        today = date.today()
        year = parsed.year

        if year < _YEAR_RANGE[0] or year > _YEAR_RANGE[1]:
            return FieldValidationResult(
                field_name=field_name,
                raw_value=value,
                validation_status="invalid",
                validation_notes=f"Year {year} is out of plausible range",
                confidence_adjustment=0.2,
                normalized_value=parsed.isoformat(),
            )

        if parsed > today:
            return FieldValidationResult(
                field_name=field_name,
                raw_value=value,
                validation_status="suspicious",
                validation_notes=f"Date {parsed} is in the future",
                confidence_adjustment=0.5,
                normalized_value=parsed.isoformat(),
            )

        if self._manufacture_year and year < self._manufacture_year:
            return FieldValidationResult(
                field_name=field_name,
                raw_value=value,
                validation_status="suspicious",
                validation_notes=f"Date {parsed} is before aircraft manufacture year {self._manufacture_year}",
                confidence_adjustment=0.6,
                normalized_value=parsed.isoformat(),
            )

        if self._last_date and parsed < self._last_date:
            return FieldValidationResult(
                field_name=field_name,
                raw_value=value,
                validation_status="suspicious",
                validation_notes=(
                    f"Date {parsed} is earlier than last known entry date {self._last_date} "
                    "(pages may be out of order)"
                ),
                confidence_adjustment=0.8,
                normalized_value=parsed.isoformat(),
            )

        return FieldValidationResult(
            field_name=field_name,
            raw_value=value,
            validation_status="valid",
            validation_notes="Date is plausible",
            confidence_adjustment=1.0,
            normalized_value=parsed.isoformat(),
        )

    def _validate_tach(self, field_name: str, value: object) -> FieldValidationResult:
        try:
            v = float(str(value).replace(",", ""))
        except ValueError:
            return FieldValidationResult(
                field_name=field_name,
                raw_value=value,
                validation_status="invalid",
                validation_notes=f"Cannot parse tach value: {value!r}",
                confidence_adjustment=0.2,
            )

        if not (_TACH_RANGE[0] <= v <= _TACH_RANGE[1]):
            return FieldValidationResult(
                field_name=field_name,
                raw_value=value,
                validation_status="invalid",
                validation_notes=f"Tach {v} is out of range {_TACH_RANGE}",
                confidence_adjustment=0.1,
                normalized_value=str(v),
            )

        if self._last_tach is not None:
            diff = v - self._last_tach
            if diff < -50:
                return FieldValidationResult(
                    field_name=field_name,
                    raw_value=value,
                    validation_status="suspicious",
                    validation_notes=(
                        f"Tach {v} is significantly lower than last known tach {self._last_tach} "
                        "(possible OCR error or different logbook)"
                    ),
                    confidence_adjustment=0.5,
                    normalized_value=str(v),
                )
            if diff > 10000:
                return FieldValidationResult(
                    field_name=field_name,
                    raw_value=value,
                    validation_status="suspicious",
                    validation_notes=f"Tach jump of {diff:.1f} hrs is unusually large",
                    confidence_adjustment=0.6,
                    normalized_value=str(v),
                )

        return FieldValidationResult(
            field_name=field_name,
            raw_value=value,
            validation_status="valid",
            validation_notes="Tach value is plausible",
            confidence_adjustment=1.0,
            normalized_value=str(v),
        )

    def _validate_total_time(self, field_name: str, value: object) -> FieldValidationResult:
        return self._validate_tach(field_name, value)  # same range/rules

    def _validate_time_field(self, field_name: str, value: object) -> FieldValidationResult:
        try:
            v = float(str(value).replace(",", ""))
        except ValueError:
            return FieldValidationResult(
                field_name=field_name,
                raw_value=value,
                validation_status="invalid",
                validation_notes=f"Cannot parse time value: {value!r}",
                confidence_adjustment=0.3,
            )
        if v < 0 or v > 99999:
            return FieldValidationResult(
                field_name=field_name,
                raw_value=value,
                validation_status="invalid",
                validation_notes=f"Time value {v} is out of range",
                confidence_adjustment=0.2,
                normalized_value=str(v),
            )
        return FieldValidationResult(
            field_name=field_name,
            raw_value=value,
            validation_status="valid",
            validation_notes="Time value is plausible",
            confidence_adjustment=1.0,
            normalized_value=str(v),
        )

    def _validate_ap_ia(self, field_name: str, value: object) -> FieldValidationResult:
        cert = str(value).strip()
        if not _AP_IA_FORMAT.match(cert):
            return FieldValidationResult(
                field_name=field_name,
                raw_value=value,
                validation_status="suspicious",
                validation_notes=f"Certificate number '{cert}' format looks unusual (expected 5–10 digits)",
                confidence_adjustment=0.6,
                normalized_value=cert,
            )
        return FieldValidationResult(
            field_name=field_name,
            raw_value=value,
            validation_status="valid",
            validation_notes="Certificate number format is valid",
            confidence_adjustment=1.0,
            normalized_value=cert,
        )

    def _validate_ad_refs(self, field_name: str, value: object) -> FieldValidationResult:
        if isinstance(value, list):
            refs = value
        else:
            refs = [str(value)]

        issues = []
        for ref in refs:
            cleaned = str(ref).strip().upper().replace("AD ", "").replace("AD-", "")
            if not _AD_FORMAT.match(cleaned):
                issues.append(f"'{ref}' does not match YYYY-NN-NN format")

        if issues:
            return FieldValidationResult(
                field_name=field_name,
                raw_value=value,
                validation_status="suspicious",
                validation_notes="Some AD references have unexpected format: " + "; ".join(issues),
                confidence_adjustment=0.65,
                normalized_value=refs,
            )

        return FieldValidationResult(
            field_name=field_name,
            raw_value=value,
            validation_status="valid",
            validation_notes="AD reference format is valid",
            confidence_adjustment=1.0,
            normalized_value=refs,
        )

    def _validate_rts(self, field_name: str, value: object) -> FieldValidationResult:
        # return_to_service can be bool or string
        if isinstance(value, bool):
            return FieldValidationResult(
                field_name=field_name,
                raw_value=value,
                validation_status="valid",
                validation_notes="Return to service flag is boolean",
                confidence_adjustment=1.0,
                normalized_value=value,
            )
        v_str = str(value).lower()
        if v_str in ("true", "yes", "1", "rts"):
            return FieldValidationResult(
                field_name=field_name,
                raw_value=value,
                validation_status="valid",
                validation_notes="Return to service recognized",
                confidence_adjustment=1.0,
                normalized_value=True,
            )
        return FieldValidationResult(
            field_name=field_name,
            raw_value=value,
            validation_status="suspicious",
            validation_notes=f"Return to service value unclear: {value!r}",
            confidence_adjustment=0.6,
            normalized_value=None,
        )

    def _validate_inspection_type(self, field_name: str, value: object) -> FieldValidationResult:
        valid_types = {"annual", "100hr", "progressive", "ad_compliance", "other"}
        v = str(value).lower().strip()
        if v in valid_types:
            return FieldValidationResult(
                field_name=field_name,
                raw_value=value,
                validation_status="valid",
                validation_notes=f"Inspection type '{v}' is recognized",
                confidence_adjustment=1.0,
                normalized_value=v,
            )
        return FieldValidationResult(
            field_name=field_name,
            raw_value=value,
            validation_status="suspicious",
            validation_notes=f"Inspection type '{value}' is not a recognized standard value",
            confidence_adjustment=0.7,
            normalized_value=v,
        )

    def _validate_ata_chapter(self, field_name: str, value: object) -> FieldValidationResult:
        v = str(value).strip()
        # ATA chapters are 2–4 digit codes (e.g. "71", "71-10", "72.00")
        if re.match(r'^\d{2}[-.]?\d{0,2}$', v):
            return FieldValidationResult(
                field_name=field_name,
                raw_value=value,
                validation_status="valid",
                validation_notes="ATA chapter format is valid",
                confidence_adjustment=1.0,
                normalized_value=v,
            )
        return FieldValidationResult(
            field_name=field_name,
            raw_value=value,
            validation_status="suspicious",
            validation_notes=f"ATA chapter format '{v}' is unusual",
            confidence_adjustment=0.7,
            normalized_value=v,
        )


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _parse_date(value: str) -> Optional[date]:
    """Try to parse a date string into a date object."""
    value = value.strip()
    for fmt in _DATE_FMTS:
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    return None
