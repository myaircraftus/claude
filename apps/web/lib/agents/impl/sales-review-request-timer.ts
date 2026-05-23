/**
 * sales.review-request-timer
 *
 * Daily 11:00 UTC. Identifies "ready to ask for a review" customers:
 *
 *   - org has been on the platform ≥30 days
 *   - org has ≥3 aircraft
 *   - org has NO open complaints / negative feedback in last 30 days
 *   - org has at least one logbook entry promoted (real usage)
 *   - we haven't already requested a review (review_requests row
 *     missing or older than 6 months)
 *
 * Emits 'review_request_candidates' recommendation. Founder picks
 * 1-2 per week to actually ask — agent never auto-sends.
 *
 * Pure SQL.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { runAgent } from '../runner'

export interface ReviewCandidate {
  organization_id: string
  org_name: string | null
  slug: string | null
  signed_up_at: string
  days_active: number
  aircraft_count: number
  logbook_entry_count: number
  last_review_request_at: string | null
}

export interface ReviewTimerReport {
  scanned: number
  candidate_count: number
  candidates: ReviewCandidate[]
}

const DAY_MS = 24 * 60 * 60 * 1000

export async function findReviewRequestCandidates(args: {
  supabase: SupabaseClient
  asOf?: Date
}): Promise<{ ok: boolean; output?: ReviewTimerReport; runId?: string; error?: string }> {
  const asOf = args.asOf ?? new Date()
  return runAgent<ReviewTimerReport>(
    'sales.review-request-timer',
    { supabase: args.supabase, input: { as_of: asOf.toISOString() } },
    async () => {
      const thirtyDaysAgo = new Date(asOf.getTime() - 30 * DAY_MS).toISOString()
      const { data: orgs } = await args.supabase
        .from('organizations')
        .select('id, name, slug, created_at, subscription_status')
        .lte('created_at', thirtyDaysAgo)
        .in('subscription_status', ['active', 'trial'])
        .limit(2000)
      type Org = {
        id: string
        name: string | null
        slug: string | null
        created_at: string
        subscription_status: string | null
      }
      const orgRows = (orgs ?? []) as Org[]
      if (orgRows.length === 0) {
        return { output: { scanned: 0, candidate_count: 0, candidates: [] } }
      }
      const orgIds = orgRows.map((o) => o.id)
      const sixMonthsAgo = new Date(asOf.getTime() - 180 * DAY_MS).toISOString()
      const negThirtyAgo = thirtyDaysAgo
      const [acRes, lbRes, fbRes, revRes] = await Promise.all([
        args.supabase
          .from('aircraft')
          .select('organization_id')
          .in('organization_id', orgIds),
        args.supabase
          .from('logbook_entries')
          .select('organization_id')
          .in('organization_id', orgIds),
        args.supabase
          .from('feedback_items')
          .select('organization_id')
          .eq('sentiment', 'negative')
          .in('organization_id', orgIds)
          .gte('created_at', negThirtyAgo),
        args.supabase
          .from('review_requests')
          .select('organization_id, requested_at')
          .in('organization_id', orgIds)
          .gte('requested_at', sixMonthsAgo),
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
      const negCounts = tally(fbRes.data as Array<{ organization_id?: string | null }> | null)
      const recentRequest = new Set<string>()
      const lastRequestAt = new Map<string, string>()
      for (const r of (revRes.data ?? []) as Array<{
        organization_id?: string | null
        requested_at?: string | null
      }>) {
        if (!r.organization_id) continue
        recentRequest.add(r.organization_id)
        if (r.requested_at) {
          const prev = lastRequestAt.get(r.organization_id)
          if (!prev || r.requested_at > prev) {
            lastRequestAt.set(r.organization_id, r.requested_at)
          }
        }
      }

      const candidates: ReviewCandidate[] = []
      for (const o of orgRows) {
        const ac = acCounts.get(o.id) ?? 0
        const lb = lbCounts.get(o.id) ?? 0
        const neg = negCounts.get(o.id) ?? 0
        if (ac < 3) continue
        if (lb < 1) continue
        if (neg > 0) continue
        if (recentRequest.has(o.id)) continue
        const days = Math.floor((asOf.getTime() - Date.parse(o.created_at)) / DAY_MS)
        candidates.push({
          organization_id: o.id,
          org_name: o.name,
          slug: o.slug,
          signed_up_at: o.created_at,
          days_active: days,
          aircraft_count: ac,
          logbook_entry_count: lb,
          last_review_request_at: lastRequestAt.get(o.id) ?? null,
        })
      }
      candidates.sort((a, b) => b.days_active - a.days_active)
      return {
        output: {
          scanned: orgRows.length,
          candidate_count: candidates.length,
          candidates,
        },
        needsHuman: candidates.length > 0,
        recommendation:
          candidates.length > 0
            ? { kind: 'review_request_candidates', count: candidates.length, candidates }
            : null,
      }
    },
  )
}
