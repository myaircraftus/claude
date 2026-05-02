/**
 * PO number generation (Spec 2.1).
 *
 * Format: PO-YYYY-NNNN (e.g. "PO-2026-0001"). Sequence per (organization,
 * year). Allocation is sequential — we read the highest existing
 * po_number for the year and increment. There's a UNIQUE(org, po_number)
 * constraint as the safety net for the rare race where two callers
 * allocate concurrently; the loser retries.
 *
 * Production-grade orgs eventually want a dedicated `po_number_sequences`
 * table or a Postgres sequence. v0 keeps it simple.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

const MAX_RETRIES = 5

export async function generatePoNumber(
  supabase: SupabaseClient,
  organizationId: string,
  /** Override for testing — defaults to current calendar year. */
  year: number = new Date().getUTCFullYear(),
): Promise<string> {
  const prefix = `PO-${year}-`

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    // Find the highest existing po_number for this org × year.
    const { data, error } = await supabase
      .from('purchase_orders')
      .select('po_number')
      .eq('organization_id', organizationId)
      .like('po_number', `${prefix}%`)
      .order('po_number', { ascending: false })
      .limit(1)

    if (error) throw new Error(`PO number lookup failed: ${error.message}`)

    let nextSeq = 1
    if (data && data.length > 0) {
      const last = (data[0] as { po_number: string }).po_number
      const parsed = parseInt(last.slice(prefix.length), 10)
      if (Number.isFinite(parsed)) nextSeq = parsed + 1
    }

    const candidate = `${prefix}${String(nextSeq).padStart(4, '0')}`

    // Probe — if the row already exists (race), retry. We don't actually
    // insert here; the caller's INSERT carries the UNIQUE constraint.
    const { data: collide } = await supabase
      .from('purchase_orders')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('po_number', candidate)
      .maybeSingle()
    if (!collide) return candidate
  }

  // Fallback: very unlikely concurrent-allocation scenario. Append a
  // millisecond suffix so the UNIQUE constraint won't collide.
  return `${prefix}${Date.now().toString().slice(-4)}`
}
