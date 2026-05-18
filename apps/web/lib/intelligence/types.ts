/**
 * Shared types for the Aircraft Intelligence Suite (history / prebuy /
 * ad-traceability / missing-records modules).
 */
import type { QueryConfidence } from '@/types'
import type { IntelligenceQualityScore } from './quality-score'

export type IntelligenceModule =
  | 'history'
  | 'prebuy'
  | 'ad-traceability'
  | 'missing-records'
  | 'squawk-patterns'
  | 'maintenance-forecast'
  | 'market-value'
  | 'lender-summary'
  | 'component-search'
  | 'time-comparison'

/** A source reference attached to an AI-generated finding. */
export interface IntelligenceCitation {
  doc_name: string
  page_number: number | null
  entry_date: string | null
  excerpt: string
}

/** Result of one routed RAG query run for an intelligence module. */
export interface IntelligenceQueryResult {
  answer: string
  confidence: QueryConfidence | string
  citations: IntelligenceCitation[]
  /** Number of chunks the answer was generated from (0 = insufficient records). */
  chunkCount: number
}

/** A raw record-search hit (Component History Search — no answer synthesis). */
export interface AircraftRecordSearchHit {
  chunk_id: string
  document_id: string
  doc_name: string
  doc_type: string
  page_number: number | null
  entry_date: string | null
  tach: number | null
  excerpt: string
  relevance_score: number
}

export type IntelligenceSeverity = 'critical' | 'warning' | 'info'
/** Pass / review / flag — used by Prebuy section badges. */
export type IntelligenceStatus = 'pass' | 'review' | 'flag'
export type IntelligenceRisk = 'green' | 'yellow' | 'red'

/**
 * Envelope every module API route returns and stores in
 * intelligence_cache.result_json. `data` is module-specific.
 */
export interface IntelligenceReport<T = Record<string, unknown>> {
  module: IntelligenceModule
  aircraft_id: string
  generated_at: string
  data: T
  /** true when served from intelligence_cache rather than freshly generated. */
  cached: boolean
  /**
   * Deterministic 0-100 self-score of report quality. Set just before the
   * report is cached/returned; omitted for empty-state reports. Cached as part
   * of result_json — no DB schema change.
   */
  quality_score?: IntelligenceQualityScore
}
