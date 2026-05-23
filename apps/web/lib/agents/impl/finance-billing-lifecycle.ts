/**
 * finance.billing-lifecycle
 *
 * Nightly 03:00 UTC. Three janitorial passes that the financial side
 * has been quietly leaking on:
 *
 *   1. Estimates past valid_until that are still in a non-terminal
 *      status → flipped to 'expired'. Recommendation lists who's
 *      affected so the founder can decide to re-send.
 *   2. Invoices past due_date with balance_due > 0 that aren't already
 *      'overdue' → flipped to 'overdue' (status + payment_status).
 *   3. Invoices with balance_due ≤ 0.01 and status != 'paid' → flipped
 *      to 'paid' (catches any payment landed without the mark-paid
 *      route).
 *
 * Pure SQL. The trigger-backed totals recompute keeps the underlying
 * numbers honest; this agent just keeps the status field honest.
 *
 * Emits 'billing_lifecycle_updates' with the per-org breakdown.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { runAgent } from '../runner'

export interface LifecycleReport {
  estimates_expired: number
  invoices_marked_overdue: number
  invoices_marked_paid: number
  per_org: Array<{
    organization_id: string
    expired: number
    overdue: number
    auto_paid: number
  }>
}

const NON_TERMINAL_ESTIMATE = [
  'draft',
  'internal_review',
  'ready_to_send',
  'sent',
  'viewed',
  'owner_question',
  'awaiting_approval',
  'awaiting_deposit',
]

const NON_TERMINAL_INVOICE = [
  'draft',
  'ready_to_send',
  'sent',
  'viewed',
  'due',
  'pending',
  'partially_paid',
  'overdue',
]

export async function runBillingLifecycle(args: {
  supabase: SupabaseClient
  asOf?: Date
}): Promise<{ ok: boolean; output?: LifecycleReport; runId?: string; error?: string }> {
  const asOf = args.asOf ?? new Date()
  return runAgent<LifecycleReport>(
    'finance.billing-lifecycle',
    { supabase: args.supabase, input: { as_of: asOf.toISOString() } },
    async () => {
      const today = asOf.toISOString().slice(0, 10)
      const perOrg = new Map<
        string,
        { expired: number; overdue: number; auto_paid: number }
      >()
      const tally = (orgId: string, key: 'expired' | 'overdue' | 'auto_paid') => {
        const e = perOrg.get(orgId) ?? { expired: 0, overdue: 0, auto_paid: 0 }
        e[key] += 1
        perOrg.set(orgId, e)
      }

      // 1) Expire estimates
      const { data: estToExpire } = await args.supabase
        .from('estimates')
        .select('id, organization_id, estimate_number')
        .lt('valid_until', today)
        .in('status', NON_TERMINAL_ESTIMATE)
        .limit(1000)
      const expiredRows = (estToExpire ?? []) as Array<{
        id: string
        organization_id: string
      }>
      if (expiredRows.length > 0) {
        await args.supabase
          .from('estimates')
          .update({ status: 'expired', updated_at: new Date().toISOString() })
          .in(
            'id',
            expiredRows.map((r) => r.id),
          )
        for (const r of expiredRows) tally(r.organization_id, 'expired')
      }

      // 2) Mark overdue invoices
      const { data: invToOverdue } = await args.supabase
        .from('invoices')
        .select('id, organization_id, invoice_number')
        .lt('due_date', today)
        .gt('balance_due', 0.01)
        .in('status', ['draft', 'ready_to_send', 'sent', 'viewed', 'due', 'pending', 'partially_paid'])
        .limit(1000)
      const overdueRows = (invToOverdue ?? []) as Array<{
        id: string
        organization_id: string
      }>
      if (overdueRows.length > 0) {
        await args.supabase
          .from('invoices')
          .update({
            status: 'overdue',
            payment_status: 'overdue',
            updated_at: new Date().toISOString(),
          })
          .in(
            'id',
            overdueRows.map((r) => r.id),
          )
        for (const r of overdueRows) tally(r.organization_id, 'overdue')
      }

      // 3) Auto-paid catch-up
      const { data: invAutoPaid } = await args.supabase
        .from('invoices')
        .select('id, organization_id, invoice_number, balance_due')
        .lte('balance_due', 0.01)
        .in('status', NON_TERMINAL_INVOICE)
        .limit(1000)
      const autoPaidRows = (invAutoPaid ?? []).filter(
        (r) => Number((r as { balance_due: number | null }).balance_due ?? 0) <= 0.01,
      ) as Array<{ id: string; organization_id: string }>
      if (autoPaidRows.length > 0) {
        await args.supabase
          .from('invoices')
          .update({
            status: 'paid',
            payment_status: 'paid',
            paid_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .in(
            'id',
            autoPaidRows.map((r) => r.id),
          )
        for (const r of autoPaidRows) tally(r.organization_id, 'auto_paid')
      }

      const report: LifecycleReport = {
        estimates_expired: expiredRows.length,
        invoices_marked_overdue: overdueRows.length,
        invoices_marked_paid: autoPaidRows.length,
        per_org: Array.from(perOrg.entries()).map(([organization_id, v]) => ({
          organization_id,
          ...v,
        })),
      }
      const hasWork =
        report.estimates_expired + report.invoices_marked_overdue + report.invoices_marked_paid > 0
      return {
        output: report,
        needsHuman: report.invoices_marked_overdue > 0, // overdue is the only one a human cares about
        recommendation: hasWork
          ? {
              kind: 'billing_lifecycle_updates',
              ...report,
            }
          : null,
      }
    },
  )
}
