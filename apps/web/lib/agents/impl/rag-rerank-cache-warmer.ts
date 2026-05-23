/**
 * rag.rerank-cache-warmer
 *
 * Every 6 hours, runs the most-frequently-asked questions through the
 * retrieval+rerank pipeline at low priority. Keeps the Cohere
 * rerank LRU cache warm so the next real user query lands sub-second
 * rather than paying the cold-cache hop.
 *
 * No-ops cleanly when COHERE_API_KEY is unset.
 *
 * Heuristic question selection:
 *   - Pull the top-100 most-frequent normalised questions from
 *     ask_logs in the last 14 days
 *   - For each, ping Cohere rerank against a sample of common doc
 *     chunks (3 random per question — kept tiny so the cron stays
 *     well under the 60s budget)
 *
 * Emits a 'rerank_cache_warmed' recommendation only if the warming
 * loop hit unexpected errors. Successful runs surface as the normal
 * agent_runs row.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { runAgent } from '../runner'

interface WarmResult {
  question: string
  call_count: number
  ok_count: number
  error: string | null
}

export interface RerankCacheReport {
  enabled: boolean
  questions_warmed: number
  cohere_calls: number
  cohere_ok: number
  errors: number
  sample: WarmResult[]
}

function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)
}

async function rerankPing(
  cohereKey: string,
  query: string,
  docs: string[],
): Promise<{ ok: boolean; error: string | null }> {
  try {
    const res = await fetch('https://api.cohere.com/v2/rerank', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cohereKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'rerank-v3.5',
        query,
        documents: docs,
        top_n: Math.min(3, docs.length),
      }),
      signal: AbortSignal.timeout(3500),
    })
    if (!res.ok) {
      return { ok: false, error: `cohere ${res.status}` }
    }
    return { ok: true, error: null }
  } catch (err) {
    return { ok: false, error: (err as Error).message.slice(0, 120) }
  }
}

export async function warmRerankCache(args: {
  supabase: SupabaseClient
}): Promise<{ ok: boolean; output?: RerankCacheReport; runId?: string; error?: string }> {
  return runAgent<RerankCacheReport>(
    'rag.rerank-cache-warmer',
    { supabase: args.supabase, input: {} },
    async () => {
      const cohereKey = process.env.COHERE_API_KEY
      if (!cohereKey) {
        return {
          output: {
            enabled: false,
            questions_warmed: 0,
            cohere_calls: 0,
            cohere_ok: 0,
            errors: 0,
            sample: [],
          },
        }
      }
      const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
      const { data: asks } = await args.supabase
        .from('ask_logs')
        .select('question')
        .gte('created_at', since)
        .not('question', 'is', null)
        .limit(5000)
      const counts = new Map<string, number>()
      for (const r of (asks ?? []) as Array<{ question: string }>) {
        const key = normalise(r.question)
        if (key.length < 8) continue
        counts.set(key, (counts.get(key) ?? 0) + 1)
      }
      const top = Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 100)
      if (top.length === 0) {
        return {
          output: {
            enabled: true,
            questions_warmed: 0,
            cohere_calls: 0,
            cohere_ok: 0,
            errors: 0,
            sample: [],
          },
        }
      }
      // Pull a few representative chunks. We use the existing
      // page_tree_nodes table; if unavailable, skip warming.
      const { data: chunks } = await args.supabase
        .from('page_tree_nodes')
        .select('text_content')
        .not('text_content', 'is', null)
        .limit(10)
      const docs = (chunks ?? [])
        .map((c) => (c as { text_content: string | null }).text_content ?? '')
        .filter((t) => t.length > 50)
      if (docs.length === 0) {
        return {
          output: {
            enabled: true,
            questions_warmed: 0,
            cohere_calls: 0,
            cohere_ok: 0,
            errors: 0,
            sample: [],
          },
        }
      }
      let ok = 0
      let errs = 0
      const sample: WarmResult[] = []
      // Limit total ping count so we stay under the 60s budget
      const warmList = top.slice(0, 50)
      for (const [q, count] of warmList) {
        const r = await rerankPing(cohereKey, q, docs.slice(0, 3))
        if (r.ok) ok++
        else errs++
        if (sample.length < 10) {
          sample.push({ question: q.slice(0, 80), call_count: count, ok_count: r.ok ? 1 : 0, error: r.error })
        }
      }
      return {
        output: {
          enabled: true,
          questions_warmed: warmList.length,
          cohere_calls: warmList.length,
          cohere_ok: ok,
          errors: errs,
          sample,
        },
        needsHuman: errs > warmList.length / 4,
        recommendation:
          errs > warmList.length / 4
            ? { kind: 'rerank_cache_warm_failed', error_rate: errs / warmList.length, sample }
            : null,
      }
    },
  )
}
