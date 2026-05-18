'use client'

/**
 * QualityBadge — compact, deterministic report-quality indicator.
 *
 * Renders the self-score produced by `scoreIntelligenceReport` (see
 * lib/intelligence/quality-score.ts) as a single colour-coded badge line:
 * the score is tinted by band (high = emerald, medium = amber, low = red)
 * and followed by the scorer's one-line rationale. When the score falls
 * below 60 a warning banner is shown beneath the badge so the reader knows
 * the report leaned on thin records.
 *
 * Returns `null` when no score is present (older cached reports never carried
 * one), so callers can safely render <QualityBadge score={report?.quality_score} />.
 */
import { AlertTriangle } from 'lucide-react'
import type { IntelligenceQualityScore } from '@/lib/intelligence/quality-score'

const BAND_STYLES: Record<IntelligenceQualityScore['band'], string> = {
  high: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  medium: 'text-amber-700 bg-amber-50 border-amber-200',
  low: 'text-red-700 bg-red-50 border-red-200',
}

export function QualityBadge({
  score,
}: {
  score: IntelligenceQualityScore | null | undefined
}) {
  if (!score) return null

  return (
    <div className="mb-4">
      <div className="flex items-baseline gap-1.5 flex-wrap text-[12px]">
        <span
          className={`inline-flex items-center rounded-full border px-2 py-0.5 tabular-nums ${BAND_STYLES[score.band]}`}
          style={{ fontWeight: 700 }}
        >
          Report quality: {score.score}/100
        </span>
        <span className="text-muted-foreground leading-relaxed">
          — {score.rationale}
        </span>
      </div>

      {score.score < 60 && (
        <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-[12px] text-amber-800 leading-relaxed">
            Limited records available — results may be incomplete.
          </p>
        </div>
      )}
    </div>
  )
}
