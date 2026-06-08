import { describe, it, expect, vi } from 'vitest'

const h = vi.hoisted(() => ({ model: null as unknown }))
vi.mock('./provider', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, resolveEmbeddingModel: () => h.model }
})

import { embedTexts } from './embed'
import { generateEmbeddings } from '@/lib/openai/embeddings'
import { mockEmbeddingModel } from './mock-models'

describe('embedTexts', () => {
  it('returns one vector per input, in order, with token usage', async () => {
    h.model = mockEmbeddingModel(1536)
    const r = await embedTexts(['a', 'b', 'c'])
    expect(r.embeddings).toHaveLength(3)
    // mock encodes the value's first char code in slot 0 → order preserved
    expect(r.embeddings[0][0]).toBe(97) // 'a'
    expect(r.embeddings[2][0]).toBe(99) // 'c'
    expect(r.embeddings[0]).toHaveLength(1536)
    expect(r.tokens).toBe(9)
  })

  it('short-circuits empty input with no model call', async () => {
    h.model = mockEmbeddingModel(1536)
    const r = await embedTexts([])
    expect(r.embeddings).toEqual([])
    expect(r.tokens).toBe(0)
  })
})

describe('generateEmbeddings (lib/openai/embeddings)', () => {
  it('maps ids → embeddings preserving order', async () => {
    h.model = mockEmbeddingModel(1536)
    const out = await generateEmbeddings([
      { id: 'x', text: 'alpha' },
      { id: 'y', text: 'beta' },
    ])
    expect(out.map((o) => o.id)).toEqual(['x', 'y'])
    expect(out[0].embedding).toHaveLength(1536)
    expect(out[0].embedding[0]).toBe(97) // 'alpha' → 'a'
    expect(out[1].embedding[0]).toBe(98) // 'beta' → 'b'
  })

  it('throws on a dimension mismatch (pgvector(1536) guard)', async () => {
    h.model = mockEmbeddingModel(512) // wrong width
    await expect(generateEmbeddings([{ id: 'x', text: 'a' }])).rejects.toThrow(/1536/)
  })

  it('returns [] for empty input', async () => {
    h.model = mockEmbeddingModel(1536)
    expect(await generateEmbeddings([])).toEqual([])
  })
})
