/**
 * Time-Off query helpers (Spec 2.5.2).
 *
 * Server-side helpers used by:
 *   - /api/time-off-requests routes
 *   - Scheduler shift-calendar PTO overlay
 *   - WO assignee-picker conflict warning (helper ready; picker UI is
 *     a follow-up — same shape as 2.5.1's getActiveTechniciansAt).
 *
 * All helpers take a tenant-scoped Supabase client; RLS handles org scope.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { TimeOffRequest } from '@/types'

/**
 * Spec helper: isTechOnTimeOff(techId, date) → boolean.
 *
 * Returns true iff the tech has an APPROVED time-off request whose
 * [start_date, end_date] interval contains `date` (inclusive both ends).
 */
export async function isTechOnTimeOff(
  supabase: SupabaseClient,
  technicianId: string,
  date: string,                          // YYYY-MM-DD
): Promise<boolean> {
  const { data, error } = await supabase
    .from('time_off_requests')
    .select('id')
    .eq('employee_id', technicianId)
    .eq('status', 'approved')
    .lte('start_date', date)
    .gte('end_date', date)
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return !!data
}

/**
 * Returns approved time-off requests overlapping [fromIso, toIso). Used
 * by the Scheduler calendar to render gray PTO bars across the day grid.
 */
export async function getApprovedTimeOffOverlay(
  supabase: SupabaseClient,
  organizationId: string,
  fromDate: string,
  toDate: string,
): Promise<TimeOffRequest[]> {
  const { data, error } = await supabase
    .from('time_off_requests')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('status', 'approved')
    .lte('start_date', toDate)
    .gte('end_date', fromDate)
    .order('start_date', { ascending: true })

  if (error) throw error
  return (data ?? []) as TimeOffRequest[]
}

/**
 * Bulk variant for the assignee picker — returns the set of approved
 * PTO blocks for the given techs in the given window. The picker can
 * key off `employee_id` to badge each tech, similar to 2.5.1's
 * getTechShiftStatusMap pattern.
 */
export async function getApprovedTimeOffForTechs(
  supabase: SupabaseClient,
  organizationId: string,
  technicianIds: string[],
  fromDate: string,
  toDate: string,
): Promise<TimeOffRequest[]> {
  if (technicianIds.length === 0) return []
  const { data, error } = await supabase
    .from('time_off_requests')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('status', 'approved')
    .in('employee_id', technicianIds)
    .lte('start_date', toDate)
    .gte('end_date', fromDate)
  if (error) throw error
  return (data ?? []) as TimeOffRequest[]
}
