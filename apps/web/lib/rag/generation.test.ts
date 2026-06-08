import { describe, it, expect, vi } from 'vitest'
import type { RetrievedChunk } from '@/types'

// Canned model object for generateLlmObject; per-test override via h.object.
const h = vi.hoisted(() => ({ object: {} as Record<string, unknown> }))
vi.mock('@/lib/ai/llm', () => ({
  generateLlmObject: async () => ({
    object: h.object,
    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    model: 'gpt-4o',
    costUsdCents: 0,
    durationMs: 1,
  }),
}))
// Reduce a chunk to a citation we can assert on by chunk_id.
vi.mock('@/lib/rag/citation-anchors', () => ({
  buildAnswerCitationFromChunk: (c: { chunk_id: string }) => ({ chunk_id: c.chunk_id, preview: '' }),
}))

import { generateAnswer } from './generation'

function makeChunk(id: string, page: number): RetrievedChunk {
  return {
    chunk_id: id,
    document_id: 'd1',
    document_title: 'Doc',
    doc_type: 'logbook',
    aircraft_tail: null,
    section_title: null,
    page_number: page,
    page_number_end: null,
    chunk_text: `text-${id}`,
    context_text: null,
  } as unknown as RetrievedChunk
}

describe('generateAnswer — citation ordering / renumbering', () => {
  it('compacts sparse inline markers and renumbers them to match citations', async () => {
    const chunks = [makeChunk('c1', 1), makeChunk('c2', 2), makeChunk('c3', 3)]
    h.object = {
      answer: 'Found it [2] and also [3].',
      confidence: 'high',
      confidence_score: 0.9,
      cited_chunk_ids: [],
      warning_flags: [],
      follow_up_questions: ['next?'],
    }
    const r = await generateAnswer('q', chunks)
    // [2][3] → compacted to [1][2]; citations are c2, c3 in marker order.
    expect(r.answer).toBe('Found it [1] and also [2].')
    expect(r.citations.map((c: { chunk_id: string }) => c.chunk_id)).toEqual(['c2', 'c3'])
    expect(r.confidence).toBe('high')
  })

  it('returns insufficient_evidence when there are no chunks (no model call)', async () => {
    const r = await generateAnswer('q', [])
    expect(r.confidence).toBe('insufficient_evidence')
    expect(r.citations).toEqual([])
  })

  it('caps confidence to low when the answer resolves zero citations', async () => {
    const chunks = [makeChunk('c1', 1)]
    h.object = {
      answer: 'No markers at all here.',
      confidence: 'high',
      confidence_score: 0.95,
      cited_chunk_ids: [],
      warning_flags: [],
      follow_up_questions: [],
    }
    const r = await generateAnswer('q', chunks)
    expect(r.citations).toHaveLength(0)
    expect(r.confidence).toBe('low')
    expect(r.confidenceScore).toBeLessThanOrEqual(0.3)
  })
})
