/**
 * AI Inspector — work-order auditor (Spec 5.5).
 *
 * Quality control without a senior inspector reviewing every closed WO.
 * Combines deterministic rule checks with an optional LLM "judgment"
 * pass that writes the human-facing summary on the resulting card.
 *
 * Rule checks (server-side, no LLM):
 *   1. Labor over estimate by >20% with no notes mentioning the reason
 *   2. Required photos missing on lines flagged requires_photo (via
 *      work_order_checklist_items from sprint 1.3 / 038)
 *   3. Missing RII signoffs (checklist items with requires_rii=true and
 *      no signed_off_by_user_id)
 *   4. Compliance items linked to the WO still in due-soon / overdue
 *      status (sprint 1.2 — should have been closed by this WO)
 *   5. Customer approval requests for this WO not yet completed (1.5)
 *   6. WO line items with inventory_part_id but no consumption record
 *      on the part (2.1) — implies someone billed a part without
 *      decrementing stock
 *   7. Work-order tool uses with was_overdue=true (2.6.1) — proves a
 *      tool was used past calibration; permanent audit fact
 *
 * Output: zero or one ai_action_cards row per WO, with category=
 * 'audit-finding'. Idempotent via dedupe_key=`wo-audit:<wo_id>` so
 * re-running on the same WO refreshes the existing card rather than
 * duplicating. If the audit finds zero issues we still write an
 * 'all-clear' card at priority='low' so a shop manager scanning the
 * inbox can see "WO #1234 audited — no issues."
 *
 * The LLM step is OPTIONAL: when ANTHROPIC_API_KEY is set we use
 * lib/ai/anthropic.ts (sprint 5.6) to compose a 1-2 sentence
 * plain-English summary of the findings. When the key is missing we
 * fall back to a deterministic English template so the card still
 * lands. NEVER blocks on LLM availability.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { callAnthropic } from '@/lib/ai/anthropic'

export type FindingSeverity = 'info' | 'warning' | 'critical'

export interface Finding {
  /** Stable identifier for the rule (used in dedupe + the evidence list). */
  check: string
  severity: FindingSeverity
  message: string
  evidence: string[]
}

export interface AuditResult {
  work_order_id: string
  organization_id: string
  finding_count: number
  highest_severity: FindingSeverity | 'none'
  findings: Finding[]
  card_id: string | null
}

const SEVERITY_RANK: Record<FindingSeverity, number> = {
  critical: 3,
  warning: 2,
  info: 1,
}

const SEVERITY_TO_PRIORITY: Record<FindingSeverity, 'urgent' | 'high' | 'normal'> = {
  critical: 'urgent',
  warning: 'high',
  info: 'normal',
}

/**
 * Audit a single closed work order. Caller passes the SERVICE-ROLE
 * Supabase client; the function handles its own RLS bypassing for the
 * cross-table reads.
 */
export async function auditWorkOrder(
  supabase: SupabaseClient,
  args: { work_order_id: string; organization_id: string },
): Promise<AuditResult> {
  // Pull the WO + everything we audit against in parallel.
  const [
    woRes,
    linesRes,
    checklistRes,
    complianceRes,
    approvalsRes,
    toolUsesRes,
  ] = await Promise.all([
    supabase
      .from('work_orders')
      .select('id, organization_id, work_order_number, status, scope, customer_complaint, discrepancy, findings, corrective_action, internal_notes, customer_notes, labor_total, parts_total, total, opened_at, closed_at, aircraft:aircraft_id (tail_number)')
      .eq('id', args.work_order_id)
      .eq('organization_id', args.organization_id)
      .maybeSingle(),
    supabase
      .from('work_order_lines')
      .select('id, line_type, description, hours, rate, line_total, inventory_part_id, vendor_id, vendor')
      .eq('work_order_id', args.work_order_id),
    supabase
      .from('work_order_checklist_items')
      .select('id, item_key, label, requires_rii, requires_photo, completed, signed_off_by_user_id, signed_off_at, photo_urls')
      .eq('work_order_id', args.work_order_id),
    // Compliance items linking to this WO via the linked_work_orders array
    // (sprint 1.2). PG array contains check.
    supabase
      .from('compliance_items')
      .select('id, title, status, next_due_date, linked_work_orders')
      .eq('organization_id', args.organization_id)
      .contains('linked_work_orders', [args.work_order_id]),
    supabase
      .from('approval_requests')
      .select('id, status, public_token, line_items:approval_line_items (id, customer_response)')
      .eq('organization_id', args.organization_id)
      .eq('work_order_id', args.work_order_id),
    supabase
      .from('work_order_tool_uses')
      .select('id, tool_id, was_overdue, used_at, tools:tool_id (name, serial_number)')
      .eq('work_order_id', args.work_order_id),
  ])

  if (woRes.error || !woRes.data) {
    throw new Error(woRes.error?.message ?? 'work order not found')
  }

  const wo = woRes.data as {
    id: string
    organization_id: string
    work_order_number: string
    status: string
    scope: string | null
    customer_complaint: string | null
    discrepancy: string | null
    findings: string | null
    corrective_action: string | null
    internal_notes: string | null
    customer_notes: string | null
    labor_total: number | null
    parts_total: number | null
    total: number | null
    opened_at: string | null
    closed_at: string | null
    aircraft: { tail_number?: string } | null
  }

  const lines = (linesRes.data ?? []) as Array<{
    id: string; line_type: string; description: string | null;
    hours: number | null; rate: number | null; line_total: number | null;
    inventory_part_id: string | null;
  }>
  const checklist = (checklistRes.data ?? []) as Array<{
    id: string; item_key: string | null; label: string | null;
    requires_rii: boolean | null; requires_photo: boolean | null;
    completed: boolean | null; signed_off_by_user_id: string | null;
    signed_off_at: string | null; photo_urls: string[] | null;
  }>
  const compliance = (complianceRes.data ?? []) as Array<{
    id: string; title: string; status: string; next_due_date: string | null;
  }>
  const approvals = (approvalsRes.data ?? []) as Array<{
    id: string; status: string;
    line_items: Array<{ id: string; customer_response: string | null }> | null;
  }>
  const toolUses = (toolUsesRes.data ?? []) as Array<{
    id: string; tool_id: string; was_overdue: boolean; used_at: string;
    tools: { name?: string; serial_number?: string } | null;
  }>

  const findings: Finding[] = []

  /* Check 1 — Labor variance */
  const laborTotal = Number(wo.labor_total ?? 0)
  const laborLines = lines.filter((l) => l.line_type === 'labor')
  const laborHours = laborLines.reduce((s, l) => s + (Number(l.hours) || 0), 0)
  // No formal "estimate" column on work_orders today (estimates is a
  // separate sprint 1.5 / future 7.x concept). Use the line-item rate ×
  // hours sum vs labor_total as a sanity check: if they diverge >20%
  // someone added unbilled overage hours.
  const laborLineTotal = laborLines.reduce((s, l) => s + (Number(l.line_total) || 0), 0)
  if (laborLineTotal > 0 && laborTotal > laborLineTotal * 1.2) {
    const notesText = [wo.internal_notes, wo.customer_notes].filter(Boolean).join(' ').toLowerCase()
    const explained = /overtime|overrun|unexpected|discover|recovery|scope.?creep|additional/.test(notesText)
    if (!explained) {
      findings.push({
        check: 'labor-variance',
        severity: 'warning',
        message: `Labor total ($${laborTotal.toFixed(2)}) is more than 20% above the line-item sum ($${laborLineTotal.toFixed(2)}) without an explanation in the notes.`,
        evidence: [
          `labor_total: $${laborTotal.toFixed(2)}`,
          `sum of labor line_totals: $${laborLineTotal.toFixed(2)}`,
          `tracked labor hours: ${laborHours.toFixed(1)}`,
        ],
      })
    }
  }

  /* Check 2 — Missing required photos */
  const missingPhotos = checklist.filter(
    (c) => c.requires_photo === true && (!c.photo_urls || c.photo_urls.length === 0),
  )
  if (missingPhotos.length > 0) {
    findings.push({
      check: 'missing-photos',
      severity: 'warning',
      message: `${missingPhotos.length} checklist ${missingPhotos.length === 1 ? 'item requires' : 'items require'} a photo but none was uploaded.`,
      evidence: missingPhotos.slice(0, 5).map((c) => `${c.item_key ?? c.id}: ${c.label ?? '(no label)'}`),
    })
  }

  /* Check 3 — Missing RII signoffs */
  const missingRii = checklist.filter(
    (c) => c.requires_rii === true && !c.signed_off_by_user_id,
  )
  if (missingRii.length > 0) {
    findings.push({
      check: 'missing-rii',
      severity: 'critical',
      message: `${missingRii.length} required-inspection ${missingRii.length === 1 ? 'item is' : 'items are'} missing a second signoff.`,
      evidence: missingRii.slice(0, 5).map((c) => `${c.item_key ?? c.id}: ${c.label ?? '(no label)'}`),
    })
  }

  /* Check 4 — Compliance items linked to this WO still due/overdue */
  const stillDue = compliance.filter((c) => c.status === 'due-soon' || c.status === 'overdue')
  if (stillDue.length > 0) {
    findings.push({
      check: 'compliance-not-closed',
      severity: 'warning',
      message: `${stillDue.length} compliance ${stillDue.length === 1 ? 'item is' : 'items are'} linked to this WO but still ${stillDue.length === 1 ? 'shows' : 'show'} as ${stillDue[0].status}. Mark complete if the work satisfied them.`,
      evidence: stillDue.slice(0, 5).map((c) => `${c.title} (${c.status}${c.next_due_date ? ', due ' + c.next_due_date : ''})`),
    })
  }

  /* Check 5 — Pending customer approvals on this WO */
  const pendingApprovals = approvals.filter((a) => a.status !== 'completed')
  for (const ap of pendingApprovals) {
    const items = ap.line_items ?? []
    const unanswered = items.filter((li) => !li.customer_response).length
    if (unanswered > 0 || ap.status === 'sent' || ap.status === 'partially-responded') {
      findings.push({
        check: 'approval-pending',
        severity: 'warning',
        message: `Customer approval has ${unanswered} unanswered line ${unanswered === 1 ? 'item' : 'items'}; WO closed before customer response was complete.`,
        evidence: [
          `Approval id: ${ap.id}`,
          `Approval status: ${ap.status}`,
          `Unanswered items: ${unanswered} of ${items.length}`,
        ],
      })
      break // one finding is enough; the card links to the WO
    }
  }

  /* Check 6 — Inventory part referenced on a line but no consumption record */
  // We don't have a separate consumption table — sprint 2.1's
  // consumeInventoryPart() decrements qty_on_hand directly. The closest
  // thing to a "consumption record" is the inventory_part_id link
  // existing on the line. The audit instead checks: does the part still
  // exist + is qty_on_hand >= 0? If part was archived after billing OR
  // qty went negative we flag it.
  const partLines = lines.filter((l) => !!l.inventory_part_id)
  if (partLines.length > 0) {
    const partIds = Array.from(new Set(partLines.map((l) => l.inventory_part_id!)))
    const { data: parts } = await supabase
      .from('inventory_parts')
      .select('id, part_number, qty_on_hand, is_archived')
      .in('id', partIds)
    const orphaned = partIds.filter(
      (id) => !((parts ?? []) as Array<{ id: string }>).find((p) => p.id === id),
    )
    const negative = ((parts ?? []) as Array<{ id: string; part_number: string; qty_on_hand: number }>)
      .filter((p) => p.qty_on_hand < 0)
    if (orphaned.length > 0 || negative.length > 0) {
      findings.push({
        check: 'inventory-mismatch',
        severity: 'warning',
        message: `${orphaned.length + negative.length} inventory part link${orphaned.length + negative.length === 1 ? '' : 's'} on this WO ${orphaned.length + negative.length === 1 ? 'has' : 'have'} a problem (deleted or quantity went negative).`,
        evidence: [
          ...orphaned.slice(0, 3).map((id) => `Orphaned part id: ${id}`),
          ...negative.slice(0, 3).map((p) => `Negative qty: ${p.part_number}`),
        ],
      })
    }
  }

  /* Check 7 — Tools used past calibration on this WO (permanent audit) */
  const overdueToolUses = toolUses.filter((t) => t.was_overdue === true)
  if (overdueToolUses.length > 0) {
    findings.push({
      check: 'tool-out-of-calibration',
      severity: 'critical',
      message: `${overdueToolUses.length} tool ${overdueToolUses.length === 1 ? 'use was' : 'uses were'} recorded with the tool past its calibration date.`,
      evidence: overdueToolUses.slice(0, 5).map((u) =>
        `${u.tools?.name ?? 'tool'} (${u.tools?.serial_number ?? '?'}) — used ${u.used_at.slice(0, 10)}`,
      ),
    })
  }

  // Resolve highest severity for the card priority + headline.
  const highest: FindingSeverity | 'none' = findings.length === 0
    ? 'none'
    : (findings.reduce<FindingSeverity>(
        (s, f) => (SEVERITY_RANK[f.severity] > SEVERITY_RANK[s] ? f.severity : s),
        'info',
      ))

  // Compose the card. Use LLM for body-text composition when available,
  // template fallback otherwise.
  const card = await composeCard(supabase, {
    organization_id: args.organization_id,
    wo_id: wo.id,
    wo_number: wo.work_order_number,
    tail: wo.aircraft?.tail_number ?? null,
    findings,
    highest,
  })

  // Upsert via dedupe_key. Same pattern as 5.1 generators.
  const dedupe = `wo-audit:${wo.id}`
  let cardId: string | null = null
  const { data: existing } = await supabase
    .from('ai_action_cards')
    .select('id')
    .eq('organization_id', args.organization_id)
    .eq('dedupe_key', dedupe)
    .is('dismissed_at', null)
    .is('resolved_at', null)
    .maybeSingle()

  if (existing) {
    cardId = (existing as { id: string }).id
    await supabase
      .from('ai_action_cards')
      .update({
        title: card.title,
        body: card.body,
        evidence: card.evidence,
        priority: card.priority,
        suggested_actions: card.suggested_actions,
      })
      .eq('id', cardId)
  } else {
    const { data: ins, error: insErr } = await supabase
      .from('ai_action_cards')
      .insert({
        organization_id: args.organization_id,
        persona: null,
        priority: card.priority,
        category: 'audit-finding',
        title: card.title,
        body: card.body,
        evidence: card.evidence,
        suggested_actions: card.suggested_actions,
        confidence: 0.9,
        source: card.llm_used ? 'llm' : 'rule',
        dedupe_key: dedupe,
      })
      .select('id')
      .single()
    if (!insErr && ins) cardId = (ins as { id: string }).id
  }

  return {
    work_order_id: wo.id,
    organization_id: args.organization_id,
    finding_count: findings.length,
    highest_severity: highest,
    findings,
    card_id: cardId,
  }
}

/* ─── Card composition ─────────────────────────────────────────────────── */

interface ComposedCard {
  title: string
  body: string
  evidence: string[]
  priority: 'urgent' | 'high' | 'normal' | 'low'
  suggested_actions: Array<{ label: string; href?: string; toolCall?: { tool: string; args?: Record<string, unknown> } }>
  llm_used: boolean
}

async function composeCard(
  supabase: SupabaseClient,
  args: {
    organization_id: string
    wo_id: string
    wo_number: string
    tail: string | null
    findings: Finding[]
    highest: FindingSeverity | 'none'
  },
): Promise<ComposedCard> {
  const woLabel = `${args.wo_number}${args.tail ? ` · ${args.tail}` : ''}`

  if (args.highest === 'none') {
    return {
      title: `${woLabel} — audit clear`,
      body: 'All checks passed. No follow-ups required for this work order.',
      evidence: ['7 of 7 audit checks passed', `Audited ${new Date().toISOString().slice(0, 10)}`],
      priority: 'low',
      suggested_actions: [{ label: 'Open work order', href: `/work-orders/${args.wo_id}` }],
      llm_used: false,
    }
  }

  const priority = SEVERITY_TO_PRIORITY[args.highest]
  const evidenceLines: string[] = args.findings.flatMap((f) => [
    `[${f.severity.toUpperCase()}] ${f.check}: ${f.message}`,
    ...f.evidence.map((e) => `   • ${e}`),
  ])

  // Try LLM summary; fall back to template on any failure / missing key.
  let body: string
  let llm_used = false
  try {
    const result = await callAnthropic(
      supabase,
      {
        system: AUDIT_SYSTEM_PROMPT,
        user: buildAuditUserPrompt({ woLabel, findings: args.findings }),
        max_tokens: 240,
        temperature: 0.3,
      },
      {
        organization_id: args.organization_id,
        scope: 'wo-audit-summary',
        entity_kind: 'work_orders',
        entity_id: args.wo_id,
        context: { findings_count: args.findings.length, highest: args.highest },
      },
    )
    body = result.text || templateBody(args.findings)
    llm_used = !!result.text
  } catch {
    body = templateBody(args.findings)
  }

  return {
    title: `${woLabel} — ${args.findings.length} audit ${args.findings.length === 1 ? 'finding' : 'findings'} (${args.highest})`,
    body,
    evidence: evidenceLines,
    priority,
    suggested_actions: [
      { label: 'Open work order', href: `/work-orders/${args.wo_id}` },
    ],
    llm_used,
  }
}

function templateBody(findings: Finding[]): string {
  if (findings.length === 1) {
    return findings[0].message
  }
  return `${findings.length} issues found: ${findings
    .slice(0, 3)
    .map((f) => f.check.replace(/-/g, ' '))
    .join(', ')}${findings.length > 3 ? ', …' : ''}.`
}

const AUDIT_SYSTEM_PROMPT = `You are a senior aviation maintenance inspector summarizing the results of an automated audit on a closed work order.

You will receive a list of findings the auditor surfaced. Each has a check name, severity, message, and evidence.

GOAL
Write 1-2 short sentences a shop manager can read in 5 seconds to know whether to follow up. Lead with the most severe issue. Be specific. Don't repeat what's already in the evidence list.

HARD CONSTRAINTS
- Do NOT invent FAR/AD/SB references not in the input.
- Do NOT invent costs, timestamps, or aircraft data.
- Do NOT include the WO number — the card already shows it.
- Output plain text. No headings, no bullets, no preamble.`

function buildAuditUserPrompt(args: { woLabel: string; findings: Finding[] }): string {
  const list = args.findings
    .map((f, i) => `${i + 1}. [${f.severity}] ${f.check}: ${f.message}`)
    .join('\n')
  return [
    `Work order: ${args.woLabel}`,
    `Findings:`,
    list,
    '',
    'Write the manager-facing summary per your system prompt.',
  ].join('\n')
}
