/**
 * Inventory consumption helpers (Spec 2.1).
 *
 * `consumeInventoryPart()` decrements qty_on_hand by `quantity` and:
 *   - Emits a `low-stock` AISignal (Sprint 0c) when the new qty crosses
 *     the min_on_hand threshold (was-above-now-at-or-below). The
 *     orchestrator's low-stock-card rule produces an ActionCard; Sprint
 *     0d's urgent/high cross-wire fans out notifications to alert_emails
 *     once email delivery lands.
 *   - Refuses to over-consume (clamps at 0 with a warning + records the
 *     attempted shortfall in the result so the UI can surface it).
 *
 * `restockInventoryPart()` increments qty_on_hand. Used by:
 *   - Manual restock (operator-side endpoint)
 *   - PO fulfillment (sums per line)
 *
 * Both helpers update unit_cost when a non-zero override is supplied
 * (weighted-average cost would be the right move for v1; we use the
 * latest cost as a simple-and-good-enough heuristic for v0).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { emitSignal } from '@/lib/ai/signals'
import type { InventoryPart } from '@/types'

export interface ConsumeResult {
  ok: boolean
  part: InventoryPart | null
  /** New qty after the consume. Null on failure. */
  qty_on_hand: number | null
  /** True if the consume crossed the threshold from above to at-or-below. */
  flipped_low_stock: boolean
  /** Attempted minus actually consumed; > 0 means we clamped at 0. */
  shortfall: number
  error?: string
}

/**
 * Decrement qty_on_hand for a single part. Idempotent via `idempotency_key`
 * is intentionally NOT supported in v0 — callers should add their own
 * (e.g. work_order_line_id) at a higher level if needed. The DB CHECK
 * on qty_on_hand >= 0 makes accidental over-consumes loud, not silent.
 */
export async function consumeInventoryPart(
  supabase: SupabaseClient,
  organizationId: string,
  userId: string | null,
  partId: string,
  quantity: number,
  options: {
    /** Source of the consume (e.g. WO line id) — written to a future audit table. */
    source_kind?: string
    source_id?: string
  } = {},
): Promise<ConsumeResult> {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return {
      ok: false, part: null, qty_on_hand: null, flipped_low_stock: false,
      shortfall: 0, error: 'quantity must be a positive number',
    }
  }

  const { data: existing, error: fetchErr } = await supabase
    .from('inventory_parts')
    .select('*')
    .eq('id', partId)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (fetchErr) {
    return { ok: false, part: null, qty_on_hand: null, flipped_low_stock: false, shortfall: 0, error: fetchErr.message }
  }
  if (!existing) {
    return { ok: false, part: null, qty_on_hand: null, flipped_low_stock: false, shortfall: 0, error: 'Part not found in this organization' }
  }
  const part = existing as InventoryPart

  const before = Number(part.qty_on_hand)
  const minOnHand = Number(part.min_on_hand)
  const wasAboveThreshold = before > minOnHand

  // Clamp at 0 instead of throwing — UI can surface the shortfall as a
  // soft warning, and the operator can either restock or accept the row.
  const consumed = Math.min(before, quantity)
  const after = before - consumed
  const shortfall = quantity - consumed

  const { data: updated, error: updErr } = await supabase
    .from('inventory_parts')
    .update({ qty_on_hand: after })
    .eq('id', partId)
    .eq('organization_id', organizationId)
    .select('*')
    .single()
  if (updErr) {
    return { ok: false, part: null, qty_on_hand: null, flipped_low_stock: false, shortfall, error: updErr.message }
  }

  const flipped = wasAboveThreshold && after <= minOnHand

  // Sprint 2.1 → 0c cross-wire: low-stock signal on threshold flip.
  if (flipped) {
    emitSignal(supabase, organizationId, userId, {
      type: 'low-stock',
      payload: {
        inventory_part_id: partId,
        part_number: part.part_number,
        description: part.description,
        qty_on_hand: after,
        min_on_hand: minOnHand,
        vendor: part.vendor,
        alert_emails: part.alert_emails,
        source_kind: options.source_kind ?? null,
        source_id:   options.source_id   ?? null,
      },
      source: 'system',
    }).catch((e) => console.warn('[inventory/consume] signal emit failed:', e))
  }

  return {
    ok: true,
    part: updated as InventoryPart,
    qty_on_hand: after,
    flipped_low_stock: flipped,
    shortfall,
  }
}

export interface RestockResult {
  ok: boolean
  part: InventoryPart | null
  qty_on_hand: number | null
  /** True if the restock cleared the low-stock state (was-at-or-below-now-above). */
  cleared_low_stock: boolean
  error?: string
}

/**
 * Increment qty_on_hand for a single part. Used by PO fulfillment + manual
 * restock. Optional `unit_cost_override` updates the part's unit_cost (latest-
 * cost heuristic; weighted-average is a follow-up).
 */
export async function restockInventoryPart(
  supabase: SupabaseClient,
  organizationId: string,
  partId: string,
  quantity: number,
  options: { unit_cost_override?: number } = {},
): Promise<RestockResult> {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { ok: false, part: null, qty_on_hand: null, cleared_low_stock: false, error: 'quantity must be a positive number' }
  }

  const { data: existing, error: fetchErr } = await supabase
    .from('inventory_parts')
    .select('*')
    .eq('id', partId)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (fetchErr) return { ok: false, part: null, qty_on_hand: null, cleared_low_stock: false, error: fetchErr.message }
  if (!existing) return { ok: false, part: null, qty_on_hand: null, cleared_low_stock: false, error: 'Part not found in this organization' }
  const part = existing as InventoryPart

  const before = Number(part.qty_on_hand)
  const minOnHand = Number(part.min_on_hand)
  const wasAtOrBelow = before <= minOnHand
  const after = before + quantity

  const updates: Record<string, unknown> = { qty_on_hand: after }
  if (options.unit_cost_override !== undefined && Number.isFinite(options.unit_cost_override) && options.unit_cost_override >= 0) {
    updates.unit_cost = options.unit_cost_override
  }

  const { data: updated, error: updErr } = await supabase
    .from('inventory_parts')
    .update(updates)
    .eq('id', partId)
    .eq('organization_id', organizationId)
    .select('*')
    .single()
  if (updErr) return { ok: false, part: null, qty_on_hand: null, cleared_low_stock: false, error: updErr.message }

  return {
    ok: true,
    part: updated as InventoryPart,
    qty_on_hand: after,
    cleared_low_stock: wasAtOrBelow && after > minOnHand,
  }
}
