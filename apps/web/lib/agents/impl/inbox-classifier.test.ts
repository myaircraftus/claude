import { describe, it, expect, vi, beforeEach } from 'vitest'

// Canned model object for generateLlmObject; per-test override via h.object.
const h = vi.hoisted(() => ({
  object: { category: 'weird', confidence: 'banana', rationale: 'r' } as Record<string, unknown>,
}))
vi.mock('@/lib/ai/llm', () => ({
  generateLlmObject: async () => ({
    object: h.object,
    usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7 },
    model: 'gpt-4o-mini',
    costUsdCents: 0,
    durationMs: 1,
  }),
}))

import { classifyInboxMessage } from './inbox-classifier'

// Fake Supabase supporting both the runner (insert→select→single, update→eq)
// and the agent's inbox_messages update→eq.
function fakeSb() {
  return {
    from: () => ({
      insert: () => ({ select: () => ({ single: async () => ({ data: { id: 'run1' }, error: null }) }) }),
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

beforeEach(() => {
  process.env.OPENAI_API_KEY = 'test-key'
})

describe('classifyInboxMessage — lenient coercion preserved', () => {
  it('coerces an off-enum category to "other" and bad confidence to "low"', async () => {
    h.object = { category: 'weird', confidence: 'banana', rationale: 'x' }
    const res = await classifyInboxMessage({
      supabase: fakeSb(),
      messageId: 'm1',
      from: 'a@b.co',
      subject: 'hi',
      body: 'body',
      attachmentNames: [],
    })
    expect(res.ok).toBe(true)
    expect(res.output?.category).toBe('other')
    expect(res.output?.confidence).toBe('low')
  })

  it('passes a valid category + confidence through unchanged', async () => {
    h.object = { category: 'invoice', confidence: 'high', rationale: 'has invoice #' }
    const res = await classifyInboxMessage({
      supabase: fakeSb(),
      messageId: 'm2',
      from: 'a@b.co',
      subject: 'Invoice 123',
      body: 'amount due',
      attachmentNames: [],
    })
    expect(res.output?.category).toBe('invoice')
    expect(res.output?.confidence).toBe('high')
  })
})
