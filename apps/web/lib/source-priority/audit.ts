/**
 * Source-priority audit log writer (Spec 7.8).
 *
 * recordOverride() inserts one row into source_overrides. Caller decides
 * whether the override should fire — usually by calling shouldOverride()
 * from lib/source-priority.ts first. We record both true overrides AND
 * "alternate source" entries (where the new priority <= existing) so the
 * audit trail captures every conflict, not just resolved ones.
 *
 * Service-role only — RLS blocks INSERT for authenticated callers.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { getSourcePriority } from '@/lib/source-priority'

export type SourceOverrideEntityType =
  | 'meter_reading'
  | 'cost_entry'
  | 'aircraft_field'
  | 'compliance_item'
  | 'flight_event'

export interface RecordOverrideParams {
  organization_id: string
  entity_type: SourceOverrideEntityType
  entity_id: string
  field_name: string
  old_value: unknown
  new_value: unknown
  old_source?: string | null
  new_source: string
  old_priority?: number | null
  new_priority?: number
  document_id?: string | null
  triggered_by?: string | null
  notes?: string | null
}

export async function recordOverride(
  supabase: SupabaseClient,
  params: RecordOverrideParams,
): Promise<{ id: string } | null> {
  // Resolve numeric priorities from source strings if not explicitly provided.
  const oldPriority = params.old_priority ?? (params.old_source ? getSourcePriority(params.old_source) : null)
  const newPriority = params.new_priority ?? getSourcePriority(params.new_source)

  const row = {
    organization_id: params.organization_id,
    entity_type: params.entity_type,
    entity_id: params.entity_id,
    field_name: params.field_name,
    old_value: params.old_value ?? null,
    new_value: params.new_value ?? null,
    old_source: params.old_source ?? null,
    old_priority: oldPriority,
    new_source: params.new_source,
    new_priority: newPriority,
    document_id: params.document_id ?? null,
    triggered_by: params.triggered_by ?? null,
    notes: params.notes ?? null,
  }

  const { data, error } = await supabase
    .from('source_overrides')
    .insert(row)
    .select('id')
    .maybeSingle()
  if (error) {
    console.warn('[source-priority] audit insert failed:', error.message)
    return null
  }
  return (data as { id: string } | null) ?? null
}
