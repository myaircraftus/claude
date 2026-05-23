/**
 * safety.faa-bulletin-watcher
 *
 * Weekly: for every aircraft in our DB with a well-formed N-number,
 * fetch the FAA Civil Aviation Registry record (via the existing
 * `lib/faa/registry-lookup` helper). For each unique
 * `manufacturer + model` combination found, emit a watch-list entry
 * so the founder can manually cross-check the FAA AD database for
 * model-level airworthiness directives.
 *
 * Why not parse FAA AD pages directly? The FAA AD database lives at
 * https://drs.faa.gov which uses a JavaScript search UI we can't
 * scrape with a single GET. A future agent can drive it via Playwright
 * (once @vercel/sandbox is provisioned). For now we surface the
 * manufacturer/model bag so the founder has a focused queue to walk.
 *
 * Bounded to 30 FAA lookups per run (cache shared with the tail
 * validator's faa_registry_cache, 12h TTL). Pure HTTP — no LLM.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { runAgent } from '../runner'
import { fetchFaaRegistry } from '@/lib/faa/registry-lookup'
import { isValidTailNumber } from '@/lib/faa/registry'

export interface BulletinWatchEntry {
  manufacturer: string
  model: string
  airworthiness_class: string | null
  affected_aircraft_count: number
  example_tails: string[]
}

export interface BulletinWatchReport {
  aircraft_scanned: number
  faa_lookups: number
  models_found: number
  watch_list: BulletinWatchEntry[]
}

export async function watchFaaBulletins(args: {
  supabase: SupabaseClient
  faaLookupBudget?: number
}): Promise<{ ok: boolean; output?: BulletinWatchReport; runId?: string; error?: string }> {
  const budget = Math.max(0, Math.min(100, args.faaLookupBudget ?? 30))
  return runAgent<BulletinWatchReport>(
    'safety.faa-bulletin-watcher',
    { supabase: args.supabase, input: { faa_lookup_budget: budget } },
    async () => {
      const { data } = await args.supabase
        .from('aircraft')
        .select('id, tail_number, organization_id')
        .eq('is_archived', false)
        .not('tail_number', 'is', null)
        .limit(2000)
      type Row = { id: string; tail_number: string | null; organization_id: string | null }
      const rows = (data ?? []) as Row[]
      let lookups = 0
      let faaBudget = budget
      const grouped = new Map<string, BulletinWatchEntry>()

      for (const r of rows) {
        const tail = r.tail_number?.trim()
        if (!tail || !isValidTailNumber(tail)) continue
        if (faaBudget <= 0) break
        faaBudget -= 1
        lookups += 1
        try {
          const lookup = await fetchFaaRegistry({
            supabase: args.supabase,
            tailNumber: tail,
          })
          if (!lookup.ok || !lookup.parsed) continue
          const manufacturer = lookup.parsed.manufacturer?.trim().toUpperCase()
          const model = lookup.parsed.model?.trim().toUpperCase()
          if (!manufacturer || !model) continue
          const key = `${manufacturer} ${model}`
          const existing = grouped.get(key) ?? {
            manufacturer,
            model,
            airworthiness_class: lookup.parsed.airworthiness_class,
            affected_aircraft_count: 0,
            example_tails: [],
          }
          existing.affected_aircraft_count += 1
          if (existing.example_tails.length < 5 && !existing.example_tails.includes(tail)) {
            existing.example_tails.push(tail)
          }
          grouped.set(key, existing)
        } catch {
          // FAA helper already swallows most errors. Defensive catch
          // ensures one bad lookup doesn't poison the sweep.
        }
      }
      const watchList = Array.from(grouped.values()).sort(
        (a, b) => b.affected_aircraft_count - a.affected_aircraft_count,
      )
      return {
        output: {
          aircraft_scanned: rows.length,
          faa_lookups: lookups,
          models_found: watchList.length,
          watch_list: watchList,
        },
        needsHuman: watchList.length > 0,
        recommendation:
          watchList.length > 0
            ? {
                kind: 'faa_bulletin_watch_list',
                models: watchList.length,
                watch_list: watchList.slice(0, 50),
              }
            : null,
      }
    },
  )
}
