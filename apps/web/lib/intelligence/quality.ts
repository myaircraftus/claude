import { randomUUID } from 'crypto'
import { createServiceSupabase } from '@/lib/supabase/server'

type ServiceClient = ReturnType<typeof createServiceSupabase>

type QualityPage = {
  page_number: number
  page_classification?: string | null
  ocr_confidence?: number | null
  ocr_engine?: string | null
}

type QualitySegment = {
  segmentType: string
  evidenceState: string
  canonicalCandidate: boolean
}

type BenchmarkResultRow = Record<string, unknown>

function avg(values: number[]) {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function pct(numerator: number, denominator: number) {
  if (denominator <= 0) return 0
  return numerator / denominator
}

function countBy<T extends string>(values: T[]) {
  const counts: Record<string, number> = {}
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1
  }
  return counts
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function pushBenchmarkResult(args: {
  results: BenchmarkResultRow[]
  runId: string
  itemId: string
  metricName: string
  metricScope: string
  expectedValue: unknown
  actualValue: unknown
  labels: Record<string, unknown>
}) {
  const exactMatch = args.expectedValue === args.actualValue
  const normalizedMatch =
    normalizeValue(args.expectedValue) === normalizeValue(args.actualValue)

  args.results.push({
    benchmark_run_id: args.runId,
    benchmark_item_id: args.itemId,
    metric_name: args.metricName,
    metric_scope: args.metricScope,
    expected_value:
      args.expectedValue == null ? null : String(args.expectedValue),
    actual_value: args.actualValue == null ? null : String(args.actualValue),
    exact_match: exactMatch,
    normalized_match: normalizedMatch,
    result_json: { labels: args.labels },
  })

  return { exactMatch, normalizedMatch }
}

export async function recordDocumentDriftSnapshot(args: {
  supabase: ServiceClient
  organizationId: string
  documentId: string
  documentFamily: string
  providerName: string
  pages: QualityPage[]
  segments: QualitySegment[]
  conflictCount: number
}) {
  const pageConfidences = args.pages
    .map((page) => page.ocr_confidence)
    .filter((value): value is number => typeof value === 'number')
  const autoAcceptCount = args.segments.filter((segment) => segment.evidenceState === 'canonical_candidate').length
  const reviewRequiredCount = args.segments.filter((segment) => segment.evidenceState === 'review_required').length
  const nonCanonicalCount = args.segments.filter(
    (segment) =>
      segment.evidenceState === 'informational_only' ||
      segment.evidenceState === 'non_canonical_evidence' ||
      segment.evidenceState === 'ignore'
  ).length

  const metrics = {
    page_count: args.pages.length,
    segment_count: args.segments.length,
    avg_confidence: avg(pageConfidences),
    review_rate: pct(reviewRequiredCount, Math.max(1, args.segments.length)),
    auto_accept_rate: pct(autoAcceptCount, Math.max(1, args.segments.length)),
    non_canonical_rate: pct(nonCanonicalCount, Math.max(1, args.segments.length)),
    conflict_rate: pct(args.conflictCount, Math.max(1, args.segments.length)),
    page_family_distribution: countBy(
      args.pages.map((page) => page.page_classification ?? 'unknown')
    ),
    segment_type_distribution: countBy(
      args.segments.map((segment) => segment.segmentType)
    ),
  }

  const { data: baseline } = await args.supabase
    .from('drift_snapshots')
    .select('id, metrics_json')
    .eq('organization_id', args.organizationId)
    .eq('snapshot_scope', 'document_family')
    .eq('scope_key', args.documentFamily)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const baselineMetrics =
    baseline?.metrics_json && typeof baseline.metrics_json === 'object'
      ? (baseline.metrics_json as Record<string, unknown>)
      : {}

  await args.supabase.from('drift_snapshots').insert({
    organization_id: args.organizationId,
    document_id: args.documentId,
    snapshot_scope: 'document_family',
    scope_key: args.documentFamily,
    provider_name: args.providerName,
    document_family: args.documentFamily,
    metrics_json: metrics,
    baseline_metrics_json: baselineMetrics,
  })

  const baselineAvgConfidence =
    typeof baselineMetrics.avg_confidence === 'number' ? baselineMetrics.avg_confidence : null
  const baselineReviewRate =
    typeof baselineMetrics.review_rate === 'number' ? baselineMetrics.review_rate : null
  const baselineAutoAcceptRate =
    typeof baselineMetrics.auto_accept_rate === 'number' ? baselineMetrics.auto_accept_rate : null

  const alerts: Array<{ alert_type: string; severity: 'warning' | 'critical'; title: string; message: string }> = []

  if (baselineAvgConfidence != null && metrics.avg_confidence + 0.2 < baselineAvgConfidence) {
    alerts.push({
      alert_type: 'confidence_collapse',
      severity: 'critical',
      title: `Confidence drop detected for ${args.documentFamily}`,
      message: `Average confidence fell from ${baselineAvgConfidence.toFixed(2)} to ${metrics.avg_confidence.toFixed(2)}.`,
    })
  }

  if (baselineReviewRate != null && metrics.review_rate > baselineReviewRate + 0.2) {
    alerts.push({
      alert_type: 'review_rate_spike',
      severity: 'warning',
      title: `Review rate spike for ${args.documentFamily}`,
      message: `Review-required rate increased from ${baselineReviewRate.toFixed(2)} to ${metrics.review_rate.toFixed(2)}.`,
    })
  }

  if (baselineAutoAcceptRate != null && metrics.auto_accept_rate + 0.25 < baselineAutoAcceptRate) {
    alerts.push({
      alert_type: 'auto_accept_regression',
      severity: 'warning',
      title: `Auto-accept regression for ${args.documentFamily}`,
      message: `Auto-accept rate fell from ${baselineAutoAcceptRate.toFixed(2)} to ${metrics.auto_accept_rate.toFixed(2)}.`,
    })
  }

  if (metrics.conflict_rate > 0.35) {
    alerts.push({
      alert_type: 'conflict_rate_spike',
      severity: 'warning',
      title: `Conflict spike for ${args.documentFamily}`,
      message: `Conflict rate is ${metrics.conflict_rate.toFixed(2)} for the current document.`,
    })
  }

  if (alerts.length > 0) {
    await args.supabase.from('quality_alerts').insert(
      alerts.map((alert) => ({
        organization_id: args.organizationId,
        document_id: args.documentId,
        alert_type: alert.alert_type,
        severity: alert.severity,
        status: 'open',
        title: alert.title,
        message: alert.message,
        context_json: {
          document_family: args.documentFamily,
          provider_name: args.providerName,
          metrics,
          baseline_metrics: baselineMetrics,
        },
      }))
    )
  }
}

function normalizeValue(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

export async function runBenchmarkEvaluation(args: {
  supabase: ServiceClient
  datasetId: string
  organizationId?: string | null
  triggeredBy?: string | null
  baselineLabel?: string | null
  candidateLabel?: string | null
}) {
  const { data: dataset } = await args.supabase
    .from('benchmark_datasets')
    .select('*')
    .eq('id', args.datasetId)
    .single()

  if (!dataset) {
    throw new Error('Benchmark dataset not found')
  }

  const { data: items } = await args.supabase
    .from('benchmark_items')
    .select('*, ocr_page_job:ocr_page_job_id(page_classification), ocr_entry_segment:ocr_entry_segment_id(text_content, evidence_state)')
    .eq('dataset_id', args.datasetId)

  const runId = randomUUID()
  const results: BenchmarkResultRow[] = []
  let exactMatches = 0
  let normalizedMatches = 0
  let totalComparisons = 0
  const metricCounts: Record<string, number> = {}
  const metricExactMatches: Record<string, number> = {}
  const metricNormalizedMatches: Record<string, number> = {}
  const highRiskRegressions: Array<Record<string, unknown>> = []

  function recordMetric(metricName: string, exactMatch: boolean, normalizedMatch: boolean) {
    totalComparisons += 1
    metricCounts[metricName] = (metricCounts[metricName] ?? 0) + 1
    if (exactMatch) {
      exactMatches += 1
      metricExactMatches[metricName] = (metricExactMatches[metricName] ?? 0) + 1
    }
    if (normalizedMatch) {
      normalizedMatches += 1
      metricNormalizedMatches[metricName] = (metricNormalizedMatches[metricName] ?? 0) + 1
    }
  }

  for (const item of items ?? []) {
    const labels = asRecord(item.labels_json)
    const metadata = asRecord(item.metadata_json)

    const expectedPageType = typeof labels.page_type === 'string' ? labels.page_type : null
    if (expectedPageType) {
      const actualPageType = item.ocr_page_job?.page_classification ?? null
      const { exactMatch, normalizedMatch } = pushBenchmarkResult({
        results,
        runId,
        itemId: item.id,
        metricName: 'page_classification_accuracy',
        metricScope: 'page_family',
        expectedValue: expectedPageType,
        actualValue: actualPageType,
        labels,
      })
      recordMetric('page_classification_accuracy', exactMatch, normalizedMatch)
    }

    if (labels.segment_truth && typeof labels.segment_truth === 'object') {
      const expectedSegmentState = (labels.segment_truth as Record<string, unknown>).evidence_state
      const actualSegmentState = item.ocr_entry_segment?.evidence_state ?? null
      const { exactMatch, normalizedMatch } = pushBenchmarkResult({
        results,
        runId,
        itemId: item.id,
        metricName: 'segment_state_accuracy',
        metricScope: 'segment',
        expectedValue: expectedSegmentState,
        actualValue: actualSegmentState,
        labels,
      })
      recordMetric('segment_state_accuracy', exactMatch, normalizedMatch)
    }

    const expectedSegmentationCount =
      typeof labels.entry_segmentation_count === 'number'
        ? labels.entry_segmentation_count
        : typeof labels.segment_count === 'number'
          ? labels.segment_count
          : null
    const actualSegmentationCount =
      typeof metadata.entry_segmentation_count === 'number'
        ? metadata.entry_segmentation_count
        : typeof metadata.segment_count === 'number'
          ? metadata.segment_count
          : null

    if (expectedSegmentationCount != null && actualSegmentationCount != null) {
      const { exactMatch, normalizedMatch } = pushBenchmarkResult({
        results,
        runId,
        itemId: item.id,
        metricName: 'entry_segmentation_accuracy',
        metricScope: 'document',
        expectedValue: expectedSegmentationCount,
        actualValue: actualSegmentationCount,
        labels,
      })
      recordMetric('entry_segmentation_accuracy', exactMatch, normalizedMatch)
    }

    const expectedFields = asRecord(labels.field_truths ?? labels.fields ?? labels.field_truth)
    const actualFields = asRecord(
      metadata.actual_fields ?? metadata.extracted_fields ?? metadata.canonical_fields
    )

    for (const [fieldName, expectedValue] of Object.entries(expectedFields)) {
      if (!(fieldName in actualFields)) continue

      const actualValue = actualFields[fieldName]
      const { exactMatch, normalizedMatch } = pushBenchmarkResult({
        results,
        runId,
        itemId: item.id,
        metricName: `field_${fieldName}`,
        metricScope: 'field',
        expectedValue,
        actualValue,
        labels,
      })
      recordMetric(`field_${fieldName}`, exactMatch, normalizedMatch)

      if (!normalizedMatch) {
        highRiskRegressions.push({
          benchmark_item_id: item.id,
          metric_name: `field_${fieldName}`,
          expected_value: expectedValue,
          actual_value: actualValue,
        })
      }
    }

    if (typeof labels.reminder_trigger === 'boolean') {
      const actualReminderTrigger =
        typeof metadata.actual_reminder_trigger === 'boolean'
          ? metadata.actual_reminder_trigger
          : typeof metadata.reminder_trigger === 'boolean'
            ? metadata.reminder_trigger
            : null

      if (actualReminderTrigger != null) {
        const { exactMatch, normalizedMatch } = pushBenchmarkResult({
          results,
          runId,
          itemId: item.id,
          metricName: 'reminder_trigger_correctness',
          metricScope: 'workflow',
          expectedValue: labels.reminder_trigger,
          actualValue: actualReminderTrigger,
          labels,
        })
        recordMetric('reminder_trigger_correctness', exactMatch, normalizedMatch)
        if (!exactMatch) {
          highRiskRegressions.push({
            benchmark_item_id: item.id,
            metric_name: 'reminder_trigger_correctness',
            expected_value: labels.reminder_trigger,
            actual_value: actualReminderTrigger,
          })
        }
      }
    }

    if (typeof labels.ad_evidence === 'boolean') {
      const actualAdEvidence =
        typeof metadata.actual_ad_evidence === 'boolean'
          ? metadata.actual_ad_evidence
          : typeof metadata.ad_evidence === 'boolean'
            ? metadata.ad_evidence
            : null

      if (actualAdEvidence != null) {
        const { exactMatch, normalizedMatch } = pushBenchmarkResult({
          results,
          runId,
          itemId: item.id,
          metricName: 'ad_evidence_correctness',
          metricScope: 'workflow',
          expectedValue: labels.ad_evidence,
          actualValue: actualAdEvidence,
          labels,
        })
        recordMetric('ad_evidence_correctness', exactMatch, normalizedMatch)
        if (!exactMatch) {
          highRiskRegressions.push({
            benchmark_item_id: item.id,
            metric_name: 'ad_evidence_correctness',
            expected_value: labels.ad_evidence,
            actual_value: actualAdEvidence,
          })
        }
      }
    }

    if (typeof labels.should_auto_accept === 'boolean') {
      const actualAutoAccept =
        typeof metadata.actual_auto_accept === 'boolean'
          ? metadata.actual_auto_accept
          : item.ocr_entry_segment?.evidence_state === 'canonical_candidate'

      const { exactMatch, normalizedMatch } = pushBenchmarkResult({
        results,
        runId,
        itemId: item.id,
        metricName: 'false_auto_accept_rate',
        metricScope: 'workflow',
        expectedValue: labels.should_auto_accept,
        actualValue: actualAutoAccept,
        labels,
      })
      recordMetric('false_auto_accept_rate', exactMatch, normalizedMatch)
      if (!exactMatch) {
        highRiskRegressions.push({
          benchmark_item_id: item.id,
          metric_name: 'false_auto_accept_rate',
          expected_value: labels.should_auto_accept,
          actual_value: actualAutoAccept,
        })
      }
    }

    if (typeof labels.citation_exact_anchor === 'boolean') {
      const actualCitationExactAnchor =
        typeof metadata.actual_citation_exact_anchor === 'boolean'
          ? metadata.actual_citation_exact_anchor
          : typeof metadata.citation_exact_anchor === 'boolean'
            ? metadata.citation_exact_anchor
            : null

      if (actualCitationExactAnchor != null) {
        const { exactMatch, normalizedMatch } = pushBenchmarkResult({
          results,
          runId,
          itemId: item.id,
          metricName: 'citation_anchor_exactness',
          metricScope: 'citation',
          expectedValue: labels.citation_exact_anchor,
          actualValue: actualCitationExactAnchor,
          labels,
        })
        recordMetric('citation_anchor_exactness', exactMatch, normalizedMatch)
      }
    }
  }

  const metric_summary = Object.fromEntries(
    Object.keys(metricCounts)
      .sort()
      .map((metricName) => [
        metricName,
        {
          comparisons: metricCounts[metricName] ?? 0,
          exact_match_rate:
            (metricExactMatches[metricName] ?? 0) / Math.max(1, metricCounts[metricName] ?? 0),
          normalized_match_rate:
            (metricNormalizedMatches[metricName] ?? 0) /
            Math.max(1, metricCounts[metricName] ?? 0),
        },
      ])
  )

  const summary = {
    dataset_id: args.datasetId,
    item_count: (items ?? []).length,
    total_comparisons: totalComparisons,
    exact_match_rate: totalComparisons > 0 ? exactMatches / totalComparisons : 0,
    normalized_match_rate: totalComparisons > 0 ? normalizedMatches / totalComparisons : 0,
    metric_summary,
  }

  await args.supabase.from('benchmark_runs').insert({
    id: runId,
    dataset_id: args.datasetId,
    organization_id: args.organizationId ?? dataset.organization_id ?? null,
    triggered_by: args.triggeredBy ?? null,
    run_type: 'manual',
    baseline_label: args.baselineLabel ?? null,
    candidate_label: args.candidateLabel ?? null,
    status: 'completed',
    summary_json: summary,
    high_risk_regressions: highRiskRegressions,
    completed_at: new Date().toISOString(),
  })

  if (results.length > 0) {
    await args.supabase.from('benchmark_run_results').insert(results)
  }

  return { runId, summary }
}
