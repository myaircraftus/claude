/**
 * Phase 16 Sprint 16.2 — Support ticket service.
 *
 * Single entry point for everything that creates / lists / replies to
 * tickets. Routes (/api/support, /api/admin/support, /api/public/support/submit,
 * /api/webhooks/support-email) all go through this module so the
 * persona × org × admin × public-token access matrix is enforced once.
 *
 * RLS at the Postgres level (migration 109) is the security floor;
 * this layer adds typed helpers, ticket_number generation (via the
 * trigger from migration 109), and consistent error shapes.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// ──────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────

export type TicketSource = 'web_form' | 'email' | 'in_app' | 'admin_created'

export type TicketCategory =
  | 'billing'
  | 'technical'
  | 'feature_request'
  | 'bug'
  | 'account'
  | 'other'

export type TicketSeverity = 'P0' | 'P1' | 'P2' | 'P3'

export type TicketStatus =
  | 'new'
  | 'ai_triaging'
  | 'awaiting_customer'
  | 'awaiting_admin'
  | 'resolved'
  | 'closed'

export interface SupportTicket {
  id: string
  organization_id: string | null
  ticket_number: string
  subject: string
  body: string
  submitter_email: string
  submitter_user_id: string | null
  source: TicketSource
  category: TicketCategory
  severity: TicketSeverity
  status: TicketStatus
  ai_first_response_at: string | null
  ai_response_count: number
  admin_assigned_to: string | null
  admin_first_response_at: string | null
  resolution_summary: string | null
  related_doc_id: string | null
  related_aircraft_id: string | null
  tags: string[]
  access_token: string
  created_at: string
  updated_at: string
  resolved_at: string | null
  deleted_at: string | null
}

export interface CreateTicketInput {
  organization_id?: string | null
  subject: string
  body: string
  submitter_email: string
  submitter_user_id?: string | null
  category?: TicketCategory
  severity?: TicketSeverity
  tags?: string[]
  related_doc_id?: string | null
  related_aircraft_id?: string | null
}

export interface ListTicketFilters {
  status?: TicketStatus | TicketStatus[]
  severity?: TicketSeverity | TicketSeverity[]
  category?: TicketCategory | TicketCategory[]
  organization_id?: string
  submitter_email?: string
  /** ISO date lower bound. */
  since?: string
  /** ISO date upper bound. */
  until?: string
  /** Free-text search on subject + body. */
  q?: string
  /** Default true: hide deleted_at IS NOT NULL. */
  exclude_deleted?: boolean
  limit?: number
  offset?: number
}

// ──────────────────────────────────────────────────────────────────────
// Validation helpers
// ──────────────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const VALID_CATEGORIES: ReadonlySet<TicketCategory> = new Set([
  'billing', 'technical', 'feature_request', 'bug', 'account', 'other',
])

const VALID_SEVERITIES: ReadonlySet<TicketSeverity> = new Set(['P0', 'P1', 'P2', 'P3'])

const VALID_STATUSES: ReadonlySet<TicketStatus> = new Set([
  'new', 'ai_triaging', 'awaiting_customer', 'awaiting_admin', 'resolved', 'closed',
])

export function isValidTicketCategory(v: unknown): v is TicketCategory {
  return typeof v === 'string' && VALID_CATEGORIES.has(v as TicketCategory)
}

export function isValidTicketSeverity(v: unknown): v is TicketSeverity {
  return typeof v === 'string' && VALID_SEVERITIES.has(v as TicketSeverity)
}

export function isValidTicketStatus(v: unknown): v is TicketStatus {
  return typeof v === 'string' && VALID_STATUSES.has(v as TicketStatus)
}

/** Strict-cap for subject/body to avoid runaway storage. */
export const TICKET_SUBJECT_MAX = 240
export const TICKET_BODY_MAX = 10_000

export interface ValidateResult {
  ok: boolean
  /** First-fail error message; null if ok. */
  error?: string
}

export function validateCreateInput(input: CreateTicketInput): ValidateResult {
  if (!input.subject || typeof input.subject !== 'string') {
    return { ok: false, error: 'subject is required' }
  }
  if (input.subject.length > TICKET_SUBJECT_MAX) {
    return { ok: false, error: `subject exceeds ${TICKET_SUBJECT_MAX} chars` }
  }
  if (!input.body || typeof input.body !== 'string') {
    return { ok: false, error: 'body is required' }
  }
  if (input.body.length > TICKET_BODY_MAX) {
    return { ok: false, error: `body exceeds ${TICKET_BODY_MAX} chars` }
  }
  if (!input.submitter_email || !EMAIL_RE.test(input.submitter_email)) {
    return { ok: false, error: 'submitter_email is required and must be a valid email' }
  }
  if (input.category !== undefined && !isValidTicketCategory(input.category)) {
    return { ok: false, error: 'invalid category' }
  }
  if (input.severity !== undefined && !isValidTicketSeverity(input.severity)) {
    return { ok: false, error: 'invalid severity' }
  }
  return { ok: true }
}

// ──────────────────────────────────────────────────────────────────────
// Service functions
// ──────────────────────────────────────────────────────────────────────

/**
 * Create a new ticket. ticket_number is generated by the
 * support_tickets_assign_number trigger (migration 109) — we don't
 * compute it client-side. status defaults to 'new'; AI triage worker
 * picks it up from there.
 *
 * Caller passes a service-role supabase client when the submitter is
 * unauthenticated (public form, email webhook). For in-app submissions
 * the request-scoped client suffices because RLS allows authenticated
 * users to insert their own tickets.
 */
export async function createTicket(
  supabase: SupabaseClient,
  input: CreateTicketInput,
  source: TicketSource,
): Promise<{ ok: true; ticket: SupportTicket } | { ok: false; error: string }> {
  const validate = validateCreateInput(input)
  if (!validate.ok) return { ok: false, error: validate.error ?? 'validation failed' }

  const { data, error } = await supabase
    .from('support_tickets')
    .insert({
      organization_id: input.organization_id ?? null,
      subject: input.subject.trim(),
      body: input.body.trim(),
      submitter_email: input.submitter_email.toLowerCase().trim(),
      submitter_user_id: input.submitter_user_id ?? null,
      source,
      category: input.category ?? 'other',
      severity: input.severity ?? 'P3',
      status: 'new',
      tags: input.tags ?? [],
      related_doc_id: input.related_doc_id ?? null,
      related_aircraft_id: input.related_aircraft_id ?? null,
    })
    .select('*')
    .single()

  if (error) return { ok: false, error: error.message }
  return { ok: true, ticket: data as SupportTicket }
}

function applyFilters<Q extends { in: any; eq: any; gte: any; lte: any; or: any; is: any; range: any; order: any }>(
  query: Q,
  filters: ListTicketFilters,
): Q {
  const status = Array.isArray(filters.status) ? filters.status : filters.status ? [filters.status] : null
  if (status?.length) query = query.in('status', status)

  const severity = Array.isArray(filters.severity) ? filters.severity : filters.severity ? [filters.severity] : null
  if (severity?.length) query = query.in('severity', severity)

  const category = Array.isArray(filters.category) ? filters.category : filters.category ? [filters.category] : null
  if (category?.length) query = query.in('category', category)

  if (filters.organization_id) query = query.eq('organization_id', filters.organization_id)
  if (filters.submitter_email) query = query.eq('submitter_email', filters.submitter_email.toLowerCase())
  if (filters.since) query = query.gte('created_at', filters.since)
  if (filters.until) query = query.lte('created_at', filters.until)

  if (filters.q && filters.q.trim()) {
    const term = filters.q.replace(/[%_]/g, '\\$&')
    query = query.or(`subject.ilike.%${term}%,body.ilike.%${term}%,ticket_number.ilike.%${term}%`)
  }

  if (filters.exclude_deleted !== false) query = query.is('deleted_at', null)

  return query
}

/**
 * List tickets visible to a specific org. Caller must pass a request-
 * scoped supabase client (RLS enforces visibility — the org member
 * sees their own tickets; submitter sees their own across orgs).
 */
export async function listTicketsForOrg(
  supabase: SupabaseClient,
  organizationId: string,
  filters: ListTicketFilters = {},
): Promise<{ tickets: SupportTicket[]; total: number }> {
  let query = supabase
    .from('support_tickets')
    .select('*', { count: 'exact' })
    .eq('organization_id', organizationId)

  query = applyFilters(query, { ...filters, organization_id: undefined })

  query = query.order('created_at', { ascending: false })
  if (filters.limit) query = query.range(filters.offset ?? 0, (filters.offset ?? 0) + filters.limit - 1)

  const { data, error, count } = await query
  if (error) throw new Error(`listTicketsForOrg: ${error.message}`)
  return { tickets: (data ?? []) as SupportTicket[], total: count ?? 0 }
}

/**
 * List tickets across all orgs — admin only.
 *
 * Caller must verify is_platform_admin BEFORE calling, AND pass the
 * service-role client. RLS would still block a non-admin even with
 * service-role (no policy is bypassed by service-role on
 * SECURITY-DEFINER tables); we layer admin auth at the route boundary.
 */
export async function listTicketsForAdmin(
  serviceSupabase: SupabaseClient,
  filters: ListTicketFilters = {},
): Promise<{ tickets: SupportTicket[]; total: number }> {
  let query = serviceSupabase
    .from('support_tickets')
    .select('*', { count: 'exact' })

  query = applyFilters(query, filters)

  // Admin sort: severity ascending (P0 first), then most recent.
  query = query.order('severity', { ascending: true }).order('created_at', { ascending: false })
  if (filters.limit) query = query.range(filters.offset ?? 0, (filters.offset ?? 0) + filters.limit - 1)

  const { data, error, count } = await query
  if (error) throw new Error(`listTicketsForAdmin: ${error.message}`)
  return { tickets: (data ?? []) as SupportTicket[], total: count ?? 0 }
}

/**
 * Fetch a single ticket by ticket_number. The unauth flow uses
 * (ticket_number, access_token) as a "magic link" key; the auth flow
 * relies on RLS.
 */
export async function getTicketByNumber(
  supabase: SupabaseClient,
  ticketNumber: string,
  options: { accessToken?: string } = {},
): Promise<SupportTicket | null> {
  let query = supabase
    .from('support_tickets')
    .select('*')
    .eq('ticket_number', ticketNumber)
    .is('deleted_at', null)

  if (options.accessToken) query = query.eq('access_token', options.accessToken)

  const { data, error } = await query.maybeSingle()
  if (error) throw new Error(`getTicketByNumber: ${error.message}`)
  return (data as SupportTicket) ?? null
}

/**
 * Append a reply to a ticket. Used by:
 *   - Customer reply through /support/tickets/[ticket_number]
 *   - AI triage worker (Sprint 16.3)
 *   - Admin reply through /admin/support/[ticket_number]
 *
 * Caller passes the right flags — exactly one of isFromAi/isFromAdmin/
 * isFromCustomer should be true. We enforce that here.
 *
 * Note: this hits the ticket_replies table that lands in migration 110
 * (Sprint 16.3). Until 110 is applied this function will fail at the
 * DB level. Callers from before 16.3 should not invoke this.
 */
export interface AddReplyInput {
  ticket_id: string
  body: string
  is_from_ai?: boolean
  is_from_admin?: boolean
  is_from_customer?: boolean
  /** AI confidence 0..1 — only set when is_from_ai. */
  ai_confidence?: number
  /** AI action taken (free-form for triage logs). */
  ai_action_taken?: string
  /** Admin user_id for is_from_admin replies. */
  admin_user_id?: string | null
}

export async function addTicketReply(
  supabase: SupabaseClient,
  input: AddReplyInput,
): Promise<{ ok: true; reply_id: string } | { ok: false; error: string }> {
  const flags = [input.is_from_ai, input.is_from_admin, input.is_from_customer].filter(Boolean)
  if (flags.length !== 1) {
    return { ok: false, error: 'exactly one of is_from_ai/is_from_admin/is_from_customer must be true' }
  }
  if (!input.body || !input.body.trim()) {
    return { ok: false, error: 'body is required' }
  }
  if (input.body.length > TICKET_BODY_MAX) {
    return { ok: false, error: `body exceeds ${TICKET_BODY_MAX} chars` }
  }

  const { data, error } = await supabase
    .from('ticket_replies')
    .insert({
      ticket_id: input.ticket_id,
      body: input.body.trim(),
      is_from_ai: !!input.is_from_ai,
      is_from_admin: !!input.is_from_admin,
      is_from_customer: !!input.is_from_customer,
      ai_confidence: input.ai_confidence ?? null,
      ai_action_taken: input.ai_action_taken ?? null,
      admin_user_id: input.admin_user_id ?? null,
    })
    .select('id')
    .single()

  if (error) return { ok: false, error: error.message }

  // Bump ai_response_count + ai_first_response_at on the parent ticket
  // when the reply is from AI. Same pattern for admin first response.
  if (input.is_from_ai) {
    await supabase.rpc('inc_support_ticket_ai_response', {
      p_ticket_id: input.ticket_id,
    }).then(() => {/* fire and forget; rpc landing in mig 110 */}, () => {/* ignore */})
  }
  if (input.is_from_admin) {
    await supabase
      .from('support_tickets')
      .update({ admin_first_response_at: new Date().toISOString() })
      .eq('id', input.ticket_id)
      .is('admin_first_response_at', null)
      .then(() => {}, () => {})
  }

  return { ok: true, reply_id: (data as { id: string }).id }
}

export interface TicketReply {
  id: string
  ticket_id: string
  body: string
  is_from_ai: boolean
  is_from_admin: boolean
  is_from_customer: boolean
  ai_confidence: number | null
  ai_action_taken: string | null
  admin_user_id: string | null
  created_at: string
}

/**
 * Get all replies for a ticket, oldest first (chat order).
 */
export async function listReplies(
  supabase: SupabaseClient,
  ticketId: string,
): Promise<TicketReply[]> {
  const { data, error } = await supabase
    .from('ticket_replies')
    .select('*')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true })
    .limit(500)

  if (error) throw new Error(`listReplies: ${error.message}`)
  return (data ?? []) as TicketReply[]
}

/**
 * Update ticket status — used by admin (resolve, close, reopen) and by
 * AI triage (set to ai_triaging during processing then to
 * awaiting_customer/awaiting_admin/resolved).
 *
 * Auto-stamps resolved_at when transitioning to 'resolved' or 'closed'.
 */
export async function updateTicketStatus(
  supabase: SupabaseClient,
  ticketId: string,
  status: TicketStatus,
  options: { resolution_summary?: string; admin_assigned_to?: string | null } = {},
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isValidTicketStatus(status)) return { ok: false, error: 'invalid status' }

  const patch: Record<string, unknown> = { status }
  if (status === 'resolved' || status === 'closed') {
    patch.resolved_at = new Date().toISOString()
  }
  if (options.resolution_summary !== undefined) patch.resolution_summary = options.resolution_summary
  if (options.admin_assigned_to !== undefined) patch.admin_assigned_to = options.admin_assigned_to

  const { error } = await supabase
    .from('support_tickets')
    .update(patch)
    .eq('id', ticketId)

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/**
 * Soft-delete a ticket (sets deleted_at). Reserved for admin.
 */
export async function softDeleteTicket(
  supabase: SupabaseClient,
  ticketId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase
    .from('support_tickets')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', ticketId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/**
 * Heuristic SLA window for first admin response, by severity.
 * Mirrors lib/ops/spine.ts SLA_WINDOW_MS — kept duplicated here so
 * the support module doesn't depend on the spine module's specific
 * constant. Both are derived from the Phase 16 brief's escalation
 * rules. If/when these diverge, treat spine.ts as canonical for
 * "everything in ops_inbox" and this constant as the support-only.
 */
export const TICKET_SLA_WINDOW_MS: Record<TicketSeverity, number> = {
  P0: 15 * 60 * 1000,
  P1: 60 * 60 * 1000,
  P2: 4 * 60 * 60 * 1000,
  P3: 24 * 60 * 60 * 1000,
}

export function describeSlaWindow(severity: TicketSeverity): string {
  switch (severity) {
    case 'P0': return 'within 15 minutes'
    case 'P1': return 'within 1 hour'
    case 'P2': return 'within 4 hours'
    case 'P3': return 'within 24 hours'
  }
}
