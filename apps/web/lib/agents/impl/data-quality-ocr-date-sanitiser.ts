/**
 * OCR date sanitiser — nightly cron.
 *
 * Sweeps page_tree_nodes for entries with an impossible date_iso
 * (date < aircraft.year - 1 OR date > today + 1y) and nulls them
 * out, recording how many rows were touched. The same range check
 * is enforced at query time elsewhere, but this is the at-rest
 * version — it keeps the column actually clean.
 *
 * Pure SQL, no LLM. Runs through the standard agent runner so the
 * sweep gets an audit row.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { runAgent } from '../runner'

export interface SanitiserOutput {
  scanned: number
  nulled: number
  // We capture the worst 5 outliers for the audit row so an admin
  // can sanity-check if the cron suddenly nukes a lot of dates.
  examples: Array<{ id: string; date_iso: string | null; reason: string }>
}

export async function sanitiseOcrDates(args: {
  supabase: SupabaseClient
  /** Dry-run mode for the /admin/agents UI — counts but doesn't UPDATE. */
  dryRun?: boolean
}): Promise<{ ok: boolean; output?: SanitiserOutput; runId?: string; error?: string }> {
  return runAgent<SanitiserOutput>(
    'data-quality.ocr-date-sanitiser',
    {
      supabase: args.supabase,
      input: { dry_run: !!args.dryRun },
    },
    async () => {
      const todayPlus1y = new Date()
      todayPlus1y.setFullYear(todayPlus1y.getFullYear() + 1)
      const upperBound = todayPlus1y.toISOString().slice(0, 10) // YYYY-MM-DD

      // 1. Pull candidate rows. We don't rely on a server-side RPC — the
      // direct join is fast enough at our scale and avoids a migration.
      type CandidateRow = {
        id: string
        date_iso: string | null
        aircraft_year: number | null
      }
      const { data: rawData } = await args.supabase
        .from('page_tree_nodes')
        .select('id, date_iso, aircraft:aircraft_id (year)')
        .not('date_iso', 'is', null)
        .limit(5000)
      const rows: CandidateRow[] = ((rawData ?? []) as Array<{
        id: string
        date_iso: string | null
        aircraft?: { year?: number | null } | { year?: number | null }[] | null
      }>).map((r) => {
        // Supabase may return the relation as object OR array depending on
        // FK cardinality; normalise to a number-or-null.
        let year: number | null = null
        if (Array.isArray(r.aircraft)) year = r.aircraft[0]?.year ?? null
        else if (r.aircraft && typeof r.aircraft === 'object') year = r.aircraft.year ?? null
        return { id: r.id, date_iso: r.date_iso, aircraft_year: year }
      })

      const nullable: Array<{ id: string; date_iso: string | null; reason: string }> = []
      for (const r of rows) {
        if (!r.date_iso) continue
        const year = parseInt(r.date_iso.slice(0, 4), 10)
        if (!Number.isFinite(year)) continue
        let reason: string | null = null
        if (r.date_iso > upperBound) reason = `> today + 1y (${upperBound})`
        else if (r.aircraft_year && year < r.aircraft_year - 1) {
          reason = `< aircraft.year - 1 (${r.aircraft_year - 1})`
        }
        if (reason) nullable.push({ id: r.id, date_iso: r.date_iso, reason })
      }

      const output: SanitiserOutput = {
        scanned: rows.length,
        nulled: 0,
        examples: nullable.slice(0, 5),
      }

      if (args.dryRun || nullable.length === 0) {
        return { output }
      }

      // 2. NULL out in chunks of 200 to keep transactions small.
      const ids = nullable.map((n) => n.id)
      for (let i = 0; i < ids.length; i += 200) {
        const slice = ids.slice(i, i + 200)
        const { error: updErr } = await args.supabase
          .from('page_tree_nodes')
          .update({ date_iso: null })
          .in('id', slice)
        if (updErr) {
          // Log and stop — partial is OK, we'll catch the rest tomorrow.
          console.warn('[ocr-date-sanitiser] update failed:', updErr.message)
          break
        }
        output.nulled += slice.length
      }
      return { output, needsHuman: output.nulled > 100 }
    },
  )
}
