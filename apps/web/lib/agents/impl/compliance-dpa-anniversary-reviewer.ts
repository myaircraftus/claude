/**
 * compliance.dpa-anniversary-reviewer
 *
 * Daily 09:00 UTC. Tracks every signed Data Processing Agreement
 * (`dpa_signatures` table) and its 12-month re-review date. For
 * anything coming due in the next 30 / 7 / 0 days, emit a
 * 'dpa_anniversary_due' recommendation so the founder can re-confirm.
 *
 * Pure SQL — tolerant of an absent dpa_signatures table.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { runAgent } from '../runner'

export interface DpaDue {
  organization_id: string
  org_name: string | null
  signed_at: string
  next_review_at: string
  days_until_review: number
  signer_email: string | null
  severity: 'reminder_30' | 'reminder_7' | 'due_now' | 'overdue'
}

export interface DpaReviewerReport {
  scanned: number
  due_count: number
  due: DpaDue[]
}

const DAY_MS = 24 * 60 * 60 * 1000

export async function reviewDpaAnniversaries(args: {
  supabase: SupabaseClient
  asOf?: Date
}): Promise<{ ok: boolean; output?: DpaReviewerReport; runId?: string; error?: string }> {
  const asOf = args.asOf ?? new Date()
  return runAgent<DpaReviewerReport>(
    'compliance.dpa-anniversary-reviewer',
    { supabase: args.supabase, input: { as_of: asOf.toISOString() } },
    async () => {
      const inThirty = new Date(asOf.getTime() + 30 * DAY_MS).toISOString()
      const cutoffStart = new Date(asOf.getTime() - 365 * DAY_MS - 30 * DAY_MS).toISOString()
      const cutoffEnd = new Date(asOf.getTime() - 365 * DAY_MS + 30 * DAY_MS).toISOString()
      const { data, error } = await args.supabase
        .from('dpa_signatures')
        .select('organization_id, signed_at, signer_email, organizations(name)')
        .gte('signed_at', cutoffStart)
        .lte('signed_at', cutoffEnd)
        .order('signed_at', { ascending: true })
        .limit(1000)
      if (error) {
        return {
          output: { scanned: 0, due_count: 0, due: [] },
          recommendation: { kind: 'dpa_table_unavailable', reason: error.message.slice(0, 120) },
        }
      }
      type Row = {
        organization_id: string
        signed_at: string
        signer_email: string | null
        organizations: { name?: string | null } | Array<{ name?: string | null }> | null
      }
      const rows = (data ?? []) as Row[]
      const due: DpaDue[] = []
      for (const r of rows) {
        const signedMs = Date.parse(r.signed_at)
        const reviewMs = signedMs + 365 * DAY_MS
        const days = Math.ceil((reviewMs - asOf.getTime()) / DAY_MS)
        if (days > 30) continue
        if (Date.parse(inThirty) < reviewMs) continue
        const severity: DpaDue['severity'] =
          days < 0 ? 'overdue' : days === 0 ? 'due_now' : days <= 7 ? 'reminder_7' : 'reminder_30'
        const orgInfo = Array.isArray(r.organizations) ? r.organizations[0] : r.organizations
        due.push({
          organization_id: r.organization_id,
          org_name: orgInfo?.name ?? null,
          signed_at: r.signed_at,
          next_review_at: new Date(reviewMs).toISOString(),
          days_until_review: days,
          signer_email: r.signer_email,
          severity,
        })
      }
      due.sort((a, b) => a.days_until_review - b.days_until_review)
      return {
        output: { scanned: rows.length, due_count: due.length, due },
        needsHuman: due.length > 0,
        recommendation:
          due.length > 0
            ? { kind: 'dpa_anniversary_due', count: due.length, due: due.slice(0, 50) }
            : null,
      }
    },
  )
}
