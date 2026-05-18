/**
 * Intelligence report self-scoring.
 *
 * `scoreIntelligenceReport` is a PURE, deterministic function (no I/O, no LLM,
 * never throws) that grades a finished IntelligenceReport 0-100 so the UI can
 * tell the user how much to trust it. It is NOT an "AI agent" — the inputs are
 * already-computed citations / confidences / section data, so the score is a
 * straightforward weighted sum that is fast, free, and reproducible.
 *
 * Criteria (matches the sprint brief):
 *   - Source coverage  (30) — share of cited-eligible sections that have ≥1 citation
 *   - Confidence       (20) — average RAG/OCR confidence of the sections
 *   - Completeness     (30) — share of sections that returned data (not "insufficient")
 *   - Consistency      (20) — corroboration proxy: grows with the number of
 *                             distinct source documents the report draws on
 *
 * The report `data` shape differs per module, so the scorer walks it generically
 * and collects anything that looks like a section ({ text|summary|answer,
 * citations, confidence }). Each route just calls scoreIntelligenceReport(report)
 * once and stores the result on the report (cached in intelligence_cache.result_json
 * — no schema change).
 */

export type QualityBand = 'high' | 'medium' | 'low'

export interface IntelligenceQualityScore {
  /** 0-100 overall score. */
  score: number
  /** high ≥ 80, medium ≥ 60, low < 60. */
  band: QualityBand
  /** Distinct source documents the report's citations reference. */
  source_documents: number
  sections_total: number
  sections_with_data: number
  sections_with_citations: number
  /** Per-criterion point contributions (sum ≈ score). */
  breakdown: {
    source_coverage: number
    confidence: number
    completeness: number
    consistency: number
  }
  /** One-line human-readable explanation for the UI. */
  rationale: string
}

/** Map a RAG/OCR confidence value to a 0-1 weight. */
function confidenceWeight(value: unknown): number {
  const v = String(value ?? '').toLowerCase()
  if (v === 'high') return 1
  if (v === 'medium') return 0.6
  if (v === 'low') return 0.3
  if (v === 'insufficient_evidence' || v === 'insufficient' || v === 'none') return 0
  if (v === '') return 0.5 // unscored section — neutral
  return 0.5
}

/** A section-like node discovered while walking the report data. */
interface SectionProbe {
  hasText: boolean
  hasCitations: boolean
  /** null when the section carries no confidence field. */
  confidence: number | null
  docNames: string[]
}

/** True for an object that carries section-like content. */
function looksLikeSection(node: Record<string, unknown>): boolean {
  return (
    'citations' in node ||
    'confidence' in node ||
    'text' in node ||
    'summary' in node ||
    'answer' in node
  )
}

/** Recursively collect every section-like node from the report data. */
function collectSections(value: unknown, out: SectionProbe[], depth = 0): void {
  if (value == null || depth > 8) return
  if (Array.isArray(value)) {
    for (const item of value) collectSections(item, out, depth + 1)
    return
  }
  if (typeof value !== 'object') return
  const node = value as Record<string, unknown>

  if (looksLikeSection(node)) {
    const text = node.text ?? node.summary ?? node.answer
    const hasText = typeof text === 'string' && text.trim().length > 0
    const citations = Array.isArray(node.citations) ? node.citations : []
    const docNames: string[] = []
    for (const c of citations) {
      if (c && typeof c === 'object' && typeof (c as { doc_name?: unknown }).doc_name === 'string') {
        docNames.push((c as { doc_name: string }).doc_name)
      }
    }
    out.push({
      hasText,
      hasCitations: citations.length > 0,
      confidence: 'confidence' in node ? confidenceWeight(node.confidence) : null,
      docNames,
    })
  }

  // Recurse — a section can still contain nested sections.
  for (const key of Object.keys(node)) {
    if (key === 'citations') continue // already harvested
    collectSections(node[key], out, depth + 1)
  }
}

const clamp = (n: number, lo: number, hi: number) => (n < lo ? lo : n > hi ? hi : n)
const round1 = (n: number) => Math.round(n * 10) / 10

/**
 * Score a finished intelligence report 0-100. Never throws — on any unexpected
 * shape it returns a low, honest score rather than failing the request.
 */
export function scoreIntelligenceReport(report: {
  data?: unknown
}): IntelligenceQualityScore {
  const sections: SectionProbe[] = []
  try {
    collectSections(report?.data, sections)
  } catch {
    // fall through with whatever was collected
  }

  const sectionsTotal = sections.length
  const sectionsWithData = sections.filter((s) => s.hasText).length
  const sectionsWithCitations = sections.filter((s) => s.hasCitations).length
  const sourceDocuments = new Set(sections.flatMap((s) => s.docNames)).size

  // Empty report — nothing to grade.
  if (sectionsTotal === 0) {
    return {
      score: 0,
      band: 'low',
      source_documents: 0,
      sections_total: 0,
      sections_with_data: 0,
      sections_with_citations: 0,
      breakdown: { source_coverage: 0, confidence: 0, completeness: 0, consistency: 0 },
      rationale: 'No analyzable sections — insufficient records.',
    }
  }

  // 1. Source coverage (30 pts) — of sections that returned data, how many cite a source.
  const citeEligible = Math.max(1, sectionsWithData)
  const sourceCoverage = round1(
    clamp(Math.min(sectionsWithCitations, sectionsWithData) / citeEligible, 0, 1) * 30,
  )

  // 2. Confidence (20 pts) — average confidence across sections that carry one.
  const scored = sections.filter((s) => s.confidence != null)
  const avgConfidence =
    scored.length > 0 ? scored.reduce((a, s) => a + (s.confidence ?? 0), 0) / scored.length : 0.5
  const confidence = round1(clamp(avgConfidence, 0, 1) * 20)

  // 3. Completeness (30 pts) — share of sections that returned data.
  const completeness = round1(clamp(sectionsWithData / sectionsTotal, 0, 1) * 30)

  // 4. Consistency (20 pts) — corroboration proxy: a report grounded in several
  //    distinct source documents is far less likely to carry an unspotted
  //    contradiction than one leaning on a single page. Full marks at ≥4 docs.
  const consistency = round1(clamp(sourceDocuments / 4, 0, 1) * 20)

  const score = Math.round(sourceCoverage + confidence + completeness + consistency)
  const band: QualityBand = score >= 80 ? 'high' : score >= 60 ? 'medium' : 'low'

  const confidenceLabel =
    avgConfidence >= 0.8 ? 'high-confidence' : avgConfidence >= 0.5 ? 'mixed-confidence' : 'low-confidence'

  return {
    score,
    band,
    source_documents: sourceDocuments,
    sections_total: sectionsTotal,
    sections_with_data: sectionsWithData,
    sections_with_citations: sectionsWithCitations,
    breakdown: { source_coverage: sourceCoverage, confidence, completeness, consistency },
    rationale:
      `Based on ${sourceDocuments} source document${sourceDocuments === 1 ? '' : 's'} with ` +
      `${confidenceLabel} OCR — ${sectionsWithData}/${sectionsTotal} sections returned data, ` +
      `${sectionsWithCitations} cited.`,
  }
}
