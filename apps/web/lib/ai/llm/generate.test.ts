import { describe, it, expect, vi } from 'vitest'

// Inject a mock model in place of the real provider, so the REAL generateText
// runs against a fake model. normalizeUsage + defaults stay actual.
const h = vi.hoisted(() => ({ model: null as unknown }))
vi.mock('./provider', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, resolveLanguageModel: () => h.model }
})

import { generateLlmText } from './generate'
import { mockTextModel, mockThrowingModel, fakeSupabase } from './mock-models'

describe('generateLlmText', () => {
  it('returns text + normalized usage + estimated cost', async () => {
    h.model = mockTextModel('hello world', { inTok: 1_000_000, outTok: 1_000_000 })
    const r = await generateLlmText({ model: 'gpt-4o', prompt: 'hi' })
    expect(r.text).toBe('hello world')
    expect(r.usage.inputTokens).toBe(1_000_000)
    expect(r.usage.outputTokens).toBe(1_000_000)
    // gpt-4o $5/$15 per 1M → (1e6*5 + 1e6*15)/1e6 = $20 → 2000 cents.
    expect(r.costUsdCents).toBe(2000)
  })

  it('writes a success ai_activity_log row when supabase + log are provided', async () => {
    h.model = mockTextModel('ok', { inTok: 100, outTok: 50 })
    const { client, inserts } = fakeSupabase()
    await generateLlmText({
      model: 'gpt-4o-mini',
      prompt: 'hi',
      supabase: client,
      log: { organization_id: 'org1', scope: 'unit-test' },
    })
    expect(inserts).toHaveLength(1)
    expect(inserts[0]).toMatchObject({
      status: 'success',
      model: 'gpt-4o-mini',
      input_tokens: 100,
      output_tokens: 50,
      organization_id: 'org1',
      scope: 'unit-test',
    })
  })

  it('does NOT log when supabase/log are omitted', async () => {
    h.model = mockTextModel('x')
    const r = await generateLlmText({ model: 'gpt-4o', prompt: 'hi' })
    expect(r.text).toBe('x')
  })

  it('logs a failure row and rethrows on model error', async () => {
    h.model = mockThrowingModel('boom')
    const { client, inserts } = fakeSupabase()
    await expect(
      generateLlmText({
        model: 'gpt-4o',
        prompt: 'hi',
        maxRetries: 0,
        supabase: client,
        log: { organization_id: null, scope: 'unit-test' },
      }),
    ).rejects.toThrow('boom')
    expect(inserts).toHaveLength(1)
    expect(inserts[0].status).toBe('failure')
    // null org → system-org sentinel substituted at write time.
    expect(inserts[0].organization_id).toBe('00000000-0000-0000-0000-000000000000')
  })
})
