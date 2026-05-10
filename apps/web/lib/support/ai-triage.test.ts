/**
 * Phase 16 Sprint 16.3 — AI triage worker tests.
 *
 * Verifies:
 *   - Pattern matcher catches password / tier / doc / pricing keywords.
 *   - safeParseClassification accepts well-formed JSON, rejects garbage.
 *   - findAutoResolvePattern returns the right pattern by id.
 *   - triageTicket happy path: locks the row, classifies, auto-resolves,
 *     posts a reply, transitions to resolved.
 *   - triageTicket falls through to escalation when no pattern matches
 *     and the draftReply Anthropic call returns text.
 *   - triageTicket no-ops on a ticket whose status isn't 'new'.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the Anthropic call BEFORE importing ai-triage (avoids real API calls).
vi.mock('@/lib/ai/anthropic', () => ({
  callAnthropic: vi.fn(),
}))

import { callAnthropic } from '@/lib/ai/anthropic'
import {
  triageTicket,
  findAutoResolvePattern,
  AUTO_RESOLVE_PATTERNS,
  safeParseClassification,
} from './ai-triage'
import type { SupportTicket } from './tickets'

beforeEach(() => {
  vi.clearAllMocks()
})

// ──────────────────────────────────────────────────────────────────────
// Pattern matcher
// ──────────────────────────────────────────────────────────────────────

function fakeTicket(overrides: Partial<SupportTicket>): SupportTicket {
  return {
    id: 't1',
    organization_id: null,
    ticket_number: 'TKT-20260510-0001',
    subject: 'help',
    body: 'I need help',
    submitter_email: 'a@b.co',
    submitter_user_id: null,
    source: 'web_form',
    category: 'other',
    severity: 'P3',
    status: 'new',
    ai_first_response_at: null,
    ai_response_count: 0,
    admin_assigned_to: null,
    admin_first_response_at: null,
    resolution_summary: null,
    related_doc_id: null,
    related_aircraft_id: null,
    tags: [],
    access_token: 'tok',
    created_at: '2026-05-10T00:00:00Z',
    updated_at: '2026-05-10T00:00:00Z',
    resolved_at: null,
    deleted_at: null,
    ...overrides,
  } as SupportTicket
}

describe('AUTO_RESOLVE_PATTERNS', () => {
  it('has all four patterns from the brief', () => {
    const ids = AUTO_RESOLVE_PATTERNS.map((p) => p.id).sort()
    expect(ids).toEqual(['doc_indexing_status', 'password_reset', 'pricing_question', 'tier_lookup'])
  })

  it('matches password reset', () => {
    const t = fakeTicket({ subject: 'I forgot my password', body: 'help' })
    expect(findAutoResolvePattern(t)?.id).toBe('password_reset')
  })

  it('matches password reset (alt phrasing)', () => {
    const t = fakeTicket({ subject: 'reset password please', body: 'cannot log in' })
    expect(findAutoResolvePattern(t)?.id).toBe('password_reset')
  })

  it('matches tier lookup', () => {
    const t = fakeTicket({ subject: "What's my tier", body: 'on the dashboard' })
    expect(findAutoResolvePattern(t)?.id).toBe('tier_lookup')
  })

  it('matches doc indexing question', () => {
    const t = fakeTicket({ subject: 'when will my doc be indexed', body: 'I uploaded yesterday' })
    expect(findAutoResolvePattern(t)?.id).toBe('doc_indexing_status')
  })

  it('matches pricing question', () => {
    const t = fakeTicket({ subject: 'how does pricing work', body: 'I want to upgrade' })
    expect(findAutoResolvePattern(t)?.id).toBe('pricing_question')
  })

  it('returns null for an unrelated subject', () => {
    const t = fakeTicket({ subject: 'engine logbook conversion', body: 'columns are wrong' })
    expect(findAutoResolvePattern(t)).toBeNull()
  })
})

// ──────────────────────────────────────────────────────────────────────
// Classification parser
// ──────────────────────────────────────────────────────────────────────

describe('safeParseClassification', () => {
  it('accepts a clean JSON object', () => {
    const r = safeParseClassification(JSON.stringify({
      category: 'billing', severity: 'P1', sentiment: 'negative',
      intent: 'cant find invoice', suggested_tags: ['billing', 'invoice'],
    }))
    expect(r?.category).toBe('billing')
    expect(r?.severity).toBe('P1')
    expect(r?.suggested_tags).toEqual(['billing', 'invoice'])
  })

  it('strips code-fence wrapper', () => {
    const r = safeParseClassification('```json\n' + JSON.stringify({
      category: 'bug', severity: 'P2', sentiment: 'neutral', intent: 'broken upload',
    }) + '\n```')
    expect(r?.category).toBe('bug')
  })

  it('rejects garbage', () => {
    expect(safeParseClassification('not json at all')).toBeNull()
  })

  it('rejects out-of-enum values', () => {
    expect(safeParseClassification(JSON.stringify({
      category: 'wat', severity: 'CRITICAL', sentiment: 'mad', intent: 'x',
    }))).toBeNull()
  })

  it('caps suggested_tags to 5', () => {
    const r = safeParseClassification(JSON.stringify({
      category: 'other', severity: 'P3', sentiment: 'neutral', intent: 'x',
      suggested_tags: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
    }))
    expect(r?.suggested_tags).toHaveLength(5)
  })
})

// ──────────────────────────────────────────────────────────────────────
// triageTicket — supabase mock
// ──────────────────────────────────────────────────────────────────────

interface MockState {
  ticket?: SupportTicket | null
  /** Captured INSERT payloads, by table. */
  inserts: Record<string, Array<Record<string, unknown>>>
  /** Captured UPDATE payloads, by table. */
  updates: Record<string, Array<Record<string, unknown>>>
}

function makeMockSb(initial: SupportTicket | null) {
  const state: MockState = {
    ticket: initial,
    inserts: {},
    updates: {},
  }

  function builderFor(table: string) {
    const builder: any = {
      _pendingUpdate: undefined as Record<string, unknown> | undefined,
      _filterStatus: undefined as string | undefined,
      update: vi.fn().mockImplementation((p: Record<string, unknown>) => {
        builder._pendingUpdate = p
        return builder
      }),
      eq: vi.fn().mockImplementation((col: string, val: unknown) => {
        if (table === 'support_tickets' && col === 'status') builder._filterStatus = String(val)
        return builder
      }),
      in: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      // Resolves the chain. Filter check happens against the
      // PRE-update status. If the filter passes (or there's no filter),
      // the update applies and the row is returned.
      maybeSingle: vi.fn().mockImplementation(async () => {
        const passesFilter =
          !builder._filterStatus ||
          (state.ticket?.status === builder._filterStatus)
        if (!passesFilter) return { data: null, error: null }

        if (builder._pendingUpdate) {
          state.updates[table] = state.updates[table] ?? []
          state.updates[table].push(builder._pendingUpdate)
          if (table === 'support_tickets' && state.ticket) {
            state.ticket = { ...state.ticket, ...(builder._pendingUpdate as Partial<SupportTicket>) }
          }
          builder._pendingUpdate = undefined
        }
        return { data: state.ticket ?? null, error: null }
      }),
      single: vi.fn().mockImplementation(async () => {
        if (builder._pendingUpdate) {
          state.updates[table] = state.updates[table] ?? []
          state.updates[table].push(builder._pendingUpdate)
          builder._pendingUpdate = undefined
        }
        if (!state.ticket) return { data: null, error: { message: 'not found' } }
        return { data: state.ticket, error: null }
      }),
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockImplementation((p: Record<string, unknown>) => {
        state.inserts[table] = state.inserts[table] ?? []
        state.inserts[table].push(p)
        return {
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { id: `${table}-${(state.inserts[table] ?? []).length}` }, error: null }),
        }
      }),
      // Make plain `await sb.from(...).update(p).eq(...)` resolve too,
      // applying the update and returning a no-op result. This matches
      // the real Supabase JS client's PromiseLike behavior.
      then: (onFulfilled: (v: { data: null; error: null }) => unknown) => {
        if (builder._pendingUpdate) {
          state.updates[table] = state.updates[table] ?? []
          state.updates[table].push(builder._pendingUpdate)
          if (table === 'support_tickets' && state.ticket) {
            state.ticket = { ...state.ticket, ...(builder._pendingUpdate as Partial<SupportTicket>) }
          }
          builder._pendingUpdate = undefined
        }
        return Promise.resolve({ data: null, error: null }).then(onFulfilled)
      },
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    }
    return builder
  }

  const sb = {
    from: vi.fn().mockImplementation((table: string) => builderFor(table)),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  }
  return { sb: sb as any, state }
}

describe('triageTicket', () => {
  it('auto-resolves a password reset ticket', async () => {
    const ticket = fakeTicket({
      id: 'tkt-pw',
      subject: 'Help me reset my password',
      body: 'I cannot log in to aircraft.us',
      status: 'new',
    })
    const { sb, state } = makeMockSb(ticket)

    // Tier 0 classification — short Haiku call returning JSON.
    ;(callAnthropic as any).mockResolvedValueOnce({
      text: JSON.stringify({
        category: 'account', severity: 'P2', sentiment: 'negative',
        intent: 'reset password', suggested_tags: ['auth'],
      }),
      input_tokens: 10, output_tokens: 30, model: 'claude-3-5-haiku-latest', duration_ms: 100, cost_usd_cents: 1,
    })

    const result = await triageTicket(sb, 'tkt-pw')

    expect(result?.auto_resolved).toBe(true)
    expect(result?.action).toBe('auto_resolved')
    // Verify lock + classification update + reply insert + status flip
    const supportTicketUpdates = state.updates.support_tickets ?? []
    expect(supportTicketUpdates[0]?.status).toBe('ai_triaging') // initial lock
    const ticketReplies = state.inserts.ticket_replies ?? []
    expect(ticketReplies).toHaveLength(1)
    expect(ticketReplies[0].is_from_ai).toBe(true)
    expect(ticketReplies[0].body).toMatch(/reset/i)
    // status finally flipped to 'resolved'
    expect(supportTicketUpdates.some((u) => u.status === 'resolved')).toBe(true)
  })

  it('escalates with draft when no pattern matches', async () => {
    const ticket = fakeTicket({
      id: 'tkt-x',
      subject: 'Logbook total hours wrong after import',
      body: 'After uploading my logbook the total hours are off by 4',
      status: 'new',
    })
    const { sb, state } = makeMockSb(ticket)

    // Tier 0 classification then Tier 2 draft.
    ;(callAnthropic as any)
      .mockResolvedValueOnce({
        text: JSON.stringify({
          category: 'bug', severity: 'P2', sentiment: 'negative',
          intent: 'logbook hours wrong', suggested_tags: ['logbook'],
        }),
        input_tokens: 10, output_tokens: 30, model: 'claude-3-5-haiku-latest', duration_ms: 100, cost_usd_cents: 1,
      })
      .mockResolvedValueOnce({
        text: 'Hi — sorry to hear the hours are off. Could you share the original total on your last page so I can compare it to what we extracted? In the meantime I can re-run extraction with a higher confidence threshold.',
        input_tokens: 80, output_tokens: 60, model: 'claude-sonnet-4-5', duration_ms: 800, cost_usd_cents: 12,
      })

    const result = await triageTicket(sb, 'tkt-x')

    expect(result?.escalated).toBe(true)
    expect(result?.action).toBe('escalated_with_draft')
    // suggested_response should be staged on the ticket
    const updates = state.updates.support_tickets ?? []
    const finalUpdate = updates.find((u) => u.suggested_response != null)
    expect(finalUpdate).toBeDefined()
    expect((finalUpdate as Record<string, unknown>).suggested_response).toMatch(/sorry to hear/i)
    expect((finalUpdate as Record<string, unknown>).status).toBe('awaiting_admin')
    // No ticket_replies row should be inserted (draft only stages).
    expect(state.inserts.ticket_replies ?? []).toHaveLength(0)
  })

  it('returns null when ticket status is not new', async () => {
    const ticket = fakeTicket({ id: 'tkt-old', status: 'awaiting_admin' })
    const { sb } = makeMockSb(ticket)
    const result = await triageTicket(sb, 'tkt-old')
    expect(result).toBeNull()
  })

  it('escalates without draft when AI draft call fails', async () => {
    const ticket = fakeTicket({
      id: 'tkt-fail',
      subject: 'Edge case in logbook conversion',
      body: 'The columns shifted',
      status: 'new',
    })
    const { sb, state } = makeMockSb(ticket)

    ;(callAnthropic as any)
      .mockResolvedValueOnce({
        text: JSON.stringify({
          category: 'bug', severity: 'P2', sentiment: 'neutral',
          intent: 'logbook columns', suggested_tags: [],
        }),
        input_tokens: 10, output_tokens: 30, model: 'claude-3-5-haiku-latest', duration_ms: 100, cost_usd_cents: 1,
      })
      .mockRejectedValueOnce(new Error('anthropic 503'))

    const result = await triageTicket(sb, 'tkt-fail')

    expect(result?.escalated).toBe(true)
    expect(result?.action).toBe('escalated_no_draft')
    // No suggested_response, but status flipped to awaiting_admin.
    const updates = state.updates.support_tickets ?? []
    const escalation = updates.find((u) => u.status === 'awaiting_admin' && !u.suggested_response)
    expect(escalation).toBeDefined()
  })
})
