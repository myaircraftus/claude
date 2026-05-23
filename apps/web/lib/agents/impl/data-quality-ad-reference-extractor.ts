/**
 * data-quality.ad-reference-extractor
 *
 * Nightly sweep over logbook_entries with NULL ad_reference whose
 * narrative contains a recognisable AD/SB pattern. For each match,
 * suggests promoting the parsed reference into the structured column
 * so the airworthiness-context agent can find it.
 *
 * Heuristic regex — no LLM. Two passes:
 *   1) "AD 2023-12-04" / "AD-2023-12-04" / "AD 23-12-04" style
 *   2) "Service Bulletin SB-12345" / "SB ABC-001"
 *
 * Emits 'ad_reference_promotions' recommendation; an admin clicks
 * "Apply" on /admin/agents which writes back via existing API.
 *
 * Safe to run repeatedly — only entries with null ad_reference are
 * considered.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { runAgent } from '../runner'

const AD_RE = /\bAD[\s-]?(\d{2,4}-\d{1,4}(?:-\d{1,3})?)\b/gi
const SB_RE = /\bSB[\s-]?([A-Z0-9][A-Z0-9-]{2,16})\b/gi
const SL_RE = /\bSL[\s-]?([A-Z0-9][A-Z0-9-]{2,16})\b/gi

export interface AdPromotion {
  entry_id: string
  aircraft_id: string | null
  reference: string
  kind: 'AD' | 'SB' | 'SL'
  preview: string
}

export interface AdExtractorReport {
  scanned: number
  promotion_count: number
  promotions: AdPromotion[]
}

function firstMatch(text: string, re: RegExp): RegExpExecArray | null {
  re.lastIndex = 0
  return re.exec(text)
}

export async function extractAdReferences(args: {
  supabase: SupabaseClient
  organizationId?: string
}): Promise<{ ok: boolean; output?: AdExtractorReport; runId?: string; error?: string }> {
  return runAgent<AdExtractorReport>(
    'data-quality.ad-reference-extractor',
    {
      supabase: args.supabase,
      input: { organization_id_filter: args.organizationId ?? null },
    },
    async () => {
      let q = args.supabase
        .from('logbook_entries')
        .select('id, aircraft_id, narrative, ad_reference, sb_reference')
        .is('ad_reference', null)
        .not('narrative', 'is', null)
        .limit(5000)
      if (args.organizationId) q = q.eq('organization_id', args.organizationId)
      const { data } = await q
      type Row = {
        id: string
        aircraft_id: string | null
        narrative: string | null
        ad_reference: string | null
        sb_reference: string | null
      }
      const rows = (data ?? []) as Row[]
      const promotions: AdPromotion[] = []
      for (const r of rows) {
        const narrative = (r.narrative ?? '').trim()
        if (narrative.length < 6) continue
        // Prefer the first AD match; otherwise SB; otherwise SL.
        const ad = firstMatch(narrative, AD_RE)
        const sb = !ad ? firstMatch(narrative, SB_RE) : null
        const sl = !ad && !sb ? firstMatch(narrative, SL_RE) : null
        const pick = ad ?? sb ?? sl
        if (!pick) continue
        const kind: AdPromotion['kind'] = ad ? 'AD' : sb ? 'SB' : 'SL'
        const reference = `${kind} ${pick[1]}`.trim()
        const idx = pick.index ?? 0
        const previewStart = Math.max(0, idx - 40)
        const previewEnd = Math.min(narrative.length, idx + reference.length + 40)
        promotions.push({
          entry_id: r.id,
          aircraft_id: r.aircraft_id,
          reference,
          kind,
          preview: narrative.slice(previewStart, previewEnd).replace(/\s+/g, ' '),
        })
      }
      return {
        output: {
          scanned: rows.length,
          promotion_count: promotions.length,
          promotions,
        },
        needsHuman: promotions.length > 0,
        recommendation:
          promotions.length > 0
            ? {
                kind: 'ad_reference_promotions',
                count: promotions.length,
                promotions: promotions.slice(0, 50),
              }
            : null,
      }
    },
  )
}
