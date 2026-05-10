/**
 * Phase 17 Sprint 17.2 — transactional send helpers.
 *
 * One helper per template. Each helper renders the template, inserts
 * an email_log row with status='queued', and returns the row id (or
 * null when the row could not be queued). The cron worker
 * (Sprint 17.1) does the actual Resend hand-off.
 *
 * Application code should ALWAYS go through these helpers — never
 * call resend-client directly outside of lib/email/. That keeps
 * (a) the audit trail in email_log complete, (b) the kill-switch
 * (status='skipped' override) in one place, and (c) provider swaps
 * mechanical.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { renderTicketReceived, type TicketReceivedInput } from './templates/ticket_received'
import { renderTicketReply, type TicketReplyInput } from './templates/ticket_reply'
import { renderNpsSurvey, type NpsSurveyInput } from './templates/nps_survey'
import { renderChurnReengagement, type ChurnReengagementInput } from './templates/churn_reengagement'
import { renderMagicLinkSupportView, type MagicLinkSupportViewInput } from './templates/magic_link_support_view'

/** Minimum row payload shared by every send helper. */
interface BaseQueueArgs {
  to_email: string
  to_user_id?: string | null
  organization_id?: string | null
  related_ticket_id?: string | null
  related_reply_id?: string | null
}

interface QueueResult {
  id: string | null
  /** When false, the row was skipped (e.g. recipient missing). */
  queued: boolean
  reason?: string
}

async function queueOne(
  supabase: SupabaseClient,
  base: BaseQueueArgs,
  rendered: { subject: string; html: string; text: string },
  kind:
    | 'ticket_reply'
    | 'ticket_resolution'
    | 'nps_prompt'
    | 'churn_reengagement'
    | 'system_alert'
    | 'other',
): Promise<QueueResult> {
  if (!base.to_email || !base.to_email.includes('@')) {
    return { id: null, queued: false, reason: 'missing or invalid recipient' }
  }
  const { data, error } = await supabase
    .from('email_log')
    .insert({
      organization_id: base.organization_id ?? null,
      to_email: base.to_email,
      to_user_id: base.to_user_id ?? null,
      subject: rendered.subject,
      body_text: rendered.text,
      body_html: rendered.html,
      kind,
      related_ticket_id: base.related_ticket_id ?? null,
      related_reply_id: base.related_reply_id ?? null,
      status: 'queued',
    })
    .select('id')
    .single()
  if (error) return { id: null, queued: false, reason: error.message }
  return { id: (data as { id: string }).id, queued: true }
}

// ──────────────────────────────────────────────────────────────────────
// Per-template helpers
// ──────────────────────────────────────────────────────────────────────

export async function sendTicketReceived(
  supabase: SupabaseClient,
  base: BaseQueueArgs,
  template: TicketReceivedInput,
): Promise<QueueResult> {
  return queueOne(supabase, base, renderTicketReceived(template), 'system_alert')
}

export async function sendTicketReply(
  supabase: SupabaseClient,
  base: BaseQueueArgs,
  template: TicketReplyInput,
): Promise<QueueResult> {
  const kind = template.is_resolution ? 'ticket_resolution' : 'ticket_reply'
  return queueOne(supabase, base, renderTicketReply(template), kind)
}

export async function sendNpsSurvey(
  supabase: SupabaseClient,
  base: BaseQueueArgs,
  template: NpsSurveyInput,
): Promise<QueueResult> {
  return queueOne(supabase, base, renderNpsSurvey(template), 'nps_prompt')
}

export async function sendChurnReengagement(
  supabase: SupabaseClient,
  base: BaseQueueArgs,
  template: ChurnReengagementInput,
): Promise<QueueResult> {
  return queueOne(supabase, base, renderChurnReengagement(template), 'churn_reengagement')
}

export async function sendMagicLinkSupportView(
  supabase: SupabaseClient,
  base: BaseQueueArgs,
  template: MagicLinkSupportViewInput,
): Promise<QueueResult> {
  return queueOne(supabase, base, renderMagicLinkSupportView(template), 'system_alert')
}

// Exposed for tests.
export const __testing = { queueOne }
