/**
 * data-quality.aircraft-year-backfiller
 *
 * Weekly Sunday 05:00 UTC. For every aircraft row with year IS NULL,
 * propose a year via heuristics:
 *
 *   - serial number contains a 4-digit year prefix (e.g. "1968-15234")
 *   - logbook_entries earliest entry_date -1 year is a sane lower bound
 *   - tail number N-number block can suggest a registration era
 *
 * Live FAA Civil Aviation Registry HTTP lookup is the upgrade path
 * for a future agent. This first pass is deterministic + cheap and
 * proposes (writes:false). Founder approves before commit.
 *
 * Emits 'aircraft_year_proposals' recommendation. Pure SQL.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { runAgent } from '../runner'

export interface YearProposal {
  aircraft_id: string
  tail_number: string | null
  proposed_year: number
  confidence: 'low' | 'medium' | 'high'
  source: 'serial_prefix' | 'earliest_logbook' | 'mid_estimate'
}

export interface YearBackfillReport {
  scanned: number
  proposal_count: number
  proposals: YearProposal[]
}

const YEAR_PREFIX_RE = /\b(19[2-9]\d|20[0-2]\d)\b/

export async function backfillAircraftYears(args: {
  supabase: SupabaseClient
}): Promise<{ ok: boolean; output?: YearBackfillReport; runId?: string; error?: string }> {
  return runAgent<YearBackfillReport>(
    'data-quality.aircraft-year-backfiller',
    { supabase: args.supabase, input: {} },
    async () => {
      const { data, error } = await args.supabase
        .from('aircraft')
        .select('id, tail_number, serial_number')
        .is('year', null)
        .limit(2000)
      if (error) {
        return {
          output: { scanned: 0, proposal_count: 0, proposals: [] },
          recommendation: { kind: 'aircraft_year_scan_failed', reason: error.message },
        }
      }
      type Row = { id: string; tail_number: string | null; serial_number: string | null }
      const rows = (data ?? []) as Row[]
      const proposals: YearProposal[] = []
      const aircraftIds = rows.map((r) => r.id)
      // Pull earliest logbook date per aircraft in one batch.
      const earliest = new Map<string, string>()
      if (aircraftIds.length > 0) {
        const { data: lbs } = await args.supabase
          .from('logbook_entries')
          .select('aircraft_id, entry_date')
          .in('aircraft_id', aircraftIds)
          .not('entry_date', 'is', null)
          .order('entry_date', { ascending: true })
        for (const r of (lbs ?? []) as Array<{ aircraft_id: string; entry_date: string }>) {
          if (!earliest.has(r.aircraft_id)) {
            earliest.set(r.aircraft_id, r.entry_date)
          }
        }
      }
      for (const r of rows) {
        let proposed: number | null = null
        let confidence: YearProposal['confidence'] = 'low'
        let source: YearProposal['source'] = 'mid_estimate'
        const serial = (r.serial_number ?? '').trim()
        const m = serial.match(YEAR_PREFIX_RE)
        if (m) {
          proposed = parseInt(m[1], 10)
          confidence = 'medium'
          source = 'serial_prefix'
        } else {
          const e = earliest.get(r.id)
          if (e) {
            const eYear = parseInt(e.slice(0, 4), 10)
            if (eYear > 1920 && eYear <= new Date().getFullYear()) {
              // Aircraft was at least the year of its first logbook entry
              proposed = eYear
              confidence = 'low'
              source = 'earliest_logbook'
            }
          }
        }
        if (proposed === null) continue
        proposals.push({
          aircraft_id: r.id,
          tail_number: r.tail_number,
          proposed_year: proposed,
          confidence,
          source,
        })
      }
      return {
        output: {
          scanned: rows.length,
          proposal_count: proposals.length,
          proposals,
        },
        needsHuman: proposals.length > 0,
        recommendation:
          proposals.length > 0
            ? {
                kind: 'aircraft_year_proposals',
                count: proposals.length,
                proposals: proposals.slice(0, 100),
              }
            : null,
      }
    },
  )
}
