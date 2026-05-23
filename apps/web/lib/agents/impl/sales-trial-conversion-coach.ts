/**
 * sales.trial-conversion-coach
 *
 * Daily 10:00 UTC: identifies orgs in the last 5 days of trial.
 * For each, scores the conversion likelihood from the usage signals we
 * can see in our own DB, and drafts ONE concrete outreach action.
 *
 * Signals (pure SQL, no LLM):
 *   - aircraft_count > 0 → user has actually added a plane (+30)
 *   - logbook entry exists → user is using the core feature (+25)
 *   - mechanic invited → multi-user adoption (+20)
 *   - any /api/ask call in last 3 days → engaged (+15)
 *   - any document uploaded → core workflow touched (+15)
 *
 * Coach output recommends the *next* missing action — not the score.
 * E.g. "Customer added 2 aircraft but uploaded 0 logbooks. Offer a
 * 30-min logbook-upload walkthrough."
 *
 * Emits trial_conversion_outreach recommendations. Human approves the
 * outreach — agent never auto-emails.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { runAgent } from '../runner'

interface OrgSignals {
  organization_id: string
  org_name: string | null
  trial_ends_at: string | null
  days_remaining: number
  aircraft_count: number
  logbook_entries: number
  mechanic_invites: number
  ask_calls_last_3d: number
  documents_uploaded: number
}

export interface TrialOutreach {
  organization_id: string
  org_name: string | null
  score: number
  days_remaining: number
  suggested_action: string
  signals: OrgSignals
}

export interface TrialCoachReport {
  scanned_orgs: number
  outreach_count: number
  outreach: TrialOutreach[]
}

function scoreSignals(s: OrgSignals): number {
  let score = 0
  if (s.aircraft_count > 0) score += 30
  if (s.logbook_entries > 0) score += 25
  if (s.mechanic_invites > 0) score += 20
  if (s.ask_calls_last_3d > 0) score += 15
  if (s.documents_uploaded > 0) score += 15
  return score
}

function suggestAction(s: OrgSignals): string {
  if (s.aircraft_count === 0) {
    return 'No aircraft added. Send a 5-min "add your first plane" walkthrough.'
  }
  if (s.documents_uploaded === 0) {
    return `Added ${s.aircraft_count} aircraft but no logbooks. Offer a Drive-import walkthrough.`
  }
  if (s.logbook_entries === 0 && s.documents_uploaded > 0) {
    return 'Uploaded logbooks but no entries promoted. Run a "review extracted entries" session.'
  }
  if (s.mechanic_invites === 0 && s.aircraft_count > 0) {
    return 'Solo owner — invite their A&P to demonstrate multi-user value.'
  }
  if (s.ask_calls_last_3d === 0) {
    return 'Has data but hasn\'t used Ask in 3+ days. Send 3 example questions for their fleet.'
  }
  return 'Active user. Send the case-study email + a free annual-tracking template.'
}

export async function coachTrialConversion(args: {
  supabase: SupabaseClient
  /** Override "today" for replay / debug. */
  asOf?: Date
}): Promise<{ ok: boolean; output?: TrialCoachReport; runId?: string; error?: string }> {
  const asOf = args.asOf ?? new Date()
  return runAgent<TrialCoachReport>(
    'sales.trial-conversion-coach',
    { supabase: args.supabase, input: { as_of: asOf.toISOString() } },
    async () => {
      const inFive = new Date(asOf.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString()
      const { data: orgs } = await args.supabase
        .from('organizations')
        .select('id, name, subscription_status, trial_ends_at')
        .eq('subscription_status', 'trial')
        .not('trial_ends_at', 'is', null)
        .lte('trial_ends_at', inFive)
        .gte('trial_ends_at', asOf.toISOString())
        .limit(500)
      type Org = {
        id: string
        name: string | null
        subscription_status: string | null
        trial_ends_at: string | null
      }
      const orgRows = (orgs ?? []) as Org[]
      if (orgRows.length === 0) {
        return {
          output: { scanned_orgs: 0, outreach_count: 0, outreach: [] },
        }
      }
      const orgIds = orgRows.map((o) => o.id)
      const since3d = new Date(asOf.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString()
      const [acRes, lbRes, invRes, askRes, docsRes] = await Promise.all([
        args.supabase
          .from('aircraft')
          .select('organization_id')
          .in('organization_id', orgIds),
        args.supabase
          .from('logbook_entries')
          .select('organization_id')
          .in('organization_id', orgIds),
        args.supabase
          .from('mechanic_invites')
          .select('organization_id')
          .in('organization_id', orgIds),
        args.supabase
          .from('ask_logs')
          .select('organization_id')
          .in('organization_id', orgIds)
          .gte('created_at', since3d),
        args.supabase
          .from('documents')
          .select('organization_id')
          .in('organization_id', orgIds),
      ])
      const tally = (rows: Array<{ organization_id?: string | null }> | null | undefined) => {
        const counts = new Map<string, number>()
        for (const r of rows ?? []) {
          if (!r.organization_id) continue
          counts.set(r.organization_id, (counts.get(r.organization_id) ?? 0) + 1)
        }
        return counts
      }
      const acCounts = tally(acRes.data as Array<{ organization_id?: string | null }> | null)
      const lbCounts = tally(lbRes.data as Array<{ organization_id?: string | null }> | null)
      const invCounts = tally(invRes.data as Array<{ organization_id?: string | null }> | null)
      const askCounts = tally(askRes.data as Array<{ organization_id?: string | null }> | null)
      const docsCounts = tally(docsRes.data as Array<{ organization_id?: string | null }> | null)

      const outreach: TrialOutreach[] = []
      for (const o of orgRows) {
        const trialEnd = o.trial_ends_at ? new Date(o.trial_ends_at) : null
        const daysRemaining = trialEnd
          ? Math.max(0, Math.ceil((trialEnd.getTime() - asOf.getTime()) / (24 * 60 * 60 * 1000)))
          : 0
        const signals: OrgSignals = {
          organization_id: o.id,
          org_name: o.name,
          trial_ends_at: o.trial_ends_at,
          days_remaining: daysRemaining,
          aircraft_count: acCounts.get(o.id) ?? 0,
          logbook_entries: lbCounts.get(o.id) ?? 0,
          mechanic_invites: invCounts.get(o.id) ?? 0,
          ask_calls_last_3d: askCounts.get(o.id) ?? 0,
          documents_uploaded: docsCounts.get(o.id) ?? 0,
        }
        outreach.push({
          organization_id: o.id,
          org_name: o.name,
          score: scoreSignals(signals),
          days_remaining: daysRemaining,
          suggested_action: suggestAction(signals),
          signals,
        })
      }
      outreach.sort((a, b) => a.days_remaining - b.days_remaining || b.score - a.score)
      return {
        output: {
          scanned_orgs: orgRows.length,
          outreach_count: outreach.length,
          outreach,
        },
        needsHuman: outreach.length > 0,
        recommendation:
          outreach.length > 0
            ? { kind: 'trial_conversion_outreach', count: outreach.length, outreach }
            : null,
      }
    },
  )
}
