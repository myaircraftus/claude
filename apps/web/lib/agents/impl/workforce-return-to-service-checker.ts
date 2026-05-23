/**
 * workforce.return-to-service-checker
 *
 * Called by the UI immediately before a mechanic signs RTS on a work
 * order. Validates the chain BEFORE the signature commits:
 *
 *   1. every squawk linked to this aircraft (with status='open' or
 *      'in_progress') must have a corrective_action paragraph on the
 *      WO OR be explicitly deferred/closed
 *   2. every checklist row marked required=true must be completed
 *   3. every AD-compliance line item (item_type='ad_compliance') must
 *      reference a non-empty source_reference (the AD number)
 *   4. every parts line must have a non-empty part_number
 *   5. (optional) WO.total > 0
 *
 * Returns { ok, blockers[], warnings[] }. The UI shows blockers as
 * hard-stops; warnings are advisory. Mechanic still has the option
 * to override warnings (audit-logged) but blockers prevent sign.
 *
 * Pure SQL — no LLM. Runs synchronously inside the RTS flow.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { runAgent } from '../runner'

export interface RtsCheckOutput {
  ok: boolean
  blockers: Array<{ kind: string; detail: string; row_id?: string }>
  warnings: Array<{ kind: string; detail: string; row_id?: string }>
}

export async function checkReturnToService(args: {
  supabase: SupabaseClient
  triggeredBy?: string | null
  workOrderId: string
}): Promise<{ ok: boolean; output?: RtsCheckOutput; runId?: string; error?: string }> {
  return runAgent<RtsCheckOutput>(
    'workforce.return-to-service-checker',
    {
      supabase: args.supabase,
      triggeredBy: args.triggeredBy ?? null,
      target: { kind: 'work_order', id: args.workOrderId },
    },
    async () => {
      const blockers: RtsCheckOutput['blockers'] = []
      const warnings: RtsCheckOutput['warnings'] = []

      const { data: wo } = await args.supabase
        .from('work_orders')
        .select('id, organization_id, aircraft_id, status, total_amount, corrective_action')
        .eq('id', args.workOrderId)
        .maybeSingle()
      if (!wo) {
        blockers.push({ kind: 'wo_missing', detail: 'Work order not found.' })
        return { output: { ok: false, blockers, warnings }, needsHuman: true }
      }

      // 1. Open squawks on the aircraft
      if (wo.aircraft_id) {
        const { data: openSquawks } = await args.supabase
          .from('squawks')
          .select('id, title, status')
          .eq('organization_id', wo.organization_id)
          .eq('aircraft_id', wo.aircraft_id)
          .in('status', ['open', 'in_progress'])
        for (const sq of (openSquawks ?? []) as Array<{ id: string; title: string }>) {
          if (!wo.corrective_action || wo.corrective_action.trim().length === 0) {
            blockers.push({
              kind: 'open_squawk_uncleared',
              detail: `Open squawk "${sq.title}" — record a corrective action on the WO or defer/close the squawk.`,
              row_id: sq.id,
            })
          }
        }
      }

      // 2. Required checklist items
      const { data: checklist } = await args.supabase
        .from('work_order_checklist_items')
        .select('id, item_label, required, completed')
        .eq('work_order_id', args.workOrderId)
      for (const row of (checklist ?? []) as Array<{
        id: string
        item_label: string
        required: boolean
        completed: boolean
      }>) {
        if (row.required && !row.completed) {
          blockers.push({
            kind: 'checklist_required_open',
            detail: `Required checklist item "${row.item_label}" is not completed.`,
            row_id: row.id,
          })
        }
      }

      // 3. AD-compliance lines need a source_reference
      // 4. Parts lines need part_number
      const { data: lines } = await args.supabase
        .from('work_order_lines')
        .select('id, item_type, description, part_number, source_reference, line_total')
        .eq('work_order_id', args.workOrderId)
      for (const row of (lines ?? []) as Array<{
        id: string
        item_type: string | null
        description: string | null
        part_number: string | null
        source_reference: string | null
        line_total: number | null
      }>) {
        if (row.item_type === 'ad_compliance' && !row.source_reference) {
          blockers.push({
            kind: 'ad_missing_reference',
            detail: `AD-compliance line "${row.description ?? '(no description)'}" is missing the AD number.`,
            row_id: row.id,
          })
        }
        if (row.item_type === 'part' && !row.part_number) {
          warnings.push({
            kind: 'part_missing_number',
            detail: `Part line "${row.description ?? '(no description)'}" has no part number.`,
            row_id: row.id,
          })
        }
      }

      // 5. WO total — soft warning only
      if (wo.total_amount == null || Number(wo.total_amount) === 0) {
        warnings.push({
          kind: 'wo_zero_total',
          detail: 'Work order total is zero — confirm before signing.',
        })
      }

      const ok = blockers.length === 0
      return {
        output: { ok, blockers, warnings },
        needsHuman: !ok,
        recommendation: !ok ? { kind: 'rts_blocked', blockers, warnings } : null,
      }
    },
  )
}
