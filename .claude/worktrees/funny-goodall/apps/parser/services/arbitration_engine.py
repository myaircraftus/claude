"""
Arbitration engine — determines the canonical disposition for each page.

Inputs:
  - Multi-engine extraction results (from multi_engine_extractor)
  - Field validation results (from field_validator)
  - Page classification (from page_classifier)
  - Page quality score (from image_preprocessor)

Outputs one of four dispositions:
  - auto_accept       (≥ 90% confidence, no critical conflicts, all validators pass)
  - accept_with_caution (70–89%, minor issues, no critical field conflicts)
  - review_required   (50–69%, disagreements, or compliance-critical fields flagged)
  - reject            (< 50%, major conflicts, or all engines failed)

Also produces:
  - A per-field best candidate recommendation
  - A human review packet with all evidence
  - Conflict records for field_conflicts table
"""

import logging
from dataclasses import dataclass, field
from typing import Any, Optional

logger = logging.getLogger(__name__)

# Thresholds
BAND_AUTO_ACCEPT      = 0.90
BAND_ACCEPT_CAUTION   = 0.70
BAND_REVIEW_REQUIRED  = 0.50

# Weights for scoring components
W_ENGINE_AGREEMENT    = 0.35
W_VALIDATION          = 0.35
W_PAGE_QUALITY        = 0.15
W_CLASSIFICATION_CONF = 0.15

# Fields where disagreement is critical (compliance risk)
CRITICAL_FIELDS = {
    "entry_date",
    "ap_cert_number",
    "ia_cert_number",
    "ad_references",
    "return_to_service",
    "inspection_type",
    "tach_time",
}

# Fields where any invalid result forces review
FORCE_REVIEW_IF_INVALID = {
    "ad_references",
    "return_to_service",
    "inspection_type",
    "ap_cert_number",
    "ia_cert_number",
}


@dataclass
class FieldArbitration:
    field_name: str
    best_value: Any
    best_confidence: float
    consensus: bool             # True = engines agree
    conflict_detected: bool
    conflict_severity: str      # 'none','low','medium','high','critical'
    candidate_values: list      # [{engine, value, confidence}]
    validation_status: str
    validation_notes: str


@dataclass
class ArbitrationResult:
    disposition: str            # 'auto_accept','accept_with_caution','review_required','reject'
    arbitration_score: float    # 0.0 – 1.0
    field_arbitrations: dict[str, FieldArbitration]
    conflicts: list[dict]       # list of conflict records for DB
    review_reasons: list[str]
    recommended_fields: dict    # field_name -> best value
    review_packet: dict         # full structured packet for human review
    needs_human_review: bool


class ArbitrationEngine:

    def arbitrate(
        self,
        combined_candidates: dict,     # from MultiEngineResult
        validation_results: dict,      # from FieldValidator
        extraction_runs: list,         # ExtractionRunResult list
        page_type: str,
        classification_confidence: float,
        page_quality_score: float,
        is_compliance_critical: bool,
    ) -> ArbitrationResult:
        """
        Run the arbitration pipeline.

        Returns an ArbitrationResult with disposition and all evidence.
        """
        field_arbitrations: dict[str, FieldArbitration] = {}
        conflicts: list[dict] = []
        review_reasons: list[str] = []
        force_review = False

        # 1. Per-field arbitration
        for field_name, candidates in combined_candidates.items():
            arb = self._arbitrate_field(
                field_name=field_name,
                candidates=candidates,
                validation_result=validation_results.get(field_name),
            )
            field_arbitrations[field_name] = arb

            if arb.conflict_detected and arb.conflict_severity in ("high", "critical"):
                review_reasons.append(
                    f"Critical conflict in field '{field_name}': {arb.candidate_values}"
                )
                if field_name in CRITICAL_FIELDS:
                    force_review = True

            if arb.validation_status == "invalid" and field_name in FORCE_REVIEW_IF_INVALID:
                review_reasons.append(f"Validation failed for critical field '{field_name}'")
                force_review = True

            if arb.conflict_detected:
                conflicts.append({
                    "field_name": field_name,
                    "candidate_values": arb.candidate_values,
                    "conflict_reason": f"Engine disagreement: {arb.conflict_severity}",
                    "severity": arb.conflict_severity,
                    "resolution_status": "pending",
                })

        # 2. Overall scoring
        engine_agreement_score = self._compute_engine_agreement(field_arbitrations)
        validation_score = self._compute_validation_score(validation_results)

        raw_score = (
            W_ENGINE_AGREEMENT    * engine_agreement_score
            + W_VALIDATION        * validation_score
            + W_PAGE_QUALITY      * page_quality_score
            + W_CLASSIFICATION_CONF * classification_confidence
        )
        arbitration_score = max(0.0, min(1.0, raw_score))

        # 3. Apply compliance-critical penalty
        if is_compliance_critical and arbitration_score < 0.95:
            arbitration_score *= 0.9  # extra caution for compliance docs

        # 4. Disposition decision
        if force_review:
            disposition = "review_required"
        elif arbitration_score >= BAND_AUTO_ACCEPT and not review_reasons:
            disposition = "auto_accept"
        elif arbitration_score >= BAND_ACCEPT_CAUTION:
            disposition = "accept_with_caution"
        elif arbitration_score >= BAND_REVIEW_REQUIRED:
            disposition = "review_required"
        else:
            disposition = "reject"

        # 5. Page-level review triggers
        if page_quality_score < 0.4:
            review_reasons.append(f"Low page quality score: {page_quality_score:.2f}")
            if disposition == "auto_accept":
                disposition = "accept_with_caution"

        if page_type in ("unknown_needs_review", "mixed_attachment"):
            review_reasons.append(f"Page type requires review: {page_type}")
            if disposition == "auto_accept":
                disposition = "review_required"

        run_failures = [r for r in extraction_runs if r.get("error_message")]
        if len(run_failures) >= 2:
            review_reasons.append(f"{len(run_failures)} extraction engines failed")
            if disposition == "auto_accept":
                disposition = "accept_with_caution"

        needs_human = disposition in ("review_required", "reject")

        # 6. Build recommended fields dict
        recommended: dict = {}
        for field_name, arb in field_arbitrations.items():
            if arb.best_value is not None:
                recommended[field_name] = arb.best_value

        # 7. Build review packet
        review_packet = self._build_review_packet(
            field_arbitrations=field_arbitrations,
            extraction_runs=extraction_runs,
            conflicts=conflicts,
            disposition=disposition,
            arbitration_score=arbitration_score,
            review_reasons=review_reasons,
            page_type=page_type,
            page_quality_score=page_quality_score,
        )

        return ArbitrationResult(
            disposition=disposition,
            arbitration_score=round(arbitration_score, 4),
            field_arbitrations=field_arbitrations,
            conflicts=conflicts,
            review_reasons=review_reasons,
            recommended_fields=recommended,
            review_packet=review_packet,
            needs_human_review=needs_human,
        )

    # ─── Per-field arbitration ────────────────────────────────────────────────

    def _arbitrate_field(
        self,
        field_name: str,
        candidates: list,
        validation_result: Any,
    ) -> FieldArbitration:
        """Pick the best value for a field from all engine candidates."""
        if not candidates:
            return FieldArbitration(
                field_name=field_name,
                best_value=None,
                best_confidence=0.0,
                consensus=False,
                conflict_detected=False,
                conflict_severity="none",
                candidate_values=[],
                validation_status="unchecked",
                validation_notes="No candidates",
            )

        val_status = "unchecked"
        val_notes = ""
        val_adj = 1.0
        if validation_result:
            val_status = validation_result.validation_status
            val_notes = validation_result.validation_notes
            val_adj = validation_result.confidence_adjustment

        # Detect consensus (all non-None values are equal after normalization)
        non_null = [c for c in candidates if c.get("value") is not None]
        unique_vals = set(_normalize_for_comparison(c.get("value")) for c in non_null)
        consensus = len(unique_vals) <= 1

        conflict_detected = not consensus and len(non_null) >= 2
        conflict_severity = "none"

        if conflict_detected:
            if field_name in CRITICAL_FIELDS:
                conflict_severity = "critical"
            elif field_name in {"mechanic_name", "work_type", "logbook_type"}:
                conflict_severity = "medium"
            else:
                conflict_severity = "low"

        # Pick best candidate: highest adjusted confidence
        best = max(
            non_null,
            key=lambda c: float(c.get("confidence", 0)) * val_adj,
            default={"value": None, "confidence": 0.0},
        )

        # Prefer regex result for deterministic fields if it exists
        if field_name in CRITICAL_FIELDS:
            regex_candidates = [c for c in candidates if c.get("engine") == "regex_patterns"]
            if regex_candidates:
                best = max(regex_candidates, key=lambda c: float(c.get("confidence", 0)))

        best_conf = float(best.get("confidence", 0.0)) * val_adj

        return FieldArbitration(
            field_name=field_name,
            best_value=best.get("value"),
            best_confidence=round(best_conf, 4),
            consensus=consensus,
            conflict_detected=conflict_detected,
            conflict_severity=conflict_severity,
            candidate_values=candidates,
            validation_status=val_status,
            validation_notes=val_notes,
        )

    # ─── Scoring helpers ──────────────────────────────────────────────────────

    def _compute_engine_agreement(self, field_arbitrations: dict) -> float:
        """
        Overall engine agreement score.
        0 = all critical fields conflict; 1 = perfect consensus.
        """
        if not field_arbitrations:
            return 0.5

        total = 0.0
        weight_sum = 0.0
        for field_name, arb in field_arbitrations.items():
            weight = 3.0 if field_name in CRITICAL_FIELDS else 1.0
            score = 1.0 if arb.consensus else {
                "critical": 0.0,
                "high": 0.2,
                "medium": 0.5,
                "low": 0.75,
                "none": 1.0,
            }.get(arb.conflict_severity, 0.5)
            total += score * weight
            weight_sum += weight

        return total / weight_sum if weight_sum else 0.5

    def _compute_validation_score(self, validation_results: dict) -> float:
        """
        Overall validation score based on field-level results.
        """
        if not validation_results:
            return 0.7  # No validators ran — moderate default

        scores = []
        for field_name, result in validation_results.items():
            weight = 3.0 if field_name in CRITICAL_FIELDS else 1.0
            status_score = {
                "valid": 1.0,
                "suspicious": 0.6,
                "invalid": 0.1,
                "unchecked": 0.8,
            }.get(result.validation_status, 0.5)
            scores.append(status_score * weight)

        return sum(scores) / len(scores) if scores else 0.7

    # ─── Review packet builder ────────────────────────────────────────────────

    def _build_review_packet(
        self,
        field_arbitrations: dict,
        extraction_runs: list,
        conflicts: list,
        disposition: str,
        arbitration_score: float,
        review_reasons: list,
        page_type: str,
        page_quality_score: float,
    ) -> dict:
        """Build a structured review packet for the human reviewer."""
        engine_outputs = []
        for run in extraction_runs:
            engine_outputs.append({
                "engine_name": run.get("engine_name"),
                "engine_type": run.get("engine_type"),
                "confidence_score": run.get("confidence_score"),
                "raw_text_snippet": (run.get("raw_text") or "")[:500],
                "error_message": run.get("error_message"),
            })

        field_summary = {}
        for field_name, arb in field_arbitrations.items():
            field_summary[field_name] = {
                "best_value": arb.best_value,
                "best_confidence": arb.best_confidence,
                "consensus": arb.consensus,
                "conflict_detected": arb.conflict_detected,
                "conflict_severity": arb.conflict_severity,
                "validation_status": arb.validation_status,
                "validation_notes": arb.validation_notes,
                "all_candidates": arb.candidate_values,
            }

        return {
            "disposition": disposition,
            "arbitration_score": arbitration_score,
            "page_type": page_type,
            "page_quality_score": page_quality_score,
            "review_reasons": review_reasons,
            "engine_outputs": engine_outputs,
            "field_summary": field_summary,
            "conflicts": conflicts,
            "conflict_count": len(conflicts),
            "critical_fields_conflicted": [
                c["field_name"] for c in conflicts
                if c.get("severity") == "critical"
            ],
        }


# ─── Helper ───────────────────────────────────────────────────────────────────

def _normalize_for_comparison(value: Any) -> str:
    """Normalize a value to a string for consensus comparison."""
    if value is None:
        return "__null__"
    if isinstance(value, list):
        return ",".join(sorted(str(v).strip().lower() for v in value))
    return str(value).strip().lower()
