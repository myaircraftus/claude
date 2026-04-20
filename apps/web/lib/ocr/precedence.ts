export interface PrecedenceCandidate {
  value: string | null
  sourceKind: string
  sourceEngine?: string | null
  validationStatus?: 'valid' | 'invalid' | 'suspicious' | 'unvalidated' | null
  confidence?: number | null
  reviewerOverride?: boolean | null
}

const GENERAL_PRECEDENCE: Record<string, number> = {
  human_reviewed_correction: 1,
  manual_override: 1,
  approved_canonical_record: 2,
  structured_extraction_validated: 3,
  trusted_external_integration: 4,
  raw_ocr_candidate: 5,
  semantic_inference: 6,
}

export function precedenceRankForSource(sourceKind: string) {
  return GENERAL_PRECEDENCE[sourceKind] ?? 6
}

export function fieldSpecificPrecedenceRule(fieldName: string) {
  if (fieldName === 'ad_reference') return 'exact_detected_ad_with_validation_beats_fuzzy_mention'
  if (fieldName === 'part_number') return 'exact_pattern_validated_part_number_beats_semantic_guess'
  if (fieldName === 'return_to_service') return 'signed_evidence_beats_summary_text'
  if (fieldName === 'inspection_type') return 'reviewed_canonical_classification_beats_page_heuristic'
  return 'general_source_precedence'
}

export function selectPreferredCandidate(fieldName: string, candidates: PrecedenceCandidate[]) {
  const nonEmpty = candidates.filter((candidate) => (candidate.value ?? '').trim().length > 0)
  if (nonEmpty.length === 0) {
    return {
      chosen: null as PrecedenceCandidate | null,
      precedenceDecision: 'no_candidate',
      precedenceRank: 6,
      rule: fieldSpecificPrecedenceRule(fieldName),
    }
  }

  const sorted = [...nonEmpty].sort((left, right) => {
    const reviewerBoost = (right.reviewerOverride ? 1 : 0) - (left.reviewerOverride ? 1 : 0)
    if (reviewerBoost !== 0) return reviewerBoost

    const leftRank = precedenceRankForSource(left.sourceKind)
    const rightRank = precedenceRankForSource(right.sourceKind)
    if (leftRank !== rightRank) return leftRank - rightRank

    const leftValid = left.validationStatus === 'valid' ? 1 : left.validationStatus === 'suspicious' ? 0 : -1
    const rightValid = right.validationStatus === 'valid' ? 1 : right.validationStatus === 'suspicious' ? 0 : -1
    if (leftValid !== rightValid) return rightValid - leftValid

    return (right.confidence ?? 0) - (left.confidence ?? 0)
  })

  const chosen = sorted[0]
  const rank = precedenceRankForSource(chosen.sourceKind)
  return {
    chosen,
    precedenceDecision: `${chosen.sourceKind}_won`,
    precedenceRank: rank,
    rule: fieldSpecificPrecedenceRule(fieldName),
  }
}
