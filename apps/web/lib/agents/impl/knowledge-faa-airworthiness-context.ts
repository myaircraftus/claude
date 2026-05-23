/**
 * knowledge.faa-airworthiness-context
 *
 * Human-button agent. On the aircraft detail page, the founder / IA
 * clicks "Open ADs / SBs" → we assemble a one-pager of:
 *
 *   - Every logbook entry tagged as an Airworthiness Directive (AD),
 *     Service Bulletin (SB), or Service Letter referenced in our DB
 *     for this aircraft.
 *   - Highest-priority items first: status=open, then status=unknown.
 *   - We do NOT make the sign-off call — we just list what's on file
 *     and flag obvious gaps (e.g. an AD referenced once but never
 *     marked complied with).
 *
 * Pure SQL — no LLM, no external fetch. The "live FAA AD database"
 * cross-check is a follow-on agent that fetches FAA bulletins; this
 * one assembles the view from our own data.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { runAgent } from '../runner'

export interface AirworthinessLine {
  reference: string
  kind: 'AD' | 'SB' | 'SL' | 'unknown'
  status: 'complied' | 'open' | 'unknown'
  last_referenced_at: string | null
  source_entry_id: string | null
  source_document_id: string | null
  notes: string | null
}

export interface AirworthinessReport {
  aircraft_id: string
  tail_number: string | null
  line_count: number
  open_count: number
  lines: AirworthinessLine[]
}

const AD_RE = /\bAD\s*[-]?\s*\d{2,4}-\d{2,4}(?:-\d+)?\b/g
const SB_RE = /\bSB\s*[-]?\s*[A-Z0-9-]{2,}\b/g
const SL_RE = /\bSL\s*[-]?\s*[A-Z0-9-]{2,}\b/g

function classify(reference: string): AirworthinessLine['kind'] {
  if (/^AD/i.test(reference)) return 'AD'
  if (/^SB/i.test(reference)) return 'SB'
  if (/^SL/i.test(reference)) return 'SL'
  return 'unknown'
}

export async function fetchAirworthinessContext(args: {
  supabase: SupabaseClient
  aircraftId: string
  userId?: string | null
}): Promise<{ ok: boolean; output?: AirworthinessReport; runId?: string; error?: string }> {
  return runAgent<AirworthinessReport>(
    'knowledge.faa-airworthiness-context',
    {
      supabase: args.supabase,
      input: { aircraft_id: args.aircraftId },
      target: { kind: 'aircraft', id: args.aircraftId },
      triggeredBy: args.userId ?? null,
    },
    async () => {
      const { data: aircraft } = await args.supabase
        .from('aircraft')
        .select('tail_number, organization_id')
        .eq('id', args.aircraftId)
        .maybeSingle()
      const tail = (aircraft as { tail_number?: string | null } | null)?.tail_number ?? null

      // Logbook entries with explicit ad/sb/sl reference fields.
      const { data: entries } = await args.supabase
        .from('logbook_entries')
        .select(
          'id, document_id, entry_date, narrative, ad_reference, sb_reference, ad_compliance_status',
        )
        .eq('aircraft_id', args.aircraftId)
        .or('ad_reference.not.is.null,sb_reference.not.is.null')
        .order('entry_date', { ascending: false })
        .limit(500)
      type Entry = {
        id: string
        document_id: string | null
        entry_date: string | null
        narrative: string | null
        ad_reference: string | null
        sb_reference: string | null
        ad_compliance_status: string | null
      }
      const rows = (entries ?? []) as Entry[]
      const byRef = new Map<string, AirworthinessLine>()
      const upsert = (
        ref: string,
        kind: AirworthinessLine['kind'],
        status: AirworthinessLine['status'],
        e: Entry,
      ) => {
        const existing = byRef.get(ref) ?? {
          reference: ref,
          kind,
          status,
          last_referenced_at: e.entry_date,
          source_entry_id: e.id,
          source_document_id: e.document_id,
          notes: e.narrative ? e.narrative.slice(0, 240) : null,
        }
        // Prefer 'complied' > 'open' > 'unknown' as the final state.
        if (status === 'complied') existing.status = 'complied'
        else if (status === 'open' && existing.status !== 'complied') existing.status = 'open'
        if (e.entry_date && (!existing.last_referenced_at || e.entry_date > existing.last_referenced_at)) {
          existing.last_referenced_at = e.entry_date
          existing.source_entry_id = e.id
          existing.source_document_id = e.document_id
        }
        byRef.set(ref, existing)
      }

      for (const e of rows) {
        const statusRaw = (e.ad_compliance_status ?? '').toLowerCase()
        const status: AirworthinessLine['status'] =
          statusRaw === 'complied' || statusRaw === 'recurring'
            ? 'complied'
            : statusRaw === 'open' || statusRaw === 'noncompliant'
              ? 'open'
              : 'unknown'
        if (e.ad_reference) upsert(e.ad_reference.trim(), 'AD', status, e)
        if (e.sb_reference) upsert(e.sb_reference.trim(), 'SB', status, e)
        // Also harvest references found inline in the narrative — only
        // add if we don't already have a structured row for them.
        const narrative = e.narrative ?? ''
        for (const m of narrative.matchAll(AD_RE)) {
          if (!byRef.has(m[0])) upsert(m[0], 'AD', 'unknown', e)
        }
        for (const m of narrative.matchAll(SB_RE)) {
          if (!byRef.has(m[0])) upsert(m[0], 'SB', 'unknown', e)
        }
        for (const m of narrative.matchAll(SL_RE)) {
          if (!byRef.has(m[0])) upsert(m[0], 'SL', 'unknown', e)
        }
      }

      // Sort: open first, then unknown, then complied; within each, most-recent first.
      const order = { open: 0, unknown: 1, complied: 2 } as const
      const lines = Array.from(byRef.values()).map((l) => ({ ...l, kind: classify(l.reference) }))
      lines.sort((a, b) => {
        const oa = order[a.status as keyof typeof order] ?? 1
        const ob = order[b.status as keyof typeof order] ?? 1
        if (oa !== ob) return oa - ob
        return (b.last_referenced_at ?? '').localeCompare(a.last_referenced_at ?? '')
      })

      const open = lines.filter((l) => l.status === 'open').length
      return {
        output: {
          aircraft_id: args.aircraftId,
          tail_number: tail,
          line_count: lines.length,
          open_count: open,
          lines,
        },
        needsHuman: open > 0,
        recommendation:
          open > 0
            ? {
                kind: 'airworthiness_open_items',
                aircraft_id: args.aircraftId,
                tail_number: tail,
                open_count: open,
                lines: lines.filter((l) => l.status !== 'complied').slice(0, 50),
              }
            : null,
      }
    },
  )
}
