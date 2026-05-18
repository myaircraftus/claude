/**
 * Aircraft onboarding pre-initialization.
 *
 * `runAircraftOnboarding` is fired DETACHED (not awaited) from the aircraft
 * creation API right after the row is inserted — the client gets its aircraft
 * back immediately while this primes things in the background:
 *
 *   Track A — best-effort FAA registry enrichment: fill in any missing
 *             make / model / year / serial / engine fields from the FAA
 *             registry (lib/faa/service.ts).
 *   Track B — prime an (empty) BM25 index so the first document upload has an
 *             index to extend, and record searches degrade cleanly meanwhile.
 *
 * `aircraft.onboarding_status` walks pending → processing → ready (or failed)
 * so the UI can show a "setting up…" state.
 *
 * This is NOT an LLM "agent swarm" — the steps are plain async functions; the
 * only reason to background them is to keep aircraft creation instant. Every
 * track is independently try/caught: a failure is logged and never blocks the
 * others or the owner. The aircraft is fully usable regardless of outcome.
 *
 * NOT done here, deliberately:
 *   - PageIndex tree root: page_tree_nodes.doc_id is NOT NULL — tree nodes are
 *     per-document and are built when the first document is ingested.
 *   - Compliance placeholders: fabricating "annual due" / expiry dates for an
 *     aircraft with no records would put fictitious airworthiness data in front
 *     of the owner. Compliance is populated from real uploaded documents.
 *   - intelligence_cache pre-warm: a cached "no documents" placeholder would be
 *     served for up to 24h after the owner's first upload (stale-cache bug).
 *     The intelligence modules already render an instant empty state uncached.
 */
import { createServiceSupabase } from '@/lib/supabase/server'
import { lookupTailNumber } from '@/lib/faa/service'
import { buildBm25Index } from '@/lib/rag/bm25-index'

/** Run onboarding pre-init for one aircraft. Never throws — fire-and-forget. */
export async function runAircraftOnboarding(aircraftId: string): Promise<void> {
  const supabase = createServiceSupabase()

  try {
    await supabase
      .from('aircraft')
      .update({ onboarding_status: 'processing' })
      .eq('id', aircraftId)

    const { data: ac } = await supabase
      .from('aircraft')
      .select('id, tail_number, make, model, year, serial_number, engine_make, engine_model')
      .eq('id', aircraftId)
      .maybeSingle()

    // ── Track A — FAA registry enrichment (best-effort) ────────────────────
    if (ac?.tail_number) {
      try {
        const outcome = await lookupTailNumber(supabase, ac.tail_number)
        const r = outcome?.result
        if (r) {
          const patch: Record<string, unknown> = {}
          if (!ac.make && r.make) patch.make = r.make
          if (!ac.model && r.model) patch.model = r.model
          if (!ac.year && r.year) patch.year = r.year
          if (!ac.serial_number && r.serial_number) patch.serial_number = r.serial_number
          if (!ac.engine_make && r.engine_make) patch.engine_make = r.engine_make
          if (!ac.engine_model && r.engine_model) patch.engine_model = r.engine_model
          if (Object.keys(patch).length > 0) {
            await supabase.from('aircraft').update(patch).eq('id', aircraftId)
          }
        }
      } catch (err) {
        console.warn(`[onboarding] FAA enrichment failed for ${aircraftId}:`, err)
      }
    }

    // ── Track B — prime the BM25 index (best-effort) ───────────────────────
    // With zero documents this writes an empty index; the post-upload trigger
    // rebuilds it once real chunks exist. searchBm25 already degrades to []
    // on a missing index, so this is belt-and-suspenders.
    try {
      await buildBm25Index(aircraftId)
    } catch (err) {
      console.warn(`[onboarding] BM25 prime failed for ${aircraftId}:`, err)
    }

    await supabase
      .from('aircraft')
      .update({ onboarding_status: 'ready' })
      .eq('id', aircraftId)
  } catch (err) {
    console.error(`[onboarding] pre-init failed for aircraft ${aircraftId}:`, err)
    // Best-effort mark as failed — the aircraft is still fully usable.
    try {
      await createServiceSupabase()
        .from('aircraft')
        .update({ onboarding_status: 'failed' })
        .eq('id', aircraftId)
    } catch {
      /* swallow — nothing more we can do */
    }
  }
}
