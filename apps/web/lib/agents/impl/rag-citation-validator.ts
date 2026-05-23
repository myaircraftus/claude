/**
 * Citation Validator — formal version of the inline check that's
 * already in /api/ask. Exposed as a standalone agent so it can be
 * exercised from the agent console + audited uniformly.
 *
 * Input: an answer text + the retrieved chunk IDs used to ground it.
 * Output: { valid_ids, hallucinated_ids, ok }.
 *
 * Returns the SAME shape whether or not it runs as an agent (pure
 * function) — this is sql-only / pattern-match, no LLM call, no
 * tokens.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { runAgent } from '../runner'

export interface CitationValidatorOutput {
  valid_ids: string[]
  hallucinated_ids: string[]
  ok: boolean
}

const CITATION_RE = /chunk[_-]?id[=:]?\s*["']?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi

export function extractCitations(answer: string): string[] {
  const out = new Set<string>()
  for (const m of answer.matchAll(CITATION_RE)) {
    if (m[1]) out.add(m[1].toLowerCase())
  }
  return Array.from(out)
}

export async function validateCitations(args: {
  supabase: SupabaseClient
  triggeredBy?: string | null
  /** Optional ask-run id this validation is for, for the audit. */
  askRunId?: string
  answer: string
  retrievedChunkIds: string[]
}): Promise<{ ok: boolean; output?: CitationValidatorOutput; runId?: string; error?: string }> {
  return runAgent<CitationValidatorOutput>(
    'rag.citation-validator',
    {
      supabase: args.supabase,
      triggeredBy: args.triggeredBy ?? null,
      target: args.askRunId ? { kind: 'ask_run', id: args.askRunId } : undefined,
      input: { retrieved_count: args.retrievedChunkIds.length, answer_length: args.answer.length },
    },
    async () => {
      const retrieved = new Set(args.retrievedChunkIds.map((s) => s.toLowerCase()))
      const cited = extractCitations(args.answer)
      const valid: string[] = []
      const hallucinated: string[] = []
      for (const id of cited) {
        if (retrieved.has(id)) valid.push(id)
        else hallucinated.push(id)
      }
      const output: CitationValidatorOutput = {
        valid_ids: valid,
        hallucinated_ids: hallucinated,
        ok: hallucinated.length === 0,
      }
      return {
        output,
        needsHuman: hallucinated.length > 0,
        recommendation:
          hallucinated.length > 0
            ? {
                kind: 'hallucinated_citations',
                count: hallucinated.length,
                ids: hallucinated,
              }
            : null,
      }
    },
  )
}
