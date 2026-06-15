/**
 * Shared status display helpers for the redesigned Work Orders surfaces
 * (list v2, detail v2, create v2). Single source of truth for labels,
 * pill styles, status dots, and the happy-path lifecycle used by the
 * detail page's progress indicator.
 *
 * Sentence case throughout (matches the redesign's "calm, professional"
 * tone). Keep in sync with the DB CHECK on work_orders.status.
 */

export const WO_STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  open: 'Open',
  awaiting_approval: 'Awaiting approval',
  awaiting_parts: 'Awaiting parts',
  in_progress: 'In progress',
  waiting_on_customer: 'Waiting on customer',
  ready_for_signoff: 'Ready for sign-off',
  closed: 'Closed',
  invoiced: 'Invoiced',
  paid: 'Paid',
  archived: 'Archived',
}

/** Pill background + text (soft, low-chroma — reads calm in a long list). */
export const WO_STATUS_PILL: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  open: 'bg-blue-50 text-blue-700',
  awaiting_approval: 'bg-amber-50 text-amber-700',
  awaiting_parts: 'bg-orange-50 text-orange-700',
  in_progress: 'bg-indigo-50 text-indigo-700',
  waiting_on_customer: 'bg-amber-50 text-amber-700',
  ready_for_signoff: 'bg-emerald-50 text-emerald-700',
  closed: 'bg-green-50 text-green-700',
  invoiced: 'bg-violet-50 text-violet-700',
  paid: 'bg-green-100 text-green-800',
  archived: 'bg-slate-100 text-slate-400',
}

/** Solid dot that sits inside the pill — gives a quick colour-coded scan. */
export const WO_STATUS_DOT: Record<string, string> = {
  draft: 'bg-slate-400',
  open: 'bg-blue-500',
  awaiting_approval: 'bg-amber-500',
  awaiting_parts: 'bg-orange-500',
  in_progress: 'bg-indigo-500',
  waiting_on_customer: 'bg-amber-500',
  ready_for_signoff: 'bg-emerald-500',
  closed: 'bg-green-500',
  invoiced: 'bg-violet-500',
  paid: 'bg-green-600',
  archived: 'bg-slate-300',
}

/** Canonical happy-path lifecycle for the detail-page progress rail. */
export const WO_LIFECYCLE: { status: string; label: string }[] = [
  { status: 'draft', label: 'Draft' },
  { status: 'open', label: 'Open' },
  { status: 'in_progress', label: 'In progress' },
  { status: 'ready_for_signoff', label: 'Ready' },
  { status: 'closed', label: 'Closed' },
  { status: 'invoiced', label: 'Invoiced' },
]

export const woStatusLabel = (s: string) => WO_STATUS_LABEL[s] ?? s
export const woStatusPill = (s: string) => WO_STATUS_PILL[s] ?? WO_STATUS_PILL.draft
export const woStatusDot = (s: string) => WO_STATUS_DOT[s] ?? WO_STATUS_DOT.draft
