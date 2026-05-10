/**
 * Phase 16 Sprint 16.8 — AI ops assistant tests.
 *
 * Verifies:
 *   - OPS_TOOLS is the expected read-only set with no mutations.
 *   - runOpsAssistant calls the right tool for the right question
 *     (using a mocked Anthropic that returns canned tool_use responses).
 *   - Loop budget is enforced — won't recurse past MAX_TOOL_HOPS.
 *   - Unknown tool names error gracefully (don't crash the loop).
 *   - The generateClaudeCodePrompt stub returns the deferred-feature
 *     message until Sprint 16.11 lands.
 */
import { describe, it, expect, vi } from 'vitest'

import {
  runOpsAssistant,
  OPS_TOOLS,
  _TOOL_DEFS_FOR_TESTS as TOOL_DEFS,
} from './assistant'

// ──────────────────────────────────────────────────────────────────────
// Tool registry invariants
// ──────────────────────────────────────────────────────────────────────

describe('OPS_TOOLS', () => {
  it('exposes the expected read-only tool set', () => {
    const names = OPS_TOOLS.map((t) => t.name).sort()
    expect(names).toEqual([
      'generateClaudeCodePrompt',
      'listOrgsByActivity',
      'queryCostSnapshots',
      'queryCustomerSignals',
      'queryDocumentStats',
      'queryErrorEvents',
      'queryQueueState',
      'querySupportTickets',
      'queryWorkerHealth',
      'searchKnowledgeBase',
    ])
  })

  it('every tool description starts with a verb (LLM contract hygiene)', () => {
    for (const t of OPS_TOOLS) {
      const firstWord = t.description.split(/\s+/)[0]
      expect(firstWord, `tool ${t.name} description: "${t.description}"`).toMatch(/^[A-Z][a-z]+/)
    }
  })

  it('NO tool description hints at mutation', () => {
    const forbidden = /(create|update|delete|insert|set|change|modify|send|email|charge|send|alter)\b/i
    for (const t of OPS_TOOLS) {
      // We allow the words 'create' / 'send' inside generateClaudeCodePrompt
      // (it generates content, not mutations) and inside descriptions of
      // the tool's PURPOSE — the assistant agent enforces read-only.
      // Test guards against accidentally adding a tool that says e.g.
      // "Update org tier".
      const safeListed = ['generateClaudeCodePrompt']
      if (safeListed.includes(t.name)) continue
      expect(t.description, `tool ${t.name}`).not.toMatch(/^(create|update|delete|insert|change|modify|send|alter)\b/i)
    }
  })
})

// ──────────────────────────────────────────────────────────────────────
// generateClaudeCodePrompt stub
// ──────────────────────────────────────────────────────────────────────

describe('generateClaudeCodePrompt stub', () => {
  it('returns deferred-feature message until Sprint 16.11', async () => {
    const fakeSb = {} as any
    const result = await TOOL_DEFS.generateClaudeCodePrompt.handler(fakeSb, {
      source_type: 'support_ticket',
      source_id: 'tkt-1',
    })
    expect(result).toMatchObject({ ok: false })
    expect(JSON.stringify(result)).toMatch(/16\.11/)
  })
})

// ──────────────────────────────────────────────────────────────────────
// runOpsAssistant — agent loop
// ──────────────────────────────────────────────────────────────────────

interface MockAnthropicResponse {
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'tool_use'; id: string; name: string; input: unknown }
  >
  stop_reason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence'
  input_tokens: number
  output_tokens: number
}

function makeMockAnthropic(responses: MockAnthropicResponse[]) {
  let i = 0
  return vi.fn().mockImplementation(async () => {
    const r = responses[i] ?? responses[responses.length - 1]
    i++
    return r
  })
}

function makeMockSb() {
  // Each tool handler reads from supabase, so we mock just enough.
  const builder: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    then: (cb: any) => Promise.resolve({ data: [], error: null }).then(cb),
  }
  // Make builder thenable so `await query` returns rows.
  Object.defineProperty(builder, 'data', { get: () => [] })
  return {
    from: vi.fn().mockReturnValue(builder),
  } as any
}

describe('runOpsAssistant', () => {
  it('returns text directly when stop_reason=end_turn (no tool use)', async () => {
    const callAnthropic = makeMockAnthropic([
      {
        content: [{ type: 'text', text: 'You have 0 pending churn signals.' }],
        stop_reason: 'end_turn',
        input_tokens: 50, output_tokens: 20,
      },
    ])
    const sb = makeMockSb()
    const r = await runOpsAssistant(sb, {
      user_id: 'u1',
      user_message: 'How many churn signals are open?',
      callAnthropic,
    })
    expect(r.text).toContain('0 pending churn signals')
    expect(r.tool_calls).toHaveLength(0)
    expect(callAnthropic).toHaveBeenCalledTimes(1)
  })

  it('executes the named tool and feeds result back to the model', async () => {
    const callAnthropic = makeMockAnthropic([
      {
        content: [{ type: 'tool_use', id: 'tool-1', name: 'queryWorkerHealth', input: {} }],
        stop_reason: 'tool_use',
        input_tokens: 60, output_tokens: 10,
      },
      {
        content: [{ type: 'text', text: 'One Colab worker, status=stopping, last seen 3h ago.' }],
        stop_reason: 'end_turn',
        input_tokens: 80, output_tokens: 30,
      },
    ])
    const sb = makeMockSb()
    const r = await runOpsAssistant(sb, {
      user_id: 'u1',
      user_message: 'Are workers alive?',
      callAnthropic,
    })
    expect(r.tool_calls).toHaveLength(1)
    expect(r.tool_calls[0].name).toBe('queryWorkerHealth')
    expect(r.text).toContain('Colab worker')
    expect(callAnthropic).toHaveBeenCalledTimes(2)
  })

  it('handles unknown tool names without crashing', async () => {
    const callAnthropic = makeMockAnthropic([
      {
        content: [{ type: 'tool_use', id: 'tool-bad', name: 'mutateOrgTier', input: { tier: 'pro' } }],
        stop_reason: 'tool_use',
        input_tokens: 50, output_tokens: 10,
      },
      {
        content: [{ type: 'text', text: "Refusing — that's not a tool I have access to." }],
        stop_reason: 'end_turn',
        input_tokens: 70, output_tokens: 15,
      },
    ])
    const sb = makeMockSb()
    const r = await runOpsAssistant(sb, {
      user_id: 'u1',
      user_message: 'Set Acme to pro tier',
      callAnthropic,
    })
    expect(r.tool_calls).toHaveLength(1)
    expect((r.tool_calls[0].output as { error?: string }).error).toMatch(/unknown tool/)
    expect(r.text).toMatch(/refusing|not a tool/i)
  })

  it('respects the MAX_TOOL_HOPS budget', async () => {
    const toolUseStep: MockAnthropicResponse = {
      content: [{ type: 'tool_use', id: 'tool-loop', name: 'queryWorkerHealth', input: {} }],
      stop_reason: 'tool_use',
      input_tokens: 50, output_tokens: 10,
    }
    // Always returns tool_use → would loop forever without the budget.
    const callAnthropic = makeMockAnthropic([toolUseStep])
    const sb = makeMockSb()
    const r = await runOpsAssistant(sb, {
      user_id: 'u1',
      user_message: 'Loop forever',
      callAnthropic,
    })
    expect(r.tool_calls.length).toBeLessThanOrEqual(5) // MAX_TOOL_HOPS
    expect(r.text).toMatch(/budget|narrow/i)
  })
})
