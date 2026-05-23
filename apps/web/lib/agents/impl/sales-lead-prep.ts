/**
 * sales.lead-prep
 *
 * Event-triggered: fires when a new shop signs up for a trial.
 * Assembles a 1-pager brief for the founder including everything we
 * know about the lead from our own DB:
 *
 *   - org name + slug + signup persona
 *   - aircraft already added (with tail numbers + make/model)
 *   - launcher questions asked in their first 24h
 *   - documents uploaded
 *   - probable persona segmentation (solo owner / multi-aircraft /
 *     shop with mechanics)
 *   - the 3 most likely demo questions for their fleet (heuristic
 *     based on aircraft age, hours since overhaul, type)
 *
 * Pure SQL — no LLM call required. The brief is meant for the
 * founder's eyes only; emitted as a 'lead_brief' recommendation
 * surfaced in /admin/agents.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { runAgent } from '../runner'

export interface LeadAircraft {
  id: string
  tail_number: string | null
  make: string | null
  model: string | null
  year: number | null
}

export interface LeadBrief {
  organization_id: string
  org_name: string | null
  slug: string | null
  persona: string | null
  signed_up_at: string
  aircraft_count: number
  aircraft: LeadAircraft[]
  questions_asked: string[]
  document_count: number
  segment: 'solo_owner' | 'multi_aircraft_owner' | 'small_shop' | 'fleet_operator' | 'unknown'
  suggested_demo_questions: string[]
}

function segmentLead(aircraftCount: number, mechanicCount: number): LeadBrief['segment'] {
  if (mechanicCount >= 2) return aircraftCount >= 5 ? 'fleet_operator' : 'small_shop'
  if (aircraftCount >= 3) return 'multi_aircraft_owner'
  if (aircraftCount >= 1) return 'solo_owner'
  return 'unknown'
}

function suggestDemoQuestions(ac: LeadAircraft[]): string[] {
  if (ac.length === 0) return ['What\'s a typical 100-hour inspection scope?']
  const tails = ac.map((a) => a.tail_number).filter(Boolean).slice(0, 2)
  const out: string[] = []
  if (tails[0]) out.push(`What's the last logbook entry for ${tails[0]}?`)
  if (tails[0]) out.push(`Are there any open ADs on ${tails[0]}?`)
  if (ac.length > 1) {
    out.push(`Which of my aircraft is closest to its next annual?`)
  } else {
    out.push(`When was the last engine overhaul on ${tails[0] ?? 'my aircraft'}?`)
  }
  return out
}

export async function buildLeadBrief(args: {
  supabase: SupabaseClient
  organizationId: string
}): Promise<{ ok: boolean; output?: LeadBrief; runId?: string; error?: string }> {
  return runAgent<LeadBrief>(
    'sales.lead-prep',
    {
      supabase: args.supabase,
      input: { organization_id: args.organizationId },
      target: { kind: 'organization', id: args.organizationId },
    },
    async () => {
      const { data: orgRow } = await args.supabase
        .from('organizations')
        .select('id, name, slug, signup_persona, created_at')
        .eq('id', args.organizationId)
        .maybeSingle()
      type Org = {
        id: string
        name: string | null
        slug: string | null
        signup_persona: string | null
        created_at: string
      }
      const org = orgRow as Org | null
      if (!org) {
        return {
          output: {
            organization_id: args.organizationId,
            org_name: null,
            slug: null,
            persona: null,
            signed_up_at: new Date().toISOString(),
            aircraft_count: 0,
            aircraft: [],
            questions_asked: [],
            document_count: 0,
            segment: 'unknown',
            suggested_demo_questions: [],
          },
          recommendation: { kind: 'lead_brief_org_not_found', organization_id: args.organizationId },
        }
      }
      const since = org.created_at
      const next24h = new Date(Date.parse(since) + 24 * 60 * 60 * 1000).toISOString()
      const [acRes, askRes, docsRes, mechRes] = await Promise.all([
        args.supabase
          .from('aircraft')
          .select('id, tail_number, make, model, year')
          .eq('organization_id', org.id)
          .limit(50),
        args.supabase
          .from('ask_logs')
          .select('question, created_at')
          .eq('organization_id', org.id)
          .gte('created_at', since)
          .lte('created_at', next24h)
          .order('created_at', { ascending: true })
          .limit(20),
        args.supabase
          .from('documents')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', org.id),
        args.supabase
          .from('memberships')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', org.id)
          .eq('role', 'mechanic'),
      ])
      const aircraft = (acRes.data ?? []) as LeadAircraft[]
      const questions =
        (askRes.data as Array<{ question: string | null }> | null)
          ?.map((r) => (r.question ?? '').slice(0, 240))
          .filter(Boolean) ?? []
      const segment = segmentLead(aircraft.length, mechRes.count ?? 0)
      const brief: LeadBrief = {
        organization_id: org.id,
        org_name: org.name,
        slug: org.slug,
        persona: org.signup_persona,
        signed_up_at: org.created_at,
        aircraft_count: aircraft.length,
        aircraft,
        questions_asked: questions,
        document_count: docsRes.count ?? 0,
        segment,
        suggested_demo_questions: suggestDemoQuestions(aircraft),
      }
      return {
        output: brief,
        needsHuman: true,
        recommendation: { kind: 'lead_brief', brief },
      }
    },
  )
}
