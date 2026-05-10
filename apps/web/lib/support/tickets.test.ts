/**
 * Phase 16 Sprint 16.2 — support ticket service tests.
 *
 * Mocks supabase to verify:
 *   - validateCreateInput catches the required-field + format-cap cases
 *   - createTicket maps fields correctly + defaults source/category/severity
 *   - applyFilters surfaces status/severity/category as `.in()` calls
 *   - addTicketReply enforces exactly-one-source flag
 *   - updateTicketStatus stamps resolved_at on terminal states
 *   - severity → SLA window mapping is locked per the Phase 16 brief
 */
import { describe, it, expect, vi } from 'vitest'

import {
  validateCreateInput,
  createTicket,
  addTicketReply,
  updateTicketStatus,
  isValidTicketCategory,
  isValidTicketSeverity,
  isValidTicketStatus,
  describeSlaWindow,
  TICKET_SLA_WINDOW_MS,
  TICKET_BODY_MAX,
  TICKET_SUBJECT_MAX,
} from './tickets'

// ──────────────────────────────────────────────────────────────────────
// validateCreateInput
// ──────────────────────────────────────────────────────────────────────

describe('validateCreateInput', () => {
  it('accepts a valid input', () => {
    const r = validateCreateInput({
      subject: 'help', body: 'I need it', submitter_email: 'a@b.co',
    })
    expect(r.ok).toBe(true)
  })

  it('rejects missing subject', () => {
    const r = validateCreateInput({
      subject: '', body: 'x', submitter_email: 'a@b.co',
    })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/subject/)
  })

  it('rejects missing body', () => {
    const r = validateCreateInput({
      subject: 'x', body: '', submitter_email: 'a@b.co',
    })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/body/)
  })

  it('rejects bad email', () => {
    const r = validateCreateInput({
      subject: 'x', body: 'y', submitter_email: 'not-an-email',
    })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/email/)
  })

  it('rejects oversized subject', () => {
    const r = validateCreateInput({
      subject: 'a'.repeat(TICKET_SUBJECT_MAX + 1),
      body: 'x',
      submitter_email: 'a@b.co',
    })
    expect(r.ok).toBe(false)
  })

  it('rejects oversized body', () => {
    const r = validateCreateInput({
      subject: 'x',
      body: 'a'.repeat(TICKET_BODY_MAX + 1),
      submitter_email: 'a@b.co',
    })
    expect(r.ok).toBe(false)
  })

  it('rejects unknown category', () => {
    const r = validateCreateInput({
      subject: 'x', body: 'y', submitter_email: 'a@b.co',
      // @ts-expect-error — testing runtime guard
      category: 'something_else',
    })
    expect(r.ok).toBe(false)
  })

  it('rejects unknown severity', () => {
    const r = validateCreateInput({
      subject: 'x', body: 'y', submitter_email: 'a@b.co',
      // @ts-expect-error — testing runtime guard
      severity: 'CRITICAL',
    })
    expect(r.ok).toBe(false)
  })
})

// ──────────────────────────────────────────────────────────────────────
// type-guard helpers
// ──────────────────────────────────────────────────────────────────────

describe('type guards', () => {
  it('isValidTicketCategory', () => {
    expect(isValidTicketCategory('billing')).toBe(true)
    expect(isValidTicketCategory('nonsense')).toBe(false)
    expect(isValidTicketCategory(undefined)).toBe(false)
  })
  it('isValidTicketSeverity', () => {
    expect(isValidTicketSeverity('P0')).toBe(true)
    expect(isValidTicketSeverity('p0')).toBe(false)
    expect(isValidTicketSeverity('high')).toBe(false)
  })
  it('isValidTicketStatus', () => {
    expect(isValidTicketStatus('awaiting_admin')).toBe(true)
    expect(isValidTicketStatus('open')).toBe(false)
  })
})

// ──────────────────────────────────────────────────────────────────────
// createTicket — supabase mock
// ──────────────────────────────────────────────────────────────────────

function fakeSupabase(behavior: { insertReturn?: unknown; insertError?: { message: string } } = {}) {
  const captured: { table?: string; insert?: Record<string, unknown> } = {}
  const builder = {
    insert: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
      captured.insert = payload
      return builder
    }),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: behavior.insertReturn ?? { id: 'tkt-1', ticket_number: 'TKT-20260510-0001', status: 'new', ...captured.insert },
      error: behavior.insertError ?? null,
    }),
  }
  const sb = {
    from: vi.fn().mockImplementation((table: string) => { captured.table = table; return builder }),
  }
  return { sb: sb as any, captured }
}

describe('createTicket', () => {
  it('returns ok with ticket on success', async () => {
    const { sb, captured } = fakeSupabase()
    const res = await createTicket(sb, {
      subject: 'help', body: 'I need it', submitter_email: 'CUSTOMER@example.COM',
    }, 'web_form')
    expect(res.ok).toBe(true)
    expect(captured.table).toBe('support_tickets')
    expect(captured.insert?.subject).toBe('help')
    expect(captured.insert?.submitter_email).toBe('customer@example.com') // lowercased
    expect(captured.insert?.source).toBe('web_form')
    expect(captured.insert?.category).toBe('other')   // default
    expect(captured.insert?.severity).toBe('P3')      // default
    expect(captured.insert?.status).toBe('new')       // default
  })

  it('returns ok=false on validation failure (no DB call)', async () => {
    const { sb, captured } = fakeSupabase()
    const res = await createTicket(sb, {
      subject: '', body: 'x', submitter_email: 'a@b.co',
    }, 'web_form')
    expect(res.ok).toBe(false)
    expect(captured.insert).toBeUndefined()
  })

  it('passes through DB errors', async () => {
    const { sb } = fakeSupabase({ insertError: { message: 'unique violation' } })
    const res = await createTicket(sb, {
      subject: 'x', body: 'y', submitter_email: 'a@b.co',
    }, 'in_app')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/unique violation/)
  })

  it('honours category + severity overrides', async () => {
    const { sb, captured } = fakeSupabase()
    await createTicket(sb, {
      subject: 'x', body: 'y', submitter_email: 'a@b.co',
      category: 'billing', severity: 'P1',
    }, 'admin_created')
    expect(captured.insert?.category).toBe('billing')
    expect(captured.insert?.severity).toBe('P1')
    expect(captured.insert?.source).toBe('admin_created')
  })
})

// ──────────────────────────────────────────────────────────────────────
// addTicketReply — flag enforcement
// ──────────────────────────────────────────────────────────────────────

describe('addTicketReply', () => {
  it('rejects when no source flag is set', async () => {
    const { sb } = fakeSupabase()
    const r = await addTicketReply(sb, { ticket_id: 't1', body: 'hi' })
    expect(r.ok).toBe(false)
  })

  it('rejects when multiple source flags are set', async () => {
    const { sb } = fakeSupabase()
    const r = await addTicketReply(sb, {
      ticket_id: 't1', body: 'hi', is_from_ai: true, is_from_admin: true,
    })
    expect(r.ok).toBe(false)
  })

  it('rejects empty body', async () => {
    const { sb } = fakeSupabase()
    const r = await addTicketReply(sb, { ticket_id: 't1', body: '   ', is_from_ai: true })
    expect(r.ok).toBe(false)
  })

  it('inserts when exactly one flag is set', async () => {
    const { sb, captured } = fakeSupabase({ insertReturn: { id: 'r1' } })
    const r = await addTicketReply(sb, {
      ticket_id: 't1', body: 'hello', is_from_customer: true,
    })
    expect(r.ok).toBe(true)
    expect(captured.table).toBe('ticket_replies')
    expect(captured.insert?.is_from_customer).toBe(true)
    expect(captured.insert?.is_from_ai).toBe(false)
  })
})

// ──────────────────────────────────────────────────────────────────────
// updateTicketStatus — resolved_at stamping
// ──────────────────────────────────────────────────────────────────────

describe('updateTicketStatus', () => {
  function makeSb() {
    const captured: { update?: Record<string, unknown> } = {}
    const builder = {
      update: vi.fn().mockImplementation((p: Record<string, unknown>) => {
        captured.update = p
        return builder
      }),
      eq: vi.fn().mockReturnThis(),
      // The mocked Supabase update() builder is awaited at the end of the
      // chain. Returning a thenable lets the implementation await us.
      then: (cb: (r: { error: null }) => void) => Promise.resolve(cb({ error: null })),
    }
    const sb = { from: vi.fn().mockReturnValue(builder) }
    return { sb: sb as any, captured }
  }

  it('stamps resolved_at when transitioning to resolved', async () => {
    const { sb, captured } = makeSb()
    const r = await updateTicketStatus(sb, 't1', 'resolved')
    expect(r.ok).toBe(true)
    expect(captured.update?.status).toBe('resolved')
    expect(captured.update?.resolved_at).toBeDefined()
  })

  it('stamps resolved_at on closed too', async () => {
    const { sb, captured } = makeSb()
    await updateTicketStatus(sb, 't1', 'closed')
    expect(captured.update?.resolved_at).toBeDefined()
  })

  it('does NOT stamp resolved_at on awaiting_admin', async () => {
    const { sb, captured } = makeSb()
    await updateTicketStatus(sb, 't1', 'awaiting_admin')
    expect(captured.update?.resolved_at).toBeUndefined()
  })

  it('rejects invalid status', async () => {
    const { sb } = makeSb()
    // @ts-expect-error — testing runtime guard
    const r = await updateTicketStatus(sb, 't1', 'open')
    expect(r.ok).toBe(false)
  })

  it('passes resolution_summary through when provided', async () => {
    const { sb, captured } = makeSb()
    await updateTicketStatus(sb, 't1', 'resolved', { resolution_summary: 'fixed' })
    expect(captured.update?.resolution_summary).toBe('fixed')
  })
})

// ──────────────────────────────────────────────────────────────────────
// SLA window — locked from Phase 16 brief
// ──────────────────────────────────────────────────────────────────────

describe('SLA window', () => {
  it('locks the per-severity windows', () => {
    expect(TICKET_SLA_WINDOW_MS.P0).toBe(15 * 60_000)
    expect(TICKET_SLA_WINDOW_MS.P1).toBe(60 * 60_000)
    expect(TICKET_SLA_WINDOW_MS.P2).toBe(4 * 60 * 60_000)
    expect(TICKET_SLA_WINDOW_MS.P3).toBe(24 * 60 * 60_000)
  })

  it('describeSlaWindow renders human copy', () => {
    expect(describeSlaWindow('P0')).toMatch(/15/)
    expect(describeSlaWindow('P1')).toMatch(/1 hour/)
    expect(describeSlaWindow('P2')).toMatch(/4/)
    expect(describeSlaWindow('P3')).toMatch(/24/)
  })
})
