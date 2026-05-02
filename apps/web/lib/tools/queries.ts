/**
 * Tool / calibration helpers (Spec 2.6.1).
 *
 * Server-side. RLS handles org scope; helpers focus on business rules
 * (compute next due, block overdue tool use on a WO, check-out/return).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Tool, CalibrationEvent, ToolCheckout } from '@/types'

/** Spec helper: getCalibrationDueList(lookAheadDays) → tools with
 *  next_calibration_date within (today, today + lookAhead]. */
export async function getCalibrationDueList(
  supabase: SupabaseClient,
  organizationId: string,
  lookAheadDays = 30,
): Promise<Tool[]> {
  const today = new Date().toISOString().slice(0, 10)
  const horizon = new Date()
  horizon.setDate(horizon.getDate() + lookAheadDays)
  const toIso = horizon.toISOString().slice(0, 10)

  const { data, error } = await supabase
    .from('tools')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('calibration_required', true)
    .not('status', 'in', '("retired","lost")')
    .gte('next_calibration_date', today)
    .lte('next_calibration_date', toIso)
    .order('next_calibration_date', { ascending: true })

  if (error) throw error
  return (data ?? []) as Tool[]
}

/** Spec helper: getOverdueTools() — past next_calibration_date today. */
export async function getOverdueTools(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<Tool[]> {
  const today = new Date().toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from('tools')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('calibration_required', true)
    .not('status', 'in', '("retired","lost")')
    .lt('next_calibration_date', today)
    .order('next_calibration_date', { ascending: true })
  if (error) throw error
  return (data ?? []) as Tool[]
}

/**
 * Spec helper: assertToolCalibrated(toolId) — used by WO save guard.
 * Returns { ok: true } if the tool is current; { ok: false, reason }
 * if overdue past the tolerance window. tolerance_days extends the
 * deadline (some shops give a 14-day grace).
 */
export async function assertToolCalibrated(
  supabase: SupabaseClient,
  organizationId: string,
  toolId: string,
): Promise<{ ok: true; tool: Tool } | { ok: false; reason: string; tool: Tool | null }> {
  const { data: tool } = await supabase
    .from('tools')
    .select('*')
    .eq('id', toolId)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (!tool) return { ok: false, reason: 'Tool not found in this org', tool: null }

  const t = tool as Tool
  if (t.status === 'retired' || t.status === 'lost') {
    return { ok: false, reason: `Tool is ${t.status}`, tool: t }
  }
  if (!t.calibration_required) return { ok: true, tool: t }
  if (!t.next_calibration_date) {
    return { ok: false, reason: 'Tool requires calibration before use (no calibration on file)', tool: t }
  }
  // Apply tolerance_days as a grace window past the next-due date.
  const deadline = new Date(t.next_calibration_date + 'T00:00:00')
  deadline.setDate(deadline.getDate() + (t.tolerance_days ?? 0))
  if (Date.now() > deadline.getTime()) {
    return {
      ok: false,
      reason: `Tool requires calibration before use (next due was ${t.next_calibration_date}${t.tolerance_days ? ` + ${t.tolerance_days}-day tolerance` : ''})`,
      tool: t,
    }
  }
  return { ok: true, tool: t }
}

interface CheckoutArgs {
  organizationId: string
  toolId: string
  userId: string
  workOrderId?: string | null
  notes?: string | null
}

/** Spec helper: checkOutTool(toolId, userId, workOrderId?). DB partial
 *  UNIQUE on tool_id where returned_at IS NULL prevents double-checkout. */
export async function checkOutTool(
  supabase: SupabaseClient,
  args: CheckoutArgs,
): Promise<{ ok: boolean; checkout: ToolCheckout | null; error?: string }> {
  // Friendly check first.
  const { data: open } = await supabase
    .from('tool_checkouts')
    .select('id')
    .eq('tool_id', args.toolId)
    .is('returned_at', null)
    .limit(1)
    .maybeSingle()
  if (open) return { ok: false, checkout: null, error: 'Tool is already checked out' }

  // Insert checkout row + denormalize on the tool.
  const nowIso = new Date().toISOString()
  const { data, error } = await supabase
    .from('tool_checkouts')
    .insert({
      organization_id: args.organizationId,
      tool_id: args.toolId,
      user_id: args.userId,
      work_order_id: args.workOrderId ?? null,
      checked_out_at: nowIso,
      notes: args.notes ?? null,
    })
    .select('*')
    .single()
  if (error) {
    // 23505 unique_violation = race; report as 409
    if ((error as any).code === '23505') return { ok: false, checkout: null, error: 'Tool is already checked out' }
    return { ok: false, checkout: null, error: error.message }
  }

  await supabase
    .from('tools')
    .update({
      status: 'in-use',
      checked_out_by: args.userId,
      checked_out_at: nowIso,
      checked_out_to_work_order: args.workOrderId ?? null,
    })
    .eq('id', args.toolId)
    .eq('organization_id', args.organizationId)

  return { ok: true, checkout: data as ToolCheckout }
}

/** Spec helper: returnTool(checkoutId, condition). Closes the open
 *  checkout, clears the tool's denorm, and if condition is
 *  'needs-recalibration' nudges status to 'out-for-calibration'. */
export async function returnTool(
  supabase: SupabaseClient,
  args: { organizationId: string; checkoutId: string; condition?: 'ok' | 'damaged' | 'needs-recalibration'; notes?: string | null },
): Promise<{ ok: boolean; checkout: ToolCheckout | null; error?: string }> {
  const { data: existing } = await supabase
    .from('tool_checkouts')
    .select('*')
    .eq('id', args.checkoutId)
    .eq('organization_id', args.organizationId)
    .maybeSingle()
  if (!existing) return { ok: false, checkout: null, error: 'Checkout not found' }
  if ((existing as ToolCheckout).returned_at) {
    return { ok: false, checkout: existing as ToolCheckout, error: 'Already returned' }
  }

  const nowIso = new Date().toISOString()
  const { data, error } = await supabase
    .from('tool_checkouts')
    .update({
      returned_at: nowIso,
      condition_at_return: args.condition ?? 'ok',
      notes: args.notes ?? (existing as ToolCheckout).notes ?? null,
    })
    .eq('id', args.checkoutId)
    .is('returned_at', null)
    .select('*')
    .maybeSingle()
  if (error) return { ok: false, checkout: null, error: error.message }
  if (!data) return { ok: false, checkout: null, error: 'Already returned (race)' }

  // Tool denorm: clear checkout + set new status.
  const newStatus = args.condition === 'needs-recalibration' ? 'out-for-calibration'
    : args.condition === 'damaged' ? 'out-of-service'
    : 'available'
  await supabase
    .from('tools')
    .update({
      status: newStatus,
      checked_out_by: null,
      checked_out_at: null,
      checked_out_to_work_order: null,
    })
    .eq('id', (existing as ToolCheckout).tool_id)
    .eq('organization_id', args.organizationId)

  return { ok: true, checkout: data as ToolCheckout }
}

/** Compute next-due-date from a calibration event + the tool's interval
 *  spec. If the tool has interval_months, advance from performed_at by
 *  that many months. interval_uses requires a separate counter (not
 *  modeled here for v0); falls back to +12 months if neither is set. */
export function computeNextDueDate(
  performedAtIso: string,
  intervalMonths?: number | null,
): string {
  const d = new Date(performedAtIso + 'T00:00:00')
  d.setMonth(d.getMonth() + (intervalMonths && intervalMonths > 0 ? intervalMonths : 12))
  return d.toISOString().slice(0, 10)
}
