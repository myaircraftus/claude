/**
 * Inspection status compute (Spec 1.3).
 *
 * Pure helpers — given a list of procedure items + their results, derive
 * - completion percentage
 * - whether the inspection is "complete" or "complete-requires-attention"
 *   (any item failed)
 * - what's still missing (unanswered items)
 *
 * Server-side completion endpoint and client-side ProcedureRunner both
 * read from here so the rules stay aligned.
 */

import type {
  Inspection,
  InspectionResult,
  InspectionStatus,
  ProcedureItem,
} from '@/types'

export interface InspectionProgress {
  total: number
  answered: number
  passed: number
  failed: number
  /** Items that are answered but failed (passed === false). */
  failed_items: ProcedureItem[]
  /** Items with no result yet. */
  pending_items: ProcedureItem[]
  /** 0..1 fraction of items that have a result. */
  fraction_answered: number
}

/**
 * Compute progress for an inspection. The result rows are matched to items
 * by `procedure_item_id`. Items without a result are 'pending'.
 *
 * "Answered" means there's a result row AND the value is non-null OR
 * passed is non-null. An empty-string-value row created during a save-
 * partial is considered pending.
 */
export function computeInspectionProgress(
  items: ProcedureItem[],
  results: InspectionResult[],
): InspectionProgress {
  const byItemId = new Map<string, InspectionResult>(
    results.map((r) => [r.procedure_item_id, r]),
  )

  const failed_items: ProcedureItem[] = []
  const pending_items: ProcedureItem[] = []
  let answered = 0
  let passed = 0
  let failed = 0

  for (const item of items) {
    const r = byItemId.get(item.id)
    if (!r || !isAnswered(r)) {
      pending_items.push(item)
      continue
    }
    answered += 1
    if (r.passed === true) passed += 1
    else if (r.passed === false) {
      failed += 1
      failed_items.push(item)
    }
  }

  return {
    total: items.length,
    answered,
    passed,
    failed,
    failed_items,
    pending_items,
    fraction_answered: items.length === 0 ? 1 : answered / items.length,
  }
}

/**
 * Decide the inspection's status from progress.
 *
 *   answered === 0           → 'draft'
 *   answered < total         → 'in-progress'
 *   answered === total       → 'complete'
 *     ↳ if any failed_items   → 'complete-requires-attention'
 *
 * Caller can override via the inspection.status field — the runner should
 * not flip a manually-set 'draft' back to 'in-progress' until the user
 * actually answers an item.
 */
export function deriveInspectionStatus(progress: InspectionProgress): InspectionStatus {
  if (progress.answered === 0) return 'draft'
  if (progress.answered < progress.total) return 'in-progress'
  if (progress.failed > 0) return 'complete-requires-attention'
  return 'complete'
}

/**
 * `isAnswered` — does this result row count as "the user filled this in"?
 * Empty-string values + null pass states are NOT counted, even if a row
 * exists in the DB (covers partial-save / resume flows).
 */
function isAnswered(r: InspectionResult): boolean {
  if (r.passed === true || r.passed === false) return true
  const v = r.value
  if (v === null || v === undefined) return false
  if (typeof v === 'string') return v.trim().length > 0
  if (typeof v === 'boolean') return true
  if (typeof v === 'number') return Number.isFinite(v)
  return Boolean(v)
}

/**
 * Pretty label for a status — used by the inspection UI + bell badge.
 */
export const INSPECTION_STATUS_LABEL: Record<InspectionStatus, string> = {
  draft: 'Draft',
  'in-progress': 'In progress',
  complete: 'Complete',
  'complete-requires-attention': 'Complete · attention',
}

/**
 * Convenience: does this status mean the inspection is "done" (any kind
 * of complete)? Used to gate WO close prompts and downstream wires.
 */
export function isInspectionDone(status: InspectionStatus): boolean {
  return status === 'complete' || status === 'complete-requires-attention'
}

/**
 * Helper for callers that have an Inspection + its raw items + results
 * and want one shot.
 */
export function summarizeInspection(
  inspection: Inspection,
  items: ProcedureItem[],
  results: InspectionResult[],
) {
  const progress = computeInspectionProgress(items, results)
  return {
    progress,
    derived_status: deriveInspectionStatus(progress),
    inspection_status: inspection.status,
    label: INSPECTION_STATUS_LABEL[inspection.status],
  }
}
