/**
 * rag.context-compressor
 *
 * Pure-string compressor. When the union of retrieved chunks would
 * exceed the model's usable window, we extract per-chunk only the
 * sentences containing at least one of the question's content tokens
 * (nouns, numbers, dates, part numbers). Keep the order, drop the
 * filler.
 *
 * Heuristic, no LLM — designed to run in <5ms. The token saving
 * usually lands at 40-60% on long maintenance-manual chunks.
 *
 *   compressContext({ question, chunks, maxChars: 8000 })
 *     → { compressed_chunks: [{chunk_id, text}], dropped_chunks, chars_in, chars_out }
 *
 * Caller decides what model context budget makes sense — we just hit
 * the byte cap.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { runAgent } from '../runner'

const STOP = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'but',
  'by',
  'for',
  'from',
  'has',
  'have',
  'in',
  'is',
  'it',
  'of',
  'on',
  'or',
  'that',
  'the',
  'this',
  'to',
  'was',
  'were',
  'will',
  'with',
  'which',
  'what',
  'when',
  'where',
  'how',
  'do',
  'does',
  'did',
  'i',
  'you',
  'we',
  'my',
  'our',
])

function tokens(s: string): Set<string> {
  const out = new Set<string>()
  for (const m of s.toLowerCase().matchAll(/[a-z0-9][a-z0-9.\-]{1,}/g)) {
    const t = m[0]
    if (STOP.has(t)) continue
    if (t.length < 3 && !/^\d/.test(t)) continue
    out.add(t)
  }
  return out
}

function splitSentences(s: string): string[] {
  // Generous split — keep aviation jargon together (e.g. "Cessna 172.")
  return s
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"])/g)
    .map((t) => t.trim())
    .filter(Boolean)
}

export interface CompressedChunk {
  chunk_id: string
  text: string
  original_chars: number
  kept_sentences: number
  dropped_sentences: number
}

export interface CompressionOutput {
  chars_in: number
  chars_out: number
  reduction_pct: number
  compressed_chunks: CompressedChunk[]
  dropped_chunks: string[]
}

export interface CompressionInput {
  supabase: SupabaseClient
  question: string
  chunks: Array<{ chunk_id: string; text: string }>
  maxChars?: number
  /** Always keep first N chars of any retained chunk regardless of match. Default 80. */
  alwaysKeepHeadChars?: number
}

export async function compressContext(args: CompressionInput): Promise<{
  ok: boolean
  output?: CompressionOutput
  runId?: string
  error?: string
}> {
  const maxChars = args.maxChars ?? 8000
  const head = args.alwaysKeepHeadChars ?? 80
  return runAgent<CompressionOutput>(
    'rag.context-compressor',
    {
      supabase: args.supabase,
      input: {
        chunk_count: args.chunks.length,
        max_chars: maxChars,
        chars_in_total: args.chunks.reduce((a, c) => a + c.text.length, 0),
      },
    },
    async () => {
      const keys = tokens(args.question)
      const charsIn = args.chunks.reduce((a, c) => a + c.text.length, 0)
      const compressed: CompressedChunk[] = []
      const dropped: string[] = []
      let used = 0
      for (const c of args.chunks) {
        if (used >= maxChars) {
          dropped.push(c.chunk_id)
          continue
        }
        const sentences = splitSentences(c.text)
        const headText = c.text.slice(0, head)
        const kept: string[] = headText.length > 0 ? [headText] : []
        let keptCount = headText.length > 0 ? 1 : 0
        let droppedCount = 0
        for (const s of sentences) {
          const sTokens = tokens(s)
          let overlap = 0
          for (const k of keys) if (sTokens.has(k)) overlap++
          if (overlap > 0) {
            kept.push(s)
            keptCount++
          } else {
            droppedCount++
          }
        }
        const joined = kept.join(' ').trim()
        if (joined.length === 0) {
          dropped.push(c.chunk_id)
          continue
        }
        const remaining = maxChars - used
        const finalText = joined.length > remaining ? joined.slice(0, remaining) : joined
        compressed.push({
          chunk_id: c.chunk_id,
          text: finalText,
          original_chars: c.text.length,
          kept_sentences: keptCount,
          dropped_sentences: droppedCount,
        })
        used += finalText.length
      }
      const charsOut = used
      return {
        output: {
          chars_in: charsIn,
          chars_out: charsOut,
          reduction_pct: charsIn > 0 ? Math.round(((charsIn - charsOut) / charsIn) * 100) : 0,
          compressed_chunks: compressed,
          dropped_chunks: dropped,
        },
      }
    },
  )
}
