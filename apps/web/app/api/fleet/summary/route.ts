/**
 * GET /api/fleet/summary
 *
 * One-shot org-wide rollup the Dashboard's Fleet Analytics widget renders.
 * All data is derived from existing tables — no new state.
 *
 * Returns:
 *   {
 *     aircraft: { total: number, with_open_wo: number },
 *     work_orders: { open: number, awaiting_approval: number, total_open_value_cents: number, hours_logged: number },
 *     ads: { total: number, compliant: number, overdue: number, unknown: number },
 *     documents: { total: number, indexed: number, processing: number, failed: number, needs_review: number },
 *     maintenance_spend_ytd_cents: number,
 *     squawks: { open: number, critical: number },
 *     timeline_30d: { events: number, by_day: Array<{ date: string, count: number }> }
 *   }
 *
 * Designed to be cheap: every query is a single COUNT/SUM on indexed columns
 * scoped to organization_id. No N+1, no joins to user tables.
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServiceSupabase } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const OPEN_WO_STATUSES = [
  'draft',
  'open',
  'awaiting_approval',
  'awaiting_parts',
  'in_progress',
  'waiting_on_customer',
  'ready_for_signoff',
]

export async function GET(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceSupabase()
  const orgId = ctx.organizationId

  // ── Aircraft ─────────────────────────────────────────────────────────────
  const { count: aircraftTotal } = await service
    .from('aircraft')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('is_archived', false)

  // ── Work orders ──────────────────────────────────────────────────────────
  type OpenWORow = { id: string; aircraft_id: string | null; status: string | null; total_amount: number | string | null }
  const { data: openWOsRaw } = await service
    .from('work_orders')
    .select('id, aircraft_id, status, total_amount, labor_total, parts_total')
    .eq('organization_id', orgId)
    .in('status', OPEN_WO_STATUSES)
  const openWOs: OpenWORow[] = (openWOsRaw as OpenWORow[] | null) ?? []

  const woOpen = openWOs.length
  const woAwaitingApproval = openWOs.filter((w: OpenWORow) => w.status === 'awaiting_approval').length
  const totalOpenValueCents = openWOs.reduce(
    (sum: number, w: OpenWORow) => sum + Math.round(Number(w.total_amount ?? 0) * 100),
    0,
  )
  const aircraftWithOpenWO = new Set(openWOs.map((w: OpenWORow) => w.aircraft_id).filter(Boolean) as string[]).size

  // Hours logged = SUM(work_order_lines.hours) where line work order is open
  type LineRow = { hours: number | string | null }
  const openWOIds = openWOs.map((w: OpenWORow) => w.id)
  let hoursLogged = 0
  if (openWOIds.length > 0) {
    const { data: linesRaw } = await service
      .from('work_order_lines')
      .select('hours')
      .eq('organization_id', orgId)
      .in('work_order_id', openWOIds)
    const lines: LineRow[] = (linesRaw as LineRow[] | null) ?? []
    hoursLogged = lines.reduce((sum: number, l: LineRow) => sum + Number(l.hours ?? 0), 0)
  }

  // ── ADs ──────────────────────────────────────────────────────────────────
  type AdRow = { compliance_status: string | null }
  const { data: adsRaw } = await service
    .from('aircraft_ad_applicability')
    .select('compliance_status')
    .eq('organization_id', orgId)
  const ads: AdRow[] = (adsRaw as AdRow[] | null) ?? []
  const adsCompliant = ads.filter((a: AdRow) => a.compliance_status === 'compliant').length
  const adsOverdue = ads.filter((a: AdRow) => ['overdue', 'non_compliant'].includes(a.compliance_status ?? '')).length
  const adsUnknown = ads.filter((a: AdRow) => a.compliance_status === 'unknown' || !a.compliance_status).length

  // ── Documents ────────────────────────────────────────────────────────────
  type DocRow = { parsing_status: string | null }
  const { data: docsRaw } = await service
    .from('documents')
    .select('parsing_status')
    .eq('organization_id', orgId)
  const docs: DocRow[] = (docsRaw as DocRow[] | null) ?? []
  const docTotal = docs.length
  const docIndexed = docs.filter((d: DocRow) => d.parsing_status === 'completed').length
  const docProcessing = docs.filter((d: DocRow) => ['queued', 'parsing', 'chunking', 'ocr_processing', 'embedding'].includes(d.parsing_status ?? '')).length
  const docFailed = docs.filter((d: DocRow) => d.parsing_status === 'failed').length
  const docNeedsReview = docs.filter((d: DocRow) => d.parsing_status === 'needs_ocr').length

  // ── Squawks ──────────────────────────────────────────────────────────────
  type SquawkRow = { status: string | null; severity: string | null }
  const { data: squawksRaw } = await service
    .from('squawks')
    .select('status, severity')
    .eq('organization_id', orgId)
    .neq('status', 'resolved')
  const squawks: SquawkRow[] = (squawksRaw as SquawkRow[] | null) ?? []
  const squawksOpen = squawks.length
  const squawksCritical = squawks.filter((s: SquawkRow) => ['critical', 'urgent'].includes((s.severity ?? '').toLowerCase())).length

  // ── Maintenance spend YTD ────────────────────────────────────────────────
  // SUM(work_orders.total_amount) where opened_at within current calendar year.
  type WOAmountRow = { total_amount: number | string | null }
  const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString()
  const { data: ytdRows } = await service
    .from('work_orders')
    .select('total_amount')
    .eq('organization_id', orgId)
    .gte('opened_at', yearStart)
  const ytdCents = ((ytdRows as WOAmountRow[] | null) ?? []).reduce(
    (sum: number, w: WOAmountRow) => sum + Math.round(Number(w.total_amount ?? 0) * 100),
    0,
  )

  // ── 30-day activity timeline ────────────────────────────────────────────
  // Cheap: count thread_messages per day for the last 30 days.
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { data: msgs } = await service
    .from('thread_messages')
    .select('created_at')
    .eq('organization_id', orgId)
    .gte('created_at', since)
  const byDay = new Map<string, number>()
  for (const m of msgs ?? []) {
    const day = (m.created_at ?? '').slice(0, 10)
    if (!day) continue
    byDay.set(day, (byDay.get(day) ?? 0) + 1)
  }
  const timeline = [] as Array<{ date: string; count: number }>
  for (let i = 29; i >= 0; i -= 1) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    timeline.push({ date: key, count: byDay.get(key) ?? 0 })
  }

  return NextResponse.json({
    aircraft: {
      total: aircraftTotal ?? 0,
      with_open_wo: aircraftWithOpenWO,
    },
    work_orders: {
      open: woOpen,
      awaiting_approval: woAwaitingApproval,
      total_open_value_cents: totalOpenValueCents,
      hours_logged: Math.round(hoursLogged * 10) / 10,
    },
    ads: {
      total: ads.length,
      compliant: adsCompliant,
      overdue: adsOverdue,
      unknown: adsUnknown,
    },
    documents: {
      total: docTotal,
      indexed: docIndexed,
      processing: docProcessing,
      failed: docFailed,
      needs_review: docNeedsReview,
    },
    maintenance_spend_ytd_cents: ytdCents,
    squawks: {
      open: squawksOpen,
      critical: squawksCritical,
    },
    timeline_30d: {
      events: timeline.reduce((s, x) => s + x.count, 0),
      by_day: timeline,
    },
  })
}
