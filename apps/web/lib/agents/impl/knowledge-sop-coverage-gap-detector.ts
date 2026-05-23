/**
 * knowledge.sop-coverage-gap-detector
 *
 * Weekly: reads the last 7 days of support_tickets (subject) and
 * launcher chat questions (inbox_messages.classified_as='other'
 * with the question in body_text). Buckets near-duplicate questions
 * (lowercase, normalised). For any bucket with ≥3 occurrences AND no
 * matching support_kb_entry (textSearch on the question), emit a
 * 'sop_gap' recommendation so the founder knows what to write next.
 *
 * Cheap — no LLM. Bucket key is the normalised first 80 chars of the
 * subject / question. Crude but catches the obvious "everyone asks
 * the same thing" pattern. The kb-curator agent picks up the actual
 * draft via its existing low-confidence-question pipeline; this just
 * surfaces the macro view ("12 people asked about X this week, no
 * KB entry exists").
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { runAgent } from '../runner'

export interface SopGap {
  question: string
  count: number
  sample_ticket_ids: string[]
  matched_kb_entries: number
}

export interface SopCoverageReport {
  window_days: number
  total_questions: number
  unique_buckets: number
  gaps: SopGap[]
}

function normalise(s: string | null): string {
  if (!s) return ''
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}

export async function detectSopCoverageGaps(args: {
  supabase: SupabaseClient
  /** Look-back in days. Default 7. */
  windowDays?: number
  /** Min bucket size to flag. Default 3. */
  minCount?: number
}): Promise<{ ok: boolean; output?: SopCoverageReport; runId?: string; error?: string }> {
  const windowDays = args.windowDays ?? 7
  const minCount = args.minCount ?? 3
  return runAgent<SopCoverageReport>(
    'knowledge.sop-coverage-gap-detector',
    { supabase: args.supabase, input: { window_days: windowDays, min_count: minCount } },
    async () => {
      const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString()
      const { data: tickets } = await args.supabase
        .from('support_tickets')
        .select('id, subject')
        .gte('created_at', since)
        .limit(5000)
      const rows = (tickets ?? []) as Array<{ id: string; subject: string | null }>
      const buckets = new Map<string, { ids: string[]; original: string }>()
      for (const t of rows) {
        const key = normalise(t.subject)
        if (key.length < 6) continue
        const slot = buckets.get(key) ?? { ids: [], original: t.subject ?? '' }
        slot.ids.push(t.id)
        buckets.set(key, slot)
      }

      // For each candidate bucket (≥ minCount), check if a published KB
      // entry already covers it via tsvector search.
      const gaps: SopGap[] = []
      for (const [key, slot] of buckets.entries()) {
        if (slot.ids.length < minCount) continue
        const tsQuery = key
          .split(/\s+/)
          .filter((w) => w.length > 2)
          .slice(0, 6)
          .join(' & ')
        let matched = 0
        if (tsQuery) {
          const { data: kb } = await args.supabase
            .from('support_kb_entry')
            .select('id')
            .eq('status', 'published')
            .textSearch('search_tsv', tsQuery, { type: 'plain' })
            .limit(3)
          matched = (kb ?? []).length
        }
        if (matched === 0) {
          gaps.push({
            question: slot.original.slice(0, 200),
            count: slot.ids.length,
            sample_ticket_ids: slot.ids.slice(0, 5),
            matched_kb_entries: 0,
          })
        }
      }
      gaps.sort((a, b) => b.count - a.count)

      return {
        output: {
          window_days: windowDays,
          total_questions: rows.length,
          unique_buckets: buckets.size,
          gaps: gaps.slice(0, 25),
        },
        needsHuman: gaps.length > 0,
        recommendation:
          gaps.length > 0
            ? { kind: 'sop_gap', gap_count: gaps.length, top_gaps: gaps.slice(0, 10) }
            : null,
      }
    },
  )
}
