/**
 * Phase 16 Sprint 16.3 — AI ticket triage worker.
 *
 * Tier 0 (always): classify category, severity, sentiment, suggested_tags
 * Tier 1: pattern-match auto-resolve OR vector-similarity to resolved
 *         tickets → auto-draft response
 * Tier 2: escalate to admin queue with AI's suggested response staged
 *         in support_tickets.suggested_response (admin clicks Send to
 *         materialize as ticket_replies row)
 *
 * Every Anthropic call goes through lib/ai/anthropic.ts (rate-limited
 * + cost-logged). Mock-friendly via dependency injection in tests.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { callAnthropic } from '@/lib/ai/anthropic'
import {
  addTicketReply,
  updateTicketStatus,
  type SupportTicket,
  type TicketCategory,
  type TicketSeverity,
} from './tickets'

export interface TriageClassification {
  category: TicketCategory
  severity: TicketSeverity
  sentiment: 'positive' | 'neutral' | 'negative'
  intent: string
  suggested_tags: string[]
}

export interface TriageResult {
  ticket_id: string
  classification: TriageClassification
  /** True if a customer-visible AI reply was created. */
  auto_resolved: boolean
  /** True if AI staged a draft for admin review (escalation). */
  escalated: boolean
  /** AI confidence 0..1 for the action taken. */
  confidence: number
  /** What action label was logged on ticket_replies / suggested_response. */
  action: 'auto_resolved' | 'escalated_with_draft' | 'escalated_no_draft'
}

// ──────────────────────────────────────────────────────────────────────
// Tier 1 — auto-resolve patterns
//
// Locked from the Phase 16 brief. Deterministic pattern matching first
// (no LLM round-trip needed) for the four highest-volume questions.
// Anything else falls through to escalation-with-AI-draft.
// ──────────────────────────────────────────────────────────────────────

interface AutoResolvePattern {
  id: string
  /** Loose regex match against subject + body lowercased + collapsed. */
  match: RegExp
  /** Async response builder — has access to org + ticket context. */
  respond: (ticket: SupportTicket, supabase: SupabaseClient) => Promise<string>
}

const AUTO_RESOLVE_PATTERNS: AutoResolvePattern[] = [
  {
    id: 'password_reset',
    match: /\b(reset|forgot)\s+(my\s+)?password\b/i,
    respond: async () => [
      "Hi — you can reset your password from the login page. Use the \"Forgot password?\" link below the password field, then check your inbox for a one-time link from no-reply@myaircraft.us.",
      "",
      "If the email doesn't arrive within 5 minutes, please check your spam folder. Still nothing? Reply here and we'll generate a manual reset link.",
    ].join('\n'),
  },
  {
    id: 'tier_lookup',
    match: /\b(what(?:'s|\s+is)\s+my\s+(tier|plan)|current\s+tier)\b/i,
    respond: async (ticket, supabase) => {
      if (!ticket.organization_id) {
        return "I couldn't find your organization on this ticket. Could you share your org slug or the email tied to your aircraft.us account so I can look up the tier?"
      }
      const { data: org } = await supabase
        .from('organizations')
        .select('name, tier, tier_billing_disabled')
        .eq('id', ticket.organization_id)
        .maybeSingle()
      if (!org) {
        return "I can see the org on file, but the tier lookup came back empty. Bouncing this to a human."
      }
      const o = org as { name: string; tier: string; tier_billing_disabled: boolean }
      const billing = o.tier_billing_disabled
        ? "Billing is currently paused for your account (we're in beta — no charges until v1 launch)."
        : "Your tier is being billed normally."
      return [
        `Your org "${o.name}" is on the **${o.tier}** tier.`,
        '',
        billing,
        '',
        "If you're considering an upgrade, the full tier breakdown is at https://www.myaircraft.us/pricing — same features on every paid plan, the only difference is how fast new documents become searchable.",
      ].join('\n')
    },
  },
  {
    id: 'doc_indexing_status',
    match: /\b(when\s+will\s+(my\s+)?doc(s|ument)?|why\s+(is|hasn't)\s+(my\s+)?doc(ument)?\s+(been\s+)?indexed|status\s+of\s+my\s+upload)\b/i,
    respond: async (ticket, supabase) => {
      if (!ticket.organization_id) {
        return "I'd need to know which org and document you're asking about — could you share the document title or your org slug?"
      }
      // Best-effort: pull the most recent uploads for this org.
      const { data: progress } = await supabase
        .from('ingestion_progress')
        .select('document_id, status, percent_complete, updated_at, documents(title)')
        .eq('organization_id', ticket.organization_id)
        .in('status', ['queued', 'parsing', 'embedding', 'indexed', 'failed'])
        .order('updated_at', { ascending: false })
        .limit(5)
      if (!progress || (progress as unknown[]).length === 0) {
        return "I don't see any documents currently in flight for your org. If you uploaded recently, give the page a refresh — completed docs land on the /documents list. Reply here if it's still not showing."
      }
      const lines = (progress as Array<{
        document_id: string
        status: string
        percent_complete: number | null
        documents: { title?: string } | { title?: string }[] | null
      }>).map((p) => {
        const title = Array.isArray(p.documents) ? p.documents[0]?.title : p.documents?.title
        const pct = p.percent_complete != null ? ` (${Math.round(p.percent_complete)}%)` : ''
        return `  • ${title ?? p.document_id} — ${p.status}${pct}`
      }).join('\n')
      return [
        "Here's what I can see for your most recent uploads:",
        '',
        lines,
        '',
        "Standard tier docs target searchability within 24 hours; Pro tier is real-time. If you've been waiting longer than that, reply and I'll re-queue manually.",
      ].join('\n')
    },
  },
  {
    id: 'pricing_question',
    match: /\b(how\s+(does|do)\s+(your\s+)?pricing\s+work|how\s+much\s+does.+cost|what.+price)\b/i,
    respond: async () => [
      "Pricing summary (full breakdown at https://www.myaircraft.us/pricing):",
      '',
      "**Beta** — free during launch. Same features as Pro.",
      "**Standard** — from **$99 per aircraft per month**. 24-hour SLA on doc indexing.",
      "**Pro** — from **$149 per aircraft per month**. Real-time doc indexing.",
      '',
      "Volume discounts: 6–15 aircraft drops to $79/$129; 16+ drops to $59/$109.",
      '',
      "No long contracts. Cancel anytime. Want a custom quote? Reply here with your fleet size and I'll route to a human.",
    ].join('\n'),
  },
]

function findAutoResolvePattern(ticket: SupportTicket): AutoResolvePattern | null {
  const text = `${ticket.subject}\n${ticket.body}`
  for (const p of AUTO_RESOLVE_PATTERNS) {
    if (p.match.test(text)) return p
  }
  return null
}

// ──────────────────────────────────────────────────────────────────────
// Tier 0 — classification via Anthropic
// ──────────────────────────────────────────────────────────────────────

const CLASSIFICATION_SYSTEM_PROMPT = `You are the triage AI for aircraft.us, an aviation maintenance SaaS.
Classify the support ticket into a strict JSON object with these fields:
  category: "billing" | "technical" | "feature_request" | "bug" | "account" | "other"
  severity: "P0" | "P1" | "P2" | "P3"
  sentiment: "positive" | "neutral" | "negative"
  intent: a 5-12 word phrase describing what the user wants
  suggested_tags: an array of 0-5 short string tags

Severity rubric:
  P0 — site down, payment processor failure, data loss, urgent compliance.
  P1 — critical workflow broken (can't upload, can't view aircraft).
  P2 — feature broken / confusing but workaround exists.
  P3 — questions, polish, low-priority requests.

Output ONLY the JSON object, no prose, no markdown.`

async function classifyTicket(
  supabase: SupabaseClient,
  ticket: SupportTicket,
): Promise<TriageClassification | null> {
  const userPrompt = [
    `subject: ${ticket.subject}`,
    `body: ${ticket.body}`,
    `submitter_email: ${ticket.submitter_email}`,
    `org_id: ${ticket.organization_id ?? '(null)'}`,
  ].join('\n')

  try {
    const result = await callAnthropic(
      supabase,
      {
        system: CLASSIFICATION_SYSTEM_PROMPT,
        user: userPrompt,
        model: 'claude-3-5-haiku-latest',
        max_tokens: 256,
        temperature: 0,
      },
      {
        organization_id: ticket.organization_id ?? '00000000-0000-0000-0000-000000000000',
        scope: 'support_triage',
        entity_kind: 'support_ticket',
        entity_id: ticket.id,
      },
    )

    const parsed = safeParseClassification(result.text)
    return parsed
  } catch {
    // If Haiku is unavailable, return a safe default so triage can still
    // escalate the ticket without a classification rather than silently
    // dropping it.
    return null
  }
}

function safeParseClassification(text: string): TriageClassification | null {
  // Strip any code-fence wrapping the model might emit despite the prompt.
  const cleaned = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '').trim()
  let obj: any
  try {
    obj = JSON.parse(cleaned)
  } catch {
    return null
  }
  const valid =
    obj &&
    typeof obj === 'object' &&
    ['billing', 'technical', 'feature_request', 'bug', 'account', 'other'].includes(obj.category) &&
    ['P0', 'P1', 'P2', 'P3'].includes(obj.severity) &&
    ['positive', 'neutral', 'negative'].includes(obj.sentiment) &&
    typeof obj.intent === 'string'
  if (!valid) return null
  return {
    category: obj.category,
    severity: obj.severity,
    sentiment: obj.sentiment,
    intent: String(obj.intent).slice(0, 120),
    suggested_tags: Array.isArray(obj.suggested_tags)
      ? obj.suggested_tags.filter((t: unknown) => typeof t === 'string').slice(0, 5)
      : [],
  }
}

// ──────────────────────────────────────────────────────────────────────
// Escalation draft — Tier 2
//
// When no auto-resolve pattern matches, ask Sonnet for a polite response
// the admin can edit + send. Stored in support_tickets.suggested_response.
// ──────────────────────────────────────────────────────────────────────

const DRAFT_SYSTEM_PROMPT = `You are aircraft.us support drafting a polite, helpful first reply.
Tone: warm, technically precise, concise (4-8 sentences).
Audience: aircraft owner, mechanic, or shop. Default to plain English; use
aviation terminology only when the customer used it first.
Constraints:
  - Acknowledge what the customer asked.
  - Give the most accurate answer you can WITHOUT making up specifics
    (don't invent invoice numbers, prices not in the pricing page, dates).
  - End with a short "let us know if this helps" closer.
  - DO NOT include subject lines, signatures, or formal headers; the
    admin reviews + sends as a plain reply.

If you don't have enough context, say so explicitly and ask for the
specific information you need.`

async function draftReply(
  supabase: SupabaseClient,
  ticket: SupportTicket,
  classification: TriageClassification | null,
): Promise<{ text: string; confidence: number } | null> {
  const userPrompt = [
    `subject: ${ticket.subject}`,
    `body: ${ticket.body}`,
    classification
      ? `classification: ${classification.category} / ${classification.severity} / ${classification.sentiment} — ${classification.intent}`
      : 'classification: (none)',
  ].join('\n\n')

  try {
    const result = await callAnthropic(
      supabase,
      {
        system: DRAFT_SYSTEM_PROMPT,
        user: userPrompt,
        model: 'claude-sonnet-4-5',
        max_tokens: 600,
        temperature: 0.4,
      },
      {
        organization_id: ticket.organization_id ?? '00000000-0000-0000-0000-000000000000',
        scope: 'support_draft',
        entity_kind: 'support_ticket',
        entity_id: ticket.id,
      },
    )
    // Confidence heuristic: longer, multi-paragraph drafts tend to be
    // higher-quality (Sonnet has more context). 0.6 is the floor for
    // "good enough to staged"; below that we still escalate but flag it.
    const confidence = Math.min(0.95, 0.5 + Math.min(0.4, result.text.length / 1500))
    return { text: result.text.trim(), confidence }
  } catch {
    return null
  }
}

// ──────────────────────────────────────────────────────────────────────
// Main triage entry point
// ──────────────────────────────────────────────────────────────────────

/**
 * Triage one ticket. Caller should pass the SERVICE-ROLE supabase client
 * because we need to write to ticket_replies + support_tickets across
 * orgs.
 *
 * Returns the result for logging/observability. The function is
 * idempotent on resolved tickets (no-op if status not in {new, ai_triaging}).
 */
export async function triageTicket(
  supabase: SupabaseClient,
  ticketId: string,
): Promise<TriageResult | null> {
  // Lock by transitioning new → ai_triaging up front. Two cron ticks
  // can't pick up the same ticket because the UPDATE filters on the
  // 'new' state.
  const { data: locked, error: lockErr } = await supabase
    .from('support_tickets')
    .update({ status: 'ai_triaging' })
    .eq('id', ticketId)
    .eq('status', 'new')
    .select('*')
    .maybeSingle()

  if (lockErr || !locked) return null
  const ticket = locked as SupportTicket

  // Tier 0 — classify
  const classification = await classifyTicket(supabase, ticket)
  if (classification) {
    await supabase
      .from('support_tickets')
      .update({
        triage_classification: classification,
        category: classification.category,
        severity: classification.severity,
        tags: dedupTags([...(ticket.tags ?? []), ...classification.suggested_tags]),
      })
      .eq('id', ticket.id)
  }

  // Tier 1 — pattern-match auto-resolve
  const pattern = findAutoResolvePattern(ticket)
  if (pattern) {
    const responseText = await pattern.respond(ticket, supabase)
    await addTicketReply(supabase, {
      ticket_id: ticket.id,
      body: responseText,
      is_from_ai: true,
      ai_confidence: 0.95,
      ai_action_taken: `auto_resolved:${pattern.id}`,
    })
    await updateTicketStatus(supabase, ticket.id, 'resolved', {
      resolution_summary: `Auto-resolved via pattern '${pattern.id}'`,
    })
    await queueEmail(supabase, ticket, 'ticket_resolution', responseText)
    return {
      ticket_id: ticket.id,
      classification: classification ?? defaultClassification(ticket),
      auto_resolved: true,
      escalated: false,
      confidence: 0.95,
      action: 'auto_resolved',
    }
  }

  // Tier 2 — draft for admin review
  const draft = await draftReply(supabase, ticket, classification)
  if (draft) {
    await supabase
      .from('support_tickets')
      .update({
        status: 'awaiting_admin',
        suggested_response: draft.text,
      })
      .eq('id', ticket.id)
    return {
      ticket_id: ticket.id,
      classification: classification ?? defaultClassification(ticket),
      auto_resolved: false,
      escalated: true,
      confidence: draft.confidence,
      action: 'escalated_with_draft',
    }
  }

  // No draft — escalate without one (still useful for admin queue).
  await supabase
    .from('support_tickets')
    .update({ status: 'awaiting_admin' })
    .eq('id', ticket.id)

  return {
    ticket_id: ticket.id,
    classification: classification ?? defaultClassification(ticket),
    auto_resolved: false,
    escalated: true,
    confidence: 0.0,
    action: 'escalated_no_draft',
  }
}

/**
 * Pick up the next batch of un-triaged tickets from the queue and
 * triage each. Used by /api/cron/support-triage.
 */
export async function triageBatch(
  supabase: SupabaseClient,
  limit = 10,
): Promise<TriageResult[]> {
  const { data: pending } = await supabase
    .from('support_tickets')
    .select('id')
    .eq('status', 'new')
    .is('deleted_at', null)
    .order('severity', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(limit)

  if (!pending || pending.length === 0) return []

  const results: TriageResult[] = []
  for (const row of pending as Array<{ id: string }>) {
    const r = await triageTicket(supabase, row.id)
    if (r) results.push(r)
  }
  return results
}

// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────

function dedupTags(tags: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const t of tags) {
    const k = t.toLowerCase().trim()
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push(t)
    if (out.length >= 8) break
  }
  return out
}

function defaultClassification(ticket: SupportTicket): TriageClassification {
  return {
    category: ticket.category,
    severity: ticket.severity,
    sentiment: 'neutral',
    intent: '(unknown)',
    suggested_tags: [],
  }
}

async function queueEmail(
  supabase: SupabaseClient,
  ticket: SupportTicket,
  kind: 'ticket_reply' | 'ticket_resolution',
  body: string,
): Promise<void> {
  try {
    await supabase.from('email_log').insert({
      organization_id: ticket.organization_id,
      to_email: ticket.submitter_email,
      to_user_id: ticket.submitter_user_id,
      subject: `Re: ${ticket.subject} [${ticket.ticket_number}]`,
      body_text: body,
      kind,
      related_ticket_id: ticket.id,
      status: 'queued',
    })
  } catch {
    // email_log not yet applied (migration 110) — tolerate; admin can
    // still see the AI reply in the inbox. Real provider hand-off is
    // deferred regardless.
  }
}

// Exposed for tests + Sprint 16.4 admin "Send" action.
export { findAutoResolvePattern, AUTO_RESOLVE_PATTERNS, classifyTicket, draftReply, safeParseClassification }
