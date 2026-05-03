/**
 * Rule-based action card generators (Spec 5.1).
 *
 * The orchestrator (sprint 0c) reacts to *signals* — events that just
 * happened. SmartHome needs the *current state* to surface as cards even
 * when no recent signal fired (e.g. a doc that's been expiring for a week
 * shouldn't require a fresh "expiration" signal to show up on the home).
 *
 * generateProactiveCards() scans the current state of the org and upserts
 * ai_action_cards rows. Idempotent via the partial unique index
 * idx_ai_action_cards_dedupe_active (org × dedupe_key WHERE active).
 *
 * Phase 5.3 will replace these scans with predictive ML cards. For now,
 * pure heuristics over today's data.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ActionCardCategory, ActionCardPriority, Persona } from '@/types'

/** Internal upsert payload — mirrors lib/ai/types.ts CreateActionCardInput. */
interface CardInput {
  organization_id: string
  persona: Persona | null
  priority: ActionCardPriority
  category: ActionCardCategory
  title: string
  body: string
  evidence: string[]
  suggested_actions: Array<{
    label: string
    toolCall?: { tool: string; args?: Record<string, unknown> }
    href?: string
  }>
  confidence: number
  source: 'rule'
  dedupe_key: string
}

const DAYS_30_MS = 30 * 24 * 60 * 60 * 1000

/* ─── Public entrypoint ────────────────────────────────────────────────── */

export async function generateProactiveCards(
  supabase: SupabaseClient,
  args: { organization_id: string; persona: Persona },
): Promise<{ cards_upserted: number; categories: string[] }> {
  const { organization_id: orgId, persona } = args

  const cards: CardInput[] = []

  // Owner + admin/shop see compliance/expiration/maintenance signals.
  // Mechanic persona gets the WO-focused subset.
  if (persona === 'owner' || persona === 'shop' || persona === 'admin') {
    cards.push(...await ownerCards(supabase, orgId))
  }
  if (persona === 'mechanic' || persona === 'shop' || persona === 'admin') {
    cards.push(...await mechanicCards(supabase, orgId))
  }

  if (cards.length === 0) return { cards_upserted: 0, categories: [] }

  // Upsert via dedupe_key — the partial unique index on (org, dedupe_key)
  // WHERE active makes this idempotent across re-renders. The cron tick of
  // sprint 0c also covers the same path; we use the same shape so no row
  // ends up duplicated when both fire.
  const rows = cards.map((c) => ({
    organization_id: c.organization_id,
    persona: c.persona,
    priority: c.priority,
    category: c.category,
    title: c.title,
    body: c.body,
    evidence: c.evidence,
    suggested_actions: c.suggested_actions,
    confidence: c.confidence,
    source: c.source,
    dedupe_key: c.dedupe_key,
  }))

  let upserted = 0
  for (const row of rows) {
    // Look for an existing active card with this dedupe_key.
    const { data: existing } = await supabase
      .from('ai_action_cards')
      .select('id')
      .eq('organization_id', row.organization_id)
      .eq('dedupe_key', row.dedupe_key)
      .is('dismissed_at', null)
      .is('resolved_at', null)
      .maybeSingle()
    if (existing) {
      // Refresh body/evidence on the existing row — the underlying data
      // may have shifted (e.g. days remaining decremented).
      await supabase
        .from('ai_action_cards')
        .update({
          title: row.title,
          body: row.body,
          evidence: row.evidence,
          priority: row.priority,
        })
        .eq('id', (existing as { id: string }).id)
    } else {
      const { error } = await supabase.from('ai_action_cards').insert(row as never)
      if (!error) upserted++
    }
  }

  return {
    cards_upserted: upserted,
    categories: Array.from(new Set(cards.map((c) => c.category))),
  }
}

/* ─── Owner / shop / admin scans ───────────────────────────────────────── */

async function ownerCards(supabase: SupabaseClient, orgId: string): Promise<CardInput[]> {
  const out: CardInput[] = []

  // 1. Documents expiring within 30 days (Sprint 2.6.2)
  const today = new Date().toISOString().slice(0, 10)
  const horizon = new Date(Date.now() + DAYS_30_MS).toISOString().slice(0, 10)
  const { data: docs } = await supabase
    .from('documents')
    .select('id, title, expiration_date, target_persona')
    .eq('organization_id', orgId)
    .eq('has_expiration', true)
    .gte('expiration_date', today)
    .lte('expiration_date', horizon)
    .order('expiration_date', { ascending: true })
    .limit(20)

  for (const d of (docs ?? []) as Array<{ id: string; title: string; expiration_date: string }>) {
    const days = Math.max(0, Math.round((Date.parse(d.expiration_date) - Date.now()) / 86_400_000))
    out.push({
      organization_id: orgId,
      persona: 'owner',
      priority: days <= 7 ? 'urgent' : days <= 14 ? 'high' : 'normal',
      category: 'expiration',
      title: `${d.title} expires in ${days} ${days === 1 ? 'day' : 'days'}`,
      body: `Expiration date ${d.expiration_date}. Renew or upload the new copy before it lapses.`,
      evidence: [`Document id ${d.id}`, `Days remaining: ${days}`],
      suggested_actions: [{ label: 'Open document', href: `/documents/expiring` }],
      confidence: 1.0,
      source: 'rule',
      dedupe_key: `expiring-doc:${d.id}`,
    })
  }

  // 2. Overdue compliance items (Sprint 1.2)
  const { data: compl } = await supabase
    .from('compliance_items')
    .select('id, title, status, next_due_date, aircraft_id')
    .eq('organization_id', orgId)
    .in('status', ['overdue', 'due-soon'])
    .order('next_due_date', { ascending: true })
    .limit(20)

  for (const c of (compl ?? []) as Array<{ id: string; title: string; status: string; next_due_date: string | null; aircraft_id: string }>) {
    const isOverdue = c.status === 'overdue'
    out.push({
      organization_id: orgId,
      persona: 'owner',
      priority: isOverdue ? 'urgent' : 'high',
      category: 'compliance',
      title: isOverdue ? `${c.title} — OVERDUE` : `${c.title} — due soon`,
      body: c.next_due_date
        ? `${c.title} is ${isOverdue ? 'past due' : 'due'} on ${c.next_due_date}.`
        : `${c.title} is ${isOverdue ? 'past due' : 'due soon'}.`,
      evidence: [`Compliance item id ${c.id}`, `Status: ${c.status}`],
      suggested_actions: [
        { label: 'Open compliance', href: `/aircraft/${c.aircraft_id}/compliance` },
      ],
      confidence: 1.0,
      source: 'rule',
      dedupe_key: `compliance-due:${c.id}`,
    })
  }

  // 3. Pending customer approvals (Sprint 1.5) — owner-facing reminder
  const { data: approvals } = await supabase
    .from('approval_requests')
    .select('id, subject, status, sent_date, customer_id')
    .eq('organization_id', orgId)
    .in('status', ['sent', 'partially-responded'])
    .order('sent_date', { ascending: true })
    .limit(10)

  for (const a of (approvals ?? []) as Array<{ id: string; subject: string | null; status: string; sent_date: string | null }>) {
    out.push({
      organization_id: orgId,
      persona: 'owner',
      priority: 'normal',
      category: 'approval',
      title: a.subject ? `Awaiting customer response: ${a.subject}` : 'Awaiting customer response',
      body: `Approval request is ${a.status}${a.sent_date ? `, sent ${a.sent_date.slice(0, 10)}` : ''}.`,
      evidence: [`Approval id ${a.id}`, `Status: ${a.status}`],
      suggested_actions: [{ label: 'Open approval', href: `/approvals/${a.id}` }],
      confidence: 0.9,
      source: 'rule',
      dedupe_key: `approval-pending:${a.id}`,
    })
  }

  return out
}

/* ─── Mechanic / shop / admin scans ────────────────────────────────────── */

async function mechanicCards(supabase: SupabaseClient, orgId: string): Promise<CardInput[]> {
  const out: CardInput[] = []

  // 1. Tools with calibration due in next 30 days OR overdue (Sprint 2.6.1)
  const today = new Date().toISOString().slice(0, 10)
  const horizon = new Date(Date.now() + DAYS_30_MS).toISOString().slice(0, 10)
  const { data: tools } = await supabase
    .from('tools')
    .select('id, name, serial_number, next_calibration_date, status')
    .eq('organization_id', orgId)
    .eq('calibration_required', true)
    .not('status', 'in', '("retired","lost")')
    .lte('next_calibration_date', horizon)
    .order('next_calibration_date', { ascending: true })
    .limit(20)

  for (const t of (tools ?? []) as Array<{ id: string; name: string; serial_number: string; next_calibration_date: string | null }>) {
    if (!t.next_calibration_date) continue
    const overdue = t.next_calibration_date < today
    const days = Math.round((Date.parse(t.next_calibration_date) - Date.now()) / 86_400_000)
    out.push({
      organization_id: orgId,
      persona: 'mechanic',
      priority: overdue ? 'urgent' : days <= 7 ? 'high' : 'normal',
      category: 'maintenance',
      title: overdue
        ? `Tool calibration OVERDUE — ${t.name}`
        : `Tool calibration due in ${days} ${days === 1 ? 'day' : 'days'} — ${t.name}`,
      body: `${t.name} (#${t.serial_number}) needs calibration on or before ${t.next_calibration_date}.`,
      evidence: [`Tool id ${t.id}`, `Serial: ${t.serial_number}`, `Next due: ${t.next_calibration_date}`],
      suggested_actions: [{ label: 'Open tool', href: `/tools/${t.id}` }],
      confidence: 1.0,
      source: 'rule',
      dedupe_key: `tool-calibration-due:${t.id}`,
    })
  }

  // 2. Open work orders (mechanic's queue)
  const { data: wos } = await supabase
    .from('work_orders')
    .select('id, work_order_number, status, scope, aircraft_id, due_date')
    .eq('organization_id', orgId)
    .in('status', ['open', 'in_progress', 'in-progress'])
    .order('due_date', { ascending: true, nullsFirst: false })
    .limit(20)

  for (const w of (wos ?? []) as Array<{ id: string; work_order_number: string; status: string; scope: string | null; due_date: string | null }>) {
    const overdue = !!(w.due_date && w.due_date < today)
    out.push({
      organization_id: orgId,
      persona: 'mechanic',
      priority: overdue ? 'urgent' : w.status === 'in_progress' || w.status === 'in-progress' ? 'high' : 'normal',
      category: 'maintenance',
      title: overdue
        ? `${w.work_order_number} — OVERDUE`
        : `${w.work_order_number} — ${humanStatus(w.status)}`,
      body: w.scope
        ? `${w.scope}${w.due_date ? ` · due ${w.due_date}` : ''}`
        : `${w.due_date ? `Due ${w.due_date}` : 'In your queue.'}`,
      evidence: [`Work order id ${w.id}`, `Status: ${w.status}`, ...(w.due_date ? [`Due: ${w.due_date}`] : [])],
      suggested_actions: [{ label: 'Open work order', href: `/work-orders/${w.id}` }],
      confidence: 1.0,
      source: 'rule',
      dedupe_key: `wo-open:${w.id}`,
    })
  }

  return out
}

function humanStatus(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
