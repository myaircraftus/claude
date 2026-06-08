import { describe, it, expect, vi } from 'vitest'
import { z } from 'zod'

const h = vi.hoisted(() => ({ model: null as unknown }))
vi.mock('./provider', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, resolveLanguageModel: () => h.model }
})

import { generateLlmObject } from './structured'
import { mockObjectModel, mockThrowingModel, fakeSupabase } from './mock-models'

describe('generateLlmObject', () => {
  it('parses the model JSON into a typed object + reports usage', async () => {
    h.model = mockObjectModel(
      { category: 'invoice', confidence: 'high', rationale: 'has an invoice number' },
      { inTok: 200, outTok: 20 },
    )
    const r = await generateLlmObject({
      model: 'gpt-4o-mini',
      schema: z.object({ category: z.string(), confidence: z.string(), rationale: z.string() }),
      prompt: 'classify this',
    })
    expect(r.object.category).toBe('invoice')
    expect(r.object.rationale).toBe('has an invoice number')
    expect(r.usage.inputTokens).toBe(200)
    expect(r.usage.outputTokens).toBe(20)
  })

  it('is LENIENT: permissive z.string() accepts off-enum values without throwing', async () => {
    // This is the migration-safety property: the wrapper returns the raw value;
    // the caller (e.g. VALID_* sets) coerces — so an off-spec model response
    // degrades the same way the old JSON.parse path did, instead of throwing.
    h.model = mockObjectModel({ category: 'totally-made-up', confidence: 'banana' })
    const r = await generateLlmObject({
      model: 'gpt-4o-mini',
      schema: z.object({ category: z.string(), confidence: z.string() }),
      prompt: 'classify',
    })
    expect(r.object.category).toBe('totally-made-up')
    expect(r.object.confidence).toBe('banana')
  })

  it('writes a success activity-log row', async () => {
    h.model = mockObjectModel({ ok: true }, { inTok: 10, outTok: 2 })
    const { client, inserts } = fakeSupabase()
    await generateLlmObject({
      model: 'gpt-4o',
      schema: z.object({ ok: z.boolean() }),
      prompt: 'x',
      supabase: client,
      log: { organization_id: 'o', scope: 's' },
    })
    expect(inserts[0]).toMatchObject({ status: 'success', model: 'gpt-4o' })
  })

  it('logs failure + rethrows on model error', async () => {
    h.model = mockThrowingModel('obj-boom')
    const { client, inserts } = fakeSupabase()
    await expect(
      generateLlmObject({
        model: 'gpt-4o',
        schema: z.object({ ok: z.boolean() }),
        prompt: 'x',
        maxRetries: 0,
        supabase: client,
        log: { organization_id: 'o', scope: 's' },
      }),
    ).rejects.toThrow()
    expect(inserts[0].status).toBe('failure')
  })
})
