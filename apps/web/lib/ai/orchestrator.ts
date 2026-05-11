/**
 * AI Orchestrator (Spec 0.3) — the brain.
 *
 * Per spec, the loop:
 *   1. Drain new signals
 *   2. For each signal, look up rule-based matches → emit ActionCard
 *   3. Every 10 minutes, run LLM pass over recent signals → emit insight cards
 *   4. Every hour, run ML predictions → emit anomaly cards
 *   5. Dedupe + prioritize
 *   6. Push to user's AI Inbox
 *   7. Mark dismissed/resolved cards as such
 *
 * This sprint (0.3) ships steps 1-2-5-6-7 with rule-based matching only.
 * Steps 3 (LLM pass) and 4 (ML predictions) are stubbed with clear TODOs —
 * Phase 5 (AI Experience) replaces the rule engine with real model calls.
 *
 * Dedupe strategy:
 *   - Each card carries an optional dedupe_key (e.g. "annual-due-{aircraft_id}").
 *   - The unique partial index `idx_ai_action_cards_dedupe_active` prevents
 *     duplicates while a card is active.
 *   - On collision, the orchestrator updates the existing card in place
 *     (ON CONFLICT DO UPDATE) so the user sees the latest evidence.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  AISignal,
  AISignalType,
  CreateActionCardInput,
  ActionCardCategory,
  ActionCardPriority,
} from './types'
import { sendNotification } from '@/lib/notifications/dispatch'

/* ─── Rule type ──────────────────────────────────────────────────────── */

interface OrchestratorRule {
  id: string                       // for logging / dedupe lineage
  matches: AISignalType[]          // which signal types fire this rule
  /**
   * Given a signal, return zero or more ActionCards to upsert. Pure
   * function of the signal — handlers should NOT read external state in
   * 0.3 (Phase 5 introduces async/LLM rules).
   */
  apply: (signal: AISignal) => CreateActionCardInput[]
}

/* ─── Rule registry ─────────────────────────────────────────────────── */

const RULES: OrchestratorRule[] = [
  /**
   * Acceptance harness rule: `meter-reading` signal → "Annual inspection
   * coming up" insight ActionCard. Spec 0.3 acceptance criterion.
   *
   * The card content is intentionally generic — Feature 1.2 (Compliance)
   * will replace this with a real prediction. The wiring is what we're
   * verifying in 0.3: signal → orchestrator → card → AI Inbox.
   */
  {
    id: 'meter-reading-compliance-glance',
    matches: ['meter-reading'],
    apply: (signal) => {
      const aircraftId = String((signal.payload as any)?.aircraft_id ?? '')
      const tail       = String((signal.payload as any)?.tail_number ?? 'this aircraft')
      const hobbs      = (signal.payload as any)?.hobbs as number | undefined
      // Don't emit a card for synthetic test signals unless explicitly asked
      // — we still want the orchestrator to *be* exercised, but spammy cards
      // from health checks would clutter the inbox.
      if ((signal.payload as any)?.test === true) return []
      return [{
        organization_id: signal.organization_id,
        persona: null, // visible to all personas — Phase 1.2 will narrow per role
        priority: 'normal' as ActionCardPriority,
        category: 'compliance' as ActionCardCategory,
        title: `New meter reading logged for ${tail}`,
        body:
          hobbs != null
            ? `Hobbs is now ${hobbs}. Once compliance tracking lands (Feature 1.2), this card will show how close ${tail} is to its next inspection.`
            : `Once compliance tracking lands (Feature 1.2), this card will show how close ${tail} is to its next inspection.`,
        evidence: [
          `Signal id ${signal.id}`,
          `Source: ${signal.source}`,
          ...(hobbs != null ? [`Hobbs reading: ${hobbs}`] : []),
        ],
        suggested_actions: aircraftId
          ? [{
              label: 'View aircraft',
              toolCall: { tool: 'getAircraftStatus', args: { aircraft_id: aircraftId } },
            }]
          : [],
        confidence: 0.5,
        source: 'rule',
        dedupe_key: aircraftId ? `meter-reading-glance:${aircraftId}` : null,
        source_signal_id: signal.id,
      }]
    },
  },

  /**
   * `test` signal → ephemeral verification card. Used by the acceptance
   * harness and ad-hoc dev pings to confirm the orchestrator is alive.
   */
  {
    id: 'test-ping',
    matches: ['test'],
    apply: (signal) => [{
      organization_id: signal.organization_id,
      persona: null,
      priority: 'low' as ActionCardPriority,
      category: 'insight' as ActionCardCategory,
      title: 'Orchestrator ping received',
      body: 'This is a synthetic ActionCard generated from a `test` signal. You can safely dismiss it.',
      evidence: [`Signal id ${signal.id}`, `Source: ${signal.source}`],
      suggested_actions: [],
      confidence: 1,
      source: 'rule',
      dedupe_key: `test-ping:${signal.organization_id}`,
      source_signal_id: signal.id,
    }],
  },

  /**
   * Sprint 1.2 wire-in: `compliance-due` signals fire from
   * lib/compliance/recompute.ts whenever an item flips to overdue or
   * due-soon. Each emits a real ActionCard with a SuggestedAction that
   * marks the item complete (toolCall stub will become real once
   * Feature 1.2's complete-tool ships its handler).
   */
  {
    id: 'compliance-due-card',
    matches: ['compliance-due'],
    apply: (signal) => {
      const p = signal.payload as any
      const status = String(p?.status ?? 'due-soon')
      const isOverdue = status === 'overdue'
      const title = String(p?.title ?? 'Compliance item')
      const itemId = String(p?.compliance_item_id ?? '')
      const aircraftId = String(p?.aircraft_id ?? '')
      const dueDate = p?.next_due_date ? String(p.next_due_date) : null
      const dueHours = p?.next_due_hours

      const body = isOverdue
        ? `${title} is overdue${dueDate ? ` (due ${dueDate})` : ''}${dueHours != null ? ` or at ${dueHours} hours` : ''}.`
        : `${title} is due soon${dueDate ? ` on ${dueDate}` : ''}${dueHours != null ? ` or at ${dueHours} hours` : ''}.`

      return [{
        organization_id: signal.organization_id,
        persona: null,
        priority: isOverdue ? ('urgent' as ActionCardPriority) : ('high' as ActionCardPriority),
        category: 'compliance' as ActionCardCategory,
        title: isOverdue ? `Overdue: ${title}` : `Due soon: ${title}`,
        body,
        evidence: [
          `Source: ${String(p?.source ?? 'Custom')}`,
          ...(p?.requires_rii ? ['Requires RII (Required Inspection Item)'] : []),
          ...(dueDate ? [`Next due date: ${dueDate}`] : []),
          ...(dueHours != null ? [`Next due hours: ${dueHours}`] : []),
        ],
        suggested_actions: itemId
          ? [{
              label: isOverdue ? 'Complete now' : 'Mark complete',
              toolCall: { tool: 'markComplianceComplete', args: { compliance_item_id: itemId } },
            }]
          : [],
        confidence: 0.95,
        source: 'rule',
        dedupe_key: itemId ? `compliance-due:${itemId}` : null,
        source_signal_id: signal.id,
      }]
    },
  },

  /**
   * Sprint 2.1 wire-in: `low-stock` signals fire from
   * lib/inventory/consume.ts when qty_on_hand crosses min_on_hand from
   * above. Each emits a high-priority compliance/maintenance ActionCard
   * with a "View part" SuggestedAction. Cross-wire 0d picks up high-
   * priority cards and notifies alert_emails recipients.
   */
  {
    id: 'low-stock-card',
    matches: ['low-stock'],
    apply: (signal) => {
      const p = signal.payload as any
      const partId = String(p?.inventory_part_id ?? '')
      const partNumber = String(p?.part_number ?? 'part')
      const description = String(p?.description ?? '')
      const qtyOnHand = p?.qty_on_hand
      const minOnHand = p?.min_on_hand
      const vendor = p?.vendor

      const body = description
        ? `${description} (${partNumber}) is at ${qtyOnHand}${minOnHand != null ? ` of ${minOnHand} threshold` : ''}.${vendor ? ` Reorder from ${vendor}.` : ''}`
        : `${partNumber} is at ${qtyOnHand}${minOnHand != null ? ` of ${minOnHand} threshold` : ''}.`

      return [{
        organization_id: signal.organization_id,
        persona: 'shop',
        priority: 'high' as ActionCardPriority,
        category: 'maintenance' as ActionCardCategory,
        title: `Low stock: ${partNumber}`,
        body,
        evidence: [
          `Part: ${partNumber}`,
          ...(description ? [description] : []),
          ...(qtyOnHand != null ? [`qty on hand: ${qtyOnHand}`] : []),
          ...(minOnHand != null ? [`reorder threshold: ${minOnHand}`] : []),
          ...(vendor ? [`Last vendor: ${vendor}`] : []),
        ],
        suggested_actions: partId
          ? [{
              label: 'View part',
              toolCall: { tool: 'searchParts', args: { query: partNumber, include_external: false } },
            }]
          : [],
        confidence: 1,
        source: 'rule',
        dedupe_key: partId ? `low-stock:${partId}` : null,
        source_signal_id: signal.id,
      }]
    },
  },

  // TODO(0.3 → 1.5): rule for 'approval-response' → status-change card
  // TODO(0.3 → 2.6): rule for 'tool-overdue' → calibration-due card
  // TODO(0.3 → 5.3): rule for 'anomaly' → ML-flagged card
]

/* ─── Tick ───────────────────────────────────────────────────────────── */

export interface TickResult {
  signals_processed: number
  cards_emitted: number
  cards_deduped: number
  errors: string[]
}

/**
 * Run one orchestrator tick for a single org. Drains all unprocessed signals
 * for that org, applies the rule registry, upserts the resulting cards,
 * and marks signals processed. Idempotent — running twice is safe.
 *
 * `supabase` should be the request user's client (RLS enforced) when called
 * from a user-driven trigger, or the service-role client when called from
 * cron (so it can update across orgs in a single batch).
 */
export async function tickOrchestrator(
  supabase: SupabaseClient,
  organizationId: string,
  options: { limit?: number } = {},
): Promise<TickResult> {
  const limit = options.limit ?? 100
  const result: TickResult = {
    signals_processed: 0,
    cards_emitted: 0,
    cards_deduped: 0,
    errors: [],
  }

  // 1. Drain unprocessed signals (FIFO-ish — older first)
  const { data: signals, error: signalsErr } = await supabase
    .from('ai_signals')
    .select('*')
    .eq('organization_id', organizationId)
    .is('processed_at', null)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (signalsErr) {
    result.errors.push(`fetch signals: ${signalsErr.message}`)
    return result
  }
  if (!signals || signals.length === 0) return result

  const cardsToUpsert: CreateActionCardInput[] = []

  // 2. Apply rules
  for (const sig of signals as AISignal[]) {
    for (const rule of RULES) {
      if (!rule.matches.includes(sig.signal_type)) continue
      try {
        const cards = rule.apply(sig)
        cardsToUpsert.push(...cards)
      } catch (e: any) {
        result.errors.push(`rule ${rule.id} on signal ${sig.id}: ${e?.message ?? e}`)
      }
    }
    result.signals_processed += 1
  }

  // 3. Upsert cards (dedupe via the partial unique index on dedupe_key)
  for (const card of cardsToUpsert) {
    if (card.dedupe_key) {
      // Try update first; fall back to insert. Partial unique index makes
      // ON CONFLICT cleaner but supabase-js doesn't expose a partial-index
      // upsert path, so we do it manually.
      const { data: existing } = await supabase
        .from('ai_action_cards')
        .select('id')
        .eq('organization_id', card.organization_id)
        .eq('dedupe_key', card.dedupe_key)
        .is('dismissed_at', null)
        .is('resolved_at', null)
        .maybeSingle()

      if (existing) {
        const { error: updErr } = await supabase
          .from('ai_action_cards')
          .update({
            persona: card.persona ?? null,
            priority: card.priority ?? 'normal',
            category: card.category,
            title: card.title,
            body: card.body,
            evidence: card.evidence ?? [],
            suggested_actions: card.suggested_actions ?? [],
            confidence: card.confidence ?? 0.5,
            source: card.source ?? 'rule',
            source_signal_id: card.source_signal_id ?? null,
          })
          .eq('id', (existing as { id: string }).id)
        if (updErr) result.errors.push(`update card: ${updErr.message}`)
        else result.cards_deduped += 1
        continue
      }
    }

    const { data: inserted, error: insErr } = await supabase
      .from('ai_action_cards')
      .insert({
        organization_id: card.organization_id,
        persona: card.persona ?? null,
        priority: card.priority ?? 'normal',
        category: card.category,
        title: card.title,
        body: card.body,
        evidence: card.evidence ?? [],
        suggested_actions: card.suggested_actions ?? [],
        confidence: card.confidence ?? 0.5,
        source: card.source ?? 'rule',
        dedupe_key: card.dedupe_key ?? null,
        source_signal_id: card.source_signal_id ?? null,
      })
      .select('id')
      .single()
    if (insErr) {
      result.errors.push(`insert card: ${insErr.message}`)
      continue
    }
    result.cards_emitted += 1

    // Spec 0.4 cross-wire: every newly-inserted urgent/high card also fires
    // a notification through the unified dispatcher. Lower-priority cards
    // (normal/low) live in the AI Inbox without paging the user. Failures
    // here do NOT block the orchestrator — they're collected as warnings.
    const shouldPage = card.priority === 'urgent' || card.priority === 'high'
    if (shouldPage) {
      try {
        const dispatch = await sendNotification(supabase, {
          organization_id: card.organization_id,
          user_id: 'all-org-members',
          category: card.category,
          title: card.title,
          body: card.body,
          link: '/inbox',
          source_card_id: (inserted as { id: string }).id,
          source_kind: 'ai_action_card',
          source_id: (inserted as { id: string }).id,
        })
        result.errors.push(...dispatch.errors)
      } catch (e: any) {
        result.errors.push(`notify card: ${e?.message ?? e}`)
      }
    }
  }

  // 4. Mark signals processed
  const ids = (signals as AISignal[]).map((s) => s.id)
  if (ids.length > 0) {
    const { error: markErr } = await supabase
      .from('ai_signals')
      .update({ processed_at: new Date().toISOString() })
      .in('id', ids)
    if (markErr) result.errors.push(`mark processed: ${markErr.message}`)
  }

  // TODO(0.3 → 5.x): step 3 of the spec loop — LLM pass over recent signals
  // TODO(0.3 → 5.3): step 4 of the spec loop — ML predictions for anomalies

  return result
}
