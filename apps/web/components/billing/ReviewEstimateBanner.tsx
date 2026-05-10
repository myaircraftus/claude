'use client'

/**
 * Phase 14 Sprint 14.4 — Review estimate banner.
 *
 * Renders only when document.suggests_review is true. Reads
 * handwriting_pct + page_count, computes the estimated A&P review hours
 * via the heuristic in pricing-config (30 pages/hr), and shows three
 * buttons:
 *   - Accept Expert Verification ($150/hr)
 *   - Request Standard QA ($50/hr)
 *   - Skip Review
 *
 * In v1 all three buttons store the user's choice in
 * document_review_requests but DO NOT charge — humanReviewBillingEnabled()
 * is gated by the env var (default false until v2 launches).
 */
import { useState } from 'react'
import { AlertTriangle, ShieldCheck, Eye, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  HUMAN_REVIEW_RATES,
  estimateReviewCost,
  estimateReviewHoursFromPages,
} from '@/lib/billing/pricing-config'

type ReviewType = 'expert_ap' | 'standard_qa' | 'skip'

export interface ReviewEstimateBannerProps {
  documentId: string
  organizationId: string
  /** Fraction in [0, 1] from documents.handwriting_pct. */
  handwritingPct: number
  pageCount: number
  /** When set, the banner will not call the API (preview / story mode). */
  previewOnly?: boolean
  onChoiceMade?: (choice: ReviewType) => void
  className?: string
}

export function ReviewEstimateBanner({
  documentId,
  organizationId,
  handwritingPct,
  pageCount,
  previewOnly,
  onChoiceMade,
  className,
}: ReviewEstimateBannerProps) {
  const [submitting, setSubmitting] = useState<ReviewType | null>(null)
  const [submitted, setSubmitted] = useState<ReviewType | null>(null)
  const [error, setError] = useState<string | null>(null)

  const estimatedHours = estimateReviewHoursFromPages(pageCount)
  const expertEstimate = estimateReviewCost('expertAp', estimatedHours)
  const qaEstimate = estimateReviewCost('standardQa', estimatedHours)
  const handwritingPercentDisplay = Math.round(handwritingPct * 100)

  async function submitChoice(choice: ReviewType) {
    setSubmitting(choice)
    setError(null)
    if (previewOnly) {
      setSubmitting(null)
      setSubmitted(choice)
      onChoiceMade?.(choice)
      return
    }
    try {
      const res = await fetch('/api/documents/review-requests', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          documentId,
          organizationId,
          reviewType: choice,
          estimatedHours,
        }),
      })
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        throw new Error(errBody.error ?? `request failed (${res.status})`)
      }
      setSubmitted(choice)
      onChoiceMade?.(choice)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'request failed')
    } finally {
      setSubmitting(null)
    }
  }

  if (submitted) {
    const label =
      submitted === 'expert_ap'
        ? `Expert A&P Verification requested (est. ${expertEstimate.hours}h × $150/hr = $${expertEstimate.total})`
        : submitted === 'standard_qa'
          ? `Standard QA Review requested (est. ${qaEstimate.hours}h × $50/hr = $${qaEstimate.total})`
          : 'No human review requested'
    return (
      <div
        className={`rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 ${className ?? ''}`}
      >
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" />
          <span className="font-medium">Review preference recorded</span>
        </div>
        <div className="mt-1 text-xs">
          {label}. No charge in v1 — workflow only.
        </div>
      </div>
    )
  }

  return (
    <div
      className={`rounded-md border border-amber-300 bg-amber-50 p-3 ${className ?? ''}`}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
        <div className="flex-1">
          <div className="text-sm font-medium text-amber-900">
            We detected ~{handwritingPercentDisplay}% handwritten content on this document
          </div>
          <p className="mt-1 text-xs text-amber-800">
            <strong>Recommended:</strong> {HUMAN_REVIEW_RATES.expertAp.name} — A&P/IA reviews
            handwritten content for regulatory compliance. Estimated {expertEstimate.hours}h ×
            ${HUMAN_REVIEW_RATES.expertAp.hourlyRate}/hr = <strong>${expertEstimate.total}</strong>.
          </p>
          <p className="mt-1 text-xs text-amber-800">
            Or: {HUMAN_REVIEW_RATES.standardQa.name} at $
            {HUMAN_REVIEW_RATES.standardQa.hourlyRate}/hr (
            {qaEstimate.hours}h × ${HUMAN_REVIEW_RATES.standardQa.hourlyRate}/hr ≈ $
            {qaEstimate.total}) if A&P-grade verification isn't required.
          </p>
          <p className="mt-1 text-[11px] italic text-amber-700">
            v1 launch: workflow only — no charge until human review billing turns on in v2.
          </p>

          {error && (
            <div className="mt-2 rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-800">
              {error}
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => submitChoice('expert_ap')}
              disabled={submitting !== null}
            >
              <ShieldCheck className="mr-1 h-3 w-3" />
              {submitting === 'expert_ap' ? 'Submitting…' : 'Accept Expert Verification'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => submitChoice('standard_qa')}
              disabled={submitting !== null}
            >
              <Eye className="mr-1 h-3 w-3" />
              {submitting === 'standard_qa' ? 'Submitting…' : 'Request Standard QA'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => submitChoice('skip')}
              disabled={submitting !== null}
            >
              <X className="mr-1 h-3 w-3" />
              {submitting === 'skip' ? 'Submitting…' : 'Skip Review'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
