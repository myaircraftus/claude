import { describe, it, expect, vi, beforeEach } from 'vitest'

// Inject a mock model in place of @ai-sdk/anthropic's factory so the REAL
// generateText inside callAnthropic runs against a fake model.
const h = vi.hoisted(() => ({ model: null as unknown }))
vi.mock('@ai-sdk/anthropic', () => ({ anthropic: () => h.model }))

import { callAnthropic } from './anthropic'
import { mockTextModel, mockThrowingModel, fakeSupabase } from './llm/mock-models'

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'test-key'
})

describe('callAnthropic', () => {
  it('returns text + token counts + cost and logs success', async () => {
    h.model = mockTextModel('Claude says hi', { inTok: 1_000_000, outTok: 1_000_000 })
    const { client, inserts } = fakeSupabase()
    const r = await callAnthropic(
      client,
      { system: 's', user: 'u', model: 'claude-sonnet-4-5' },
      { organization_id: 'o', scope: 'unit-test' },
    )
    expect(r.text).toBe('Claude says hi')
    expect(r.input_tokens).toBe(1_000_000)
    expect(r.output_tokens).toBe(1_000_000)
    // claude-sonnet-4-5 $3/$15 per 1M → (1e6*3 + 1e6*15)/1e6 = $18 → 1800 cents
    expect(r.cost_usd_cents).toBe(1800)
    expect(inserts[0]).toMatchObject({
      status: 'success',
      model: 'claude-sonnet-4-5',
      input_tokens: 1_000_000,
      organization_id: 'o',
    })
  })

  it('throws when ANTHROPIC_API_KEY is missing', async () => {
    delete process.env.ANTHROPIC_API_KEY
    const { client } = fakeSupabase()
    await expect(
      callAnthropic(client, { system: 's', user: 'u' }, { organization_id: null, scope: 't' }),
    ).rejects.toThrow(/ANTHROPIC_API_KEY/)
  })

  it('logs a failure row and rethrows on model error', async () => {
    h.model = mockThrowingModel('claude-boom')
    const { client, inserts } = fakeSupabase()
    await expect(
      callAnthropic(
        client,
        { system: 's', user: 'u', max_attempts: 1 },
        { organization_id: 'o', scope: 't' },
      ),
    ).rejects.toThrow()
    expect(inserts[0].status).toBe('failure')
  })
})
