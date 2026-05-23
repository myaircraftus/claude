/**
 * rag.query-rewriter
 *
 * Pre-RAG query expansion. Called inline from /api/ask. Goal: improve
 * recall on a small KB by widening the surface area without losing
 * specificity.
 *
 * Two layers:
 *
 *   1. Cheap deterministic expansion (always runs, no LLM)
 *      - Domain-aware aliases: "AD" → "airworthiness directive",
 *        "100hr" → "100-hour inspection", "TBO" → "time between overhaul"
 *      - Aircraft context injection: if aircraftId is present, prepend
 *        the tail number + make/model from the row
 *
 *   2. Optional LLM rewrite (gpt-4o-mini) when OPENAI_API_KEY is set
 *      and the question is ≥ 6 words. Returns 2 paraphrases. Falls
 *      back silently to the deterministic layer on any error.
 *
 * Returns { original, expanded[] } so the caller can run retrieval on
 * each variant and union/rerank the chunks.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { runAgent } from '../runner'

interface AliasPair {
  pattern: RegExp
  expansion: string
}

const ALIASES: AliasPair[] = [
  { pattern: /\bAD(s)?\b/g, expansion: 'airworthiness directive' },
  { pattern: /\bSB(s)?\b/g, expansion: 'service bulletin' },
  { pattern: /\b100[\s-]?hr\b/gi, expansion: '100-hour inspection' },
  { pattern: /\b50[\s-]?hr\b/gi, expansion: '50-hour inspection' },
  { pattern: /\bTBO\b/g, expansion: 'time between overhaul' },
  { pattern: /\bIA\b/g, expansion: 'inspection authorisation' },
  { pattern: /\bA&P\b/g, expansion: 'airframe and powerplant mechanic' },
  { pattern: /\bMOH\b/g, expansion: 'major overhaul' },
  { pattern: /\bSMOH\b/g, expansion: 'since major overhaul' },
  { pattern: /\bSTOH\b/g, expansion: 'since top overhaul' },
  { pattern: /\bSFRM\b/g, expansion: 'since factory remanufactured' },
  { pattern: /\bSNEW\b/g, expansion: 'since new' },
  { pattern: /\bSPOH\b/g, expansion: 'since prop overhaul' },
  { pattern: /\bSTC\b/g, expansion: 'supplemental type certificate' },
  { pattern: /\bAOG\b/g, expansion: 'aircraft on ground' },
]

export interface QueryRewriteOutput {
  original: string
  expanded: string[]
  aircraft_prefix: string | null
  used_llm: boolean
}

function expandDeterministic(q: string): string {
  let out = q
  for (const { pattern, expansion } of ALIASES) {
    out = out.replace(pattern, expansion)
  }
  return out
}

export async function rewriteQuery(args: {
  supabase: SupabaseClient
  question: string
  aircraftId?: string | null
  userId?: string | null
}): Promise<{ ok: boolean; output?: QueryRewriteOutput; runId?: string; error?: string }> {
  return runAgent<QueryRewriteOutput>(
    'rag.query-rewriter',
    {
      supabase: args.supabase,
      input: { aircraft_id: args.aircraftId ?? null, question_len: args.question.length },
      triggeredBy: args.userId ?? null,
    },
    async (logger) => {
      const expansions = new Set<string>()
      expansions.add(args.question)
      const deterministic = expandDeterministic(args.question)
      if (deterministic !== args.question) expansions.add(deterministic)

      // Aircraft-context prefix
      let aircraftPrefix: string | null = null
      if (args.aircraftId) {
        const { data: ac } = await args.supabase
          .from('aircraft')
          .select('tail_number, make, model')
          .eq('id', args.aircraftId)
          .maybeSingle()
        const tail = (ac as { tail_number?: string | null } | null)?.tail_number
        const make = (ac as { make?: string | null } | null)?.make
        const model = (ac as { model?: string | null } | null)?.model
        if (tail) {
          aircraftPrefix = [tail, make, model].filter(Boolean).join(' ')
          expansions.add(`${aircraftPrefix} ${args.question}`)
        }
      }

      // Optional LLM paraphrases
      let usedLlm = false
      const wordCount = args.question.trim().split(/\s+/).length
      const apiKey = process.env.OPENAI_API_KEY
      if (apiKey && wordCount >= 6 && expansions.size < 4) {
        try {
          logger.recordModel('openai', 'gpt-4o-mini')
          const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'gpt-4o-mini',
              temperature: 0.2,
              max_tokens: 200,
              messages: [
                {
                  role: 'system',
                  content:
                    'Rewrite the user question in 2 alternative phrasings for an aviation maintenance knowledge base. Keep specifics (tail numbers, dates, part numbers) verbatim. Output JSON: {"paraphrases":["...","..."]}.',
                },
                { role: 'user', content: args.question },
              ],
              response_format: { type: 'json_object' },
            }),
            signal: AbortSignal.timeout(2500),
          })
          if (res.ok) {
            const j = (await res.json()) as {
              choices?: Array<{ message?: { content?: string } }>
              usage?: { prompt_tokens?: number; completion_tokens?: number }
            }
            logger.recordTokens(j.usage?.prompt_tokens ?? 0, j.usage?.completion_tokens ?? 0)
            const raw = j.choices?.[0]?.message?.content ?? '{}'
            const parsed = JSON.parse(raw) as { paraphrases?: string[] }
            for (const p of parsed.paraphrases ?? []) {
              if (typeof p === 'string' && p.trim().length > 0) {
                expansions.add(p.trim())
              }
            }
            usedLlm = true
          }
        } catch (err) {
          // Best-effort — fall through with deterministic expansion only.
          console.warn('[rag.query-rewriter] llm rewrite failed:', (err as Error).message)
        }
      }

      const expanded = Array.from(expansions).slice(0, 5)
      return {
        output: {
          original: args.question,
          expanded,
          aircraft_prefix: aircraftPrefix,
          used_llm: usedLlm,
        },
      }
    },
  )
}
