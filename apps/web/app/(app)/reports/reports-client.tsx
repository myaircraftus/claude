'use client'

/**
 * Reports — persona-aware reporting surface (client).
 *
 * Renders a header (title + date-range picker + Export) and a grid of report
 * cards. Each card computes its rows from the pre-fetched arrays, filtered by
 * the date-range picker. "Generate Report" expands the card inline to an HTML
 * table; "Export" downloads the currently-expanded report as CSV.
 *
 * No charting library — plain HTML tables only. All computation is defensive:
 * fields are read with optional chaining + fallbacks so a wrong column guess
 * never crashes, and every card falls back to an empty-state row.
 */

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  FileBarChart,
  Download,
  ChevronDown,
  ChevronRight,
  Wrench,
  Package,
  Users,
  Plane,
  AlertTriangle,
  Receipt,
  DollarSign,
  CalendarClock,
  ClipboardCheck,
  History,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

type Persona = 'owner' | 'shop' | 'admin'
type Row = Record<string, any>

interface ReportTable {
  columns: string[]
  rows: (string | number)[][]
  totals?: (string | number)[]
}

interface ReportCard {
  id: string
  title: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  build: () => ReportTable
}

// ── helpers ────────────────────────────────────────────────────────────────

const NOW = new Date()

function fmtDate(v: any): string {
  if (!v) return '—'
  const d = new Date(v)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function fmtMoney(n: number): string {
  return `$${(Number.isFinite(n) ? n : 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function num(v: any): number {
  const n = typeof v === 'string' ? parseFloat(v) : v
  return Number.isFinite(n) ? Number(n) : 0
}

function daysBetween(a: any, b: any): number | null {
  if (!a || !b) return null
  const da = new Date(a).getTime()
  const db = new Date(b).getTime()
  if (isNaN(da) || isNaN(db)) return null
  return Math.max(0, Math.round((db - da) / 86400000))
}

function inRange(v: any, start: string, end: string): boolean {
  if (!v) return false
  const t = new Date(v).getTime()
  if (isNaN(t)) return false
  const s = new Date(start + 'T00:00:00').getTime()
  const e = new Date(end + 'T23:59:59').getTime()
  return t >= s && t <= e
}

function isoDaysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

function csvEscape(v: string | number): string {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// ── component ──────────────────────────────────────────────────────────────

export function ReportsClient({
  persona,
  workOrders,
  aircraft,
  complianceItems,
  invoices,
  squawks,
  workOrderParts,
  workOrderLines,
  timeEntries,
  operatingCosts,
  logbookEntries,
  userProfiles,
}: {
  persona: Persona
  workOrders: Row[]
  aircraft: Row[]
  complianceItems: Row[]
  invoices: Row[]
  squawks: Row[]
  workOrderParts: Row[]
  workOrderLines: Row[]
  timeEntries: Row[]
  operatingCosts: Row[]
  logbookEntries: Row[]
  userProfiles: Row[]
}) {
  const [startDate, setStartDate] = useState(isoDaysAgo(90))
  const [endDate, setEndDate] = useState(isoDaysAgo(0))
  const [expanded, setExpanded] = useState<string | null>(null)

  // Lookup maps.
  const aircraftById = useMemo(() => {
    const m = new Map<string, Row>()
    for (const a of aircraft) if (a?.id) m.set(a.id, a)
    return m
  }, [aircraft])

  const userById = useMemo(() => {
    const m = new Map<string, Row>()
    for (const u of userProfiles) if (u?.id) m.set(u.id, u)
    return m
  }, [userProfiles])

  const tail = (aircraftId: any): string => {
    const a = aircraftId ? aircraftById.get(aircraftId) : null
    return a?.tail_number ?? a?.registration ?? '—'
  }
  const acLabel = (aircraftId: any): string => {
    const a = aircraftId ? aircraftById.get(aircraftId) : null
    if (!a) return '—'
    const t = a.tail_number ?? a.registration ?? '—'
    const mm = [a.make, a.model].filter(Boolean).join(' ')
    return mm ? `${t} (${mm})` : t
  }
  const userName = (uid: any): string => {
    const u = uid ? userById.get(uid) : null
    return u?.full_name ?? u?.email ?? (uid ? 'Unknown' : 'Unassigned')
  }

  // ── SHOP report builders ───────────────────────────────────────────────

  const buildWorkOrderSummary = (): ReportTable => {
    const wos = workOrders.filter((w) => inRange(w?.created_at ?? w?.opened_at, startDate, endDate))
    const byStatus = new Map<string, { count: number; revenue: number; days: number; closed: number }>()
    for (const w of wos) {
      const status = String(w?.status ?? 'unknown')
      const e = byStatus.get(status) ?? { count: 0, revenue: 0, days: 0, closed: 0 }
      e.count += 1
      e.revenue += num(w?.total_amount)
      const d = daysBetween(w?.opened_at, w?.closed_at)
      if (d != null) {
        e.days += d
        e.closed += 1
      }
      byStatus.set(status, e)
    }
    const rows = Array.from(byStatus.entries()).map(([status, e]) => [
      status,
      e.count,
      fmtMoney(e.revenue),
      e.closed > 0 ? `${(e.days / e.closed).toFixed(1)} days` : '—',
    ])
    const totalCount = wos.length
    const totalRev = wos.reduce((s, w) => s + num(w?.total_amount), 0)
    const closedDurations = wos
      .map((w) => daysBetween(w?.opened_at, w?.closed_at))
      .filter((d): d is number => d != null)
    const avgAll =
      closedDurations.length > 0
        ? `${(closedDurations.reduce((s, d) => s + d, 0) / closedDurations.length).toFixed(1)} days`
        : '—'
    return {
      columns: ['Status', 'Work Orders', 'Revenue', 'Avg Completion'],
      rows,
      totals: ['Total', totalCount, fmtMoney(totalRev), avgAll],
    }
  }

  const buildPartsUsage = (): ReportTable => {
    const woById = new Map(workOrders.map((w) => [w?.id, w]))
    const woInRange = (woId: any) => {
      const w = woId ? woById.get(woId) : null
      return w ? inRange(w?.created_at ?? w?.opened_at, startDate, endDate) : true
    }
    const agg = new Map<string, { qty: number; spend: number }>()
    for (const p of workOrderParts) {
      if (!woInRange(p?.work_order_id)) continue
      const key = String(p?.part_number ?? p?.title ?? 'Unknown part')
      const e = agg.get(key) ?? { qty: 0, spend: 0 }
      e.qty += num(p?.quantity) || 1
      e.spend += num(p?.total_cost) || num(p?.unit_cost) * (num(p?.quantity) || 1)
      agg.set(key, e)
    }
    for (const l of workOrderLines) {
      if (String(l?.line_type ?? '').toLowerCase() !== 'part') continue
      if (!woInRange(l?.work_order_id)) continue
      const key = String(l?.part_number ?? l?.description ?? 'Unknown part')
      const e = agg.get(key) ?? { qty: 0, spend: 0 }
      e.qty += num(l?.quantity) || 1
      e.spend += num(l?.line_total) || num(l?.unit_price) * (num(l?.quantity) || 1)
      agg.set(key, e)
    }
    const rows = Array.from(agg.entries())
      .sort((a, b) => b[1].spend - a[1].spend)
      .slice(0, 50)
      .map(([part, e]) => [part, e.qty, fmtMoney(e.spend)])
    const totalQty = Array.from(agg.values()).reduce((s, e) => s + e.qty, 0)
    const totalSpend = Array.from(agg.values()).reduce((s, e) => s + e.spend, 0)
    return {
      columns: ['Part', 'Qty Used', 'Total Spend'],
      rows,
      totals: ['Total', totalQty, fmtMoney(totalSpend)],
    }
  }

  const buildMechanicProductivity = (): ReportTable => {
    const agg = new Map<string, { hours: number }>()
    for (const t of timeEntries) {
      if (!inRange(t?.start_time, startDate, endDate)) continue
      const tech = String(t?.technician_id ?? 'unassigned')
      const e = agg.get(tech) ?? { hours: 0 }
      if (t?.start_time && t?.end_time) {
        const h = (new Date(t.end_time).getTime() - new Date(t.start_time).getTime()) / 3600000
        if (Number.isFinite(h) && h > 0) e.hours += h
      }
      agg.set(tech, e)
    }
    const woClosed = new Map<string, number>()
    for (const w of workOrders) {
      if (String(w?.status ?? '') !== 'closed') continue
      if (!inRange(w?.closed_at ?? w?.created_at, startDate, endDate)) continue
      const m = String(w?.assigned_mechanic_id ?? 'unassigned')
      woClosed.set(m, (woClosed.get(m) ?? 0) + 1)
    }
    const techs = new Set<string>([...agg.keys(), ...woClosed.keys()])
    const rows = Array.from(techs).map((tech) => [
      userName(tech === 'unassigned' ? null : tech),
      (agg.get(tech)?.hours ?? 0).toFixed(1),
      woClosed.get(tech) ?? 0,
    ])
    const totalHours = Array.from(agg.values()).reduce((s, e) => s + e.hours, 0)
    const totalWo = Array.from(woClosed.values()).reduce((s, c) => s + c, 0)
    return {
      columns: ['Mechanic', 'Hours Logged', 'Work Orders Completed'],
      rows,
      totals: ['Total', totalHours.toFixed(1), totalWo],
    }
  }

  const buildAircraftHistory = (): ReportTable => {
    const agg = new Map<string, { count: number; spend: number }>()
    for (const w of workOrders) {
      if (!inRange(w?.created_at ?? w?.opened_at, startDate, endDate)) continue
      const acId = String(w?.aircraft_id ?? 'none')
      const e = agg.get(acId) ?? { count: 0, spend: 0 }
      e.count += 1
      e.spend += num(w?.total_amount)
      agg.set(acId, e)
    }
    const rows = Array.from(agg.entries())
      .sort((a, b) => b[1].spend - a[1].spend)
      .map(([acId, e]) => [
        acId === 'none' ? '—' : acLabel(acId),
        e.count,
        fmtMoney(e.spend),
      ])
    const totalCount = Array.from(agg.values()).reduce((s, e) => s + e.count, 0)
    const totalSpend = Array.from(agg.values()).reduce((s, e) => s + e.spend, 0)
    return {
      columns: ['Aircraft', 'Work Orders', 'Total Spend'],
      rows,
      totals: ['Total', totalCount, fmtMoney(totalSpend)],
    }
  }

  const buildOverdueCompliance = (): ReportTable => {
    const overdue = complianceItems.filter(
      (c) => String(c?.status ?? '').toLowerCase() === 'overdue',
    )
    const rows = overdue
      .sort((a, b) => new Date(a?.next_due_date ?? 0).getTime() - new Date(b?.next_due_date ?? 0).getTime())
      .map((c) => [
        String(c?.title ?? c?.item_type ?? 'Compliance item'),
        tail(c?.aircraft_id),
        String(c?.source_reference ?? '—'),
        fmtDate(c?.next_due_date),
      ])
    return {
      columns: ['Item', 'Aircraft', 'Source Reference', 'Next Due'],
      rows,
      totals: ['Total Overdue', overdue.length, '', ''],
    }
  }

  const buildInvoiceAging = (): ReportTable => {
    const unpaid = invoices.filter((i) => {
      const status = String(i?.status ?? i?.payment_status ?? '').toLowerCase()
      const balance = num(i?.balance_due ?? (num(i?.total) - num(i?.amount_paid)))
      const paidLike = status === 'paid' || status === 'void' || status === 'voided'
      return !paidLike && balance > 0
    })
    const buckets = {
      '0-30 days': { count: 0, amount: 0 },
      '31-60 days': { count: 0, amount: 0 },
      '61-90 days': { count: 0, amount: 0 },
      '90+ days': { count: 0, amount: 0 },
    }
    for (const i of unpaid) {
      const ref = i?.due_date ?? i?.issue_date ?? i?.created_at
      const age = daysBetween(ref, NOW) ?? 0
      const bal = num(i?.balance_due ?? (num(i?.total) - num(i?.amount_paid)))
      const key =
        age <= 30 ? '0-30 days' : age <= 60 ? '31-60 days' : age <= 90 ? '61-90 days' : '90+ days'
      buckets[key].count += 1
      buckets[key].amount += bal
    }
    const rows = Object.entries(buckets).map(([k, v]) => [k, v.count, fmtMoney(v.amount)])
    const totalCount = unpaid.length
    const totalAmt = Object.values(buckets).reduce((s, v) => s + v.amount, 0)
    return {
      columns: ['Age Bucket', 'Invoices', 'Outstanding'],
      rows,
      totals: ['Total Unpaid', totalCount, fmtMoney(totalAmt)],
    }
  }

  // ── OWNER report builders ──────────────────────────────────────────────

  const buildAircraftCostSummary = (): ReportTable => {
    const costByAircraft = new Map<string, Row>()
    for (const c of operatingCosts) if (c?.aircraft_id) costByAircraft.set(c.aircraft_id, c)
    const actualByAircraft = new Map<string, number>()
    for (const w of workOrders) {
      if (!inRange(w?.created_at ?? w?.opened_at, startDate, endDate)) continue
      const acId = String(w?.aircraft_id ?? 'none')
      actualByAircraft.set(acId, (actualByAircraft.get(acId) ?? 0) + num(w?.total_amount))
    }
    for (const inv of invoices) {
      if (inv?.work_order_id) continue // avoid double-counting WO-linked invoices
      if (!inRange(inv?.created_at ?? inv?.issue_date, startDate, endDate)) continue
      const acId = String(inv?.aircraft_id ?? 'none')
      if (acId === 'none') continue
      actualByAircraft.set(acId, (actualByAircraft.get(acId) ?? 0) + num(inv?.total))
    }
    const ids = new Set<string>([
      ...aircraft.map((a) => String(a?.id)),
      ...actualByAircraft.keys(),
    ])
    let totalEst = 0
    let totalActual = 0
    const rows: (string | number)[][] = []
    for (const acId of ids) {
      if (acId === 'none' || !acId) continue
      const cost = costByAircraft.get(acId)
      // Estimate = scheduled + unscheduled maintenance reserves × expected annual hours.
      const perHr = cost
        ? num(cost.scheduled_maint_per_hr) + num(cost.unscheduled_maint_per_hr)
        : 0
      const hrs = cost ? num(cost.expected_annual_hours) : 0
      const est = perHr * hrs
      const actual = actualByAircraft.get(acId) ?? 0
      totalEst += est
      totalActual += actual
      rows.push([
        acLabel(acId),
        est > 0 ? fmtMoney(est) : '—',
        fmtMoney(actual),
        fmtMoney(actual - est),
      ])
    }
    rows.sort((a, b) => num(String(b[2]).replace(/[$,]/g, '')) - num(String(a[2]).replace(/[$,]/g, '')))
    return {
      columns: ['Aircraft', 'Est. Annual Maint.', 'Actual Spend', 'Variance'],
      rows,
      totals: ['Total', fmtMoney(totalEst), fmtMoney(totalActual), fmtMoney(totalActual - totalEst)],
    }
  }

  const buildMaintenanceHistory = (): ReportTable => {
    const wos = workOrders.filter((w) => inRange(w?.created_at ?? w?.opened_at, startDate, endDate))
    const rows = wos
      .sort(
        (a, b) =>
          new Date(b?.created_at ?? b?.opened_at ?? 0).getTime() -
          new Date(a?.created_at ?? a?.opened_at ?? 0).getTime(),
      )
      .map((w) => [
        String(w?.work_order_number ?? w?.id ?? '—'),
        acLabel(w?.aircraft_id),
        String(w?.status ?? '—'),
        fmtMoney(num(w?.total_amount)),
        fmtDate(w?.opened_at ?? w?.created_at),
      ])
    const total = wos.reduce((s, w) => s + num(w?.total_amount), 0)
    return {
      columns: ['Work Order', 'Aircraft', 'Status', 'Total', 'Date'],
      rows,
      totals: ['Total', wos.length, '', fmtMoney(total), ''],
    }
  }

  const buildUpcomingDueItems = (): ReportTable => {
    const horizon = new Date()
    horizon.setDate(horizon.getDate() + 90)
    const upcoming = complianceItems.filter((c) => {
      const status = String(c?.status ?? '').toLowerCase()
      if (status !== 'due-soon' && status !== 'current') return false
      if (!c?.next_due_date) return false
      const due = new Date(c.next_due_date).getTime()
      if (isNaN(due)) return false
      return due >= NOW.getTime() && due <= horizon.getTime()
    })
    const rows = upcoming
      .sort((a, b) => new Date(a?.next_due_date).getTime() - new Date(b?.next_due_date).getTime())
      .map((c) => {
        const d = daysBetween(NOW, c?.next_due_date)
        return [
          String(c?.title ?? c?.item_type ?? 'Compliance item'),
          tail(c?.aircraft_id),
          String(c?.status ?? '—'),
          fmtDate(c?.next_due_date),
          d != null ? `${d} days` : '—',
        ]
      })
    return {
      columns: ['Item', 'Aircraft', 'Status', 'Next Due', 'In'],
      rows,
      totals: ['Total Due (90d)', upcoming.length, '', '', ''],
    }
  }

  const buildAnnualTimeline = (): ReportTable => {
    const isAnnual = (s: any) => /annual/i.test(String(s ?? ''))
    const fromLogbook = logbookEntries
      .filter((l) => isAnnual(l?.entry_type) || isAnnual(l?.description))
      .map((l) => ({
        date: l?.entry_date ?? l?.created_at,
        aircraft_id: l?.aircraft_id,
        source: 'Logbook Entry',
        detail: String(l?.description ?? l?.entry_type ?? 'Annual inspection'),
      }))
    const fromCompliance = complianceItems
      .filter((c) => isAnnual(c?.title) || isAnnual(c?.item_type))
      .map((c) => ({
        date: c?.last_completed_date ?? c?.next_due_date,
        aircraft_id: c?.aircraft_id,
        source: 'Compliance Item',
        detail: String(c?.title ?? 'Annual Inspection') + ` (${c?.status ?? '—'})`,
      }))
    const all = [...fromLogbook, ...fromCompliance].sort(
      (a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime(),
    )
    const rows = all.map((e) => [fmtDate(e.date), tail(e.aircraft_id), e.source, e.detail])
    return {
      columns: ['Date', 'Aircraft', 'Source', 'Detail'],
      rows,
      totals: ['Total Inspections', all.length, '', ''],
    }
  }

  const buildSquawkHistory = (): ReportTable => {
    const sqs = squawks.filter((s) =>
      inRange(s?.created_at ?? s?.reported_at, startDate, endDate),
    )
    const rows = sqs
      .sort(
        (a, b) =>
          new Date(b?.created_at ?? b?.reported_at ?? 0).getTime() -
          new Date(a?.created_at ?? a?.reported_at ?? 0).getTime(),
      )
      .map((s) => [
        String(s?.title ?? '—'),
        tail(s?.aircraft_id),
        String(s?.severity ?? '—'),
        String(s?.status ?? '—'),
        fmtDate(s?.created_at ?? s?.reported_at),
        s?.resolved_at
          ? fmtDate(s.resolved_at)
          : String(s?.closure_reason ?? s?.closure_notes ?? 'Open'),
      ])
    const resolved = sqs.filter((s) => s?.resolved_at).length
    return {
      columns: ['Squawk', 'Aircraft', 'Severity', 'Status', 'Reported', 'Resolved'],
      rows,
      totals: ['Total', sqs.length, '', `${resolved} resolved`, '', ''],
    }
  }

  // ── card registry ───────────────────────────────────────────────────────

  const cards: ReportCard[] = useMemo(() => {
    if (persona === 'owner') {
      return [
        {
          id: 'aircraft-cost',
          title: 'Aircraft Cost Summary',
          description: 'Estimated annual maintenance cost vs. actual spend per aircraft.',
          icon: DollarSign,
          build: buildAircraftCostSummary,
        },
        {
          id: 'maint-history',
          title: 'Maintenance History',
          description: 'Every work order on your aircraft with status and cost.',
          icon: Wrench,
          build: buildMaintenanceHistory,
        },
        {
          id: 'upcoming-due',
          title: 'Upcoming Due Items',
          description: 'Compliance items coming due in the next 90 days.',
          icon: CalendarClock,
          build: buildUpcomingDueItems,
        },
        {
          id: 'annual-timeline',
          title: 'Annual Inspection Timeline',
          description: 'History of annual inspections across your fleet.',
          icon: ClipboardCheck,
          build: buildAnnualTimeline,
        },
        {
          id: 'squawk-history',
          title: 'Squawk History',
          description: 'All squawks filed, with severity, status, and resolution.',
          icon: AlertTriangle,
          build: buildSquawkHistory,
        },
      ]
    }
    // shop + admin default to the shop report set.
    return [
      {
        id: 'wo-summary',
        title: 'Work Order Summary',
        description: 'Work order counts, revenue, and completion time by status.',
        icon: Wrench,
        build: buildWorkOrderSummary,
      },
      {
        id: 'parts-usage',
        title: 'Parts Usage Report',
        description: 'Top parts consumed and total parts spend.',
        icon: Package,
        build: buildPartsUsage,
      },
      {
        id: 'mechanic-productivity',
        title: 'Mechanic Productivity',
        description: 'Hours logged and work orders completed per mechanic.',
        icon: Users,
        build: buildMechanicProductivity,
      },
      {
        id: 'aircraft-history',
        title: 'Aircraft Maintenance History',
        description: 'Work order count and total spend per aircraft.',
        icon: Plane,
        build: buildAircraftHistory,
      },
      {
        id: 'overdue-compliance',
        title: 'Overdue Compliance Items',
        description: 'Fleet-wide compliance items currently overdue.',
        icon: AlertTriangle,
        build: buildOverdueCompliance,
      },
      {
        id: 'invoice-aging',
        title: 'Invoice Aging Report',
        description: 'Unpaid invoices bucketed by age.',
        icon: Receipt,
        build: buildInvoiceAging,
      },
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persona, startDate, endDate, workOrders, aircraft, complianceItems, invoices, squawks, workOrderParts, workOrderLines, timeEntries, operatingCosts, logbookEntries, userProfiles])

  function handleExport() {
    if (!expanded) {
      toast.info('Open a report first, then Export.')
      return
    }
    const card = cards.find((c) => c.id === expanded)
    if (!card) {
      toast.info('Open a report first, then Export.')
      return
    }
    const table = card.build()
    const lines: string[] = []
    lines.push(table.columns.map(csvEscape).join(','))
    for (const r of table.rows) lines.push(r.map(csvEscape).join(','))
    if (table.totals) lines.push(table.totals.map(csvEscape).join(','))
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${card.id}-${startDate}-to-${endDate}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success(`Exported ${card.title}`)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border bg-white shrink-0 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>
            Reports
          </h1>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            {persona === 'owner'
              ? 'Cost, maintenance, and compliance reporting for your aircraft.'
              : 'Operational and financial reports across the shop.'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={startDate}
              max={endDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-9 px-2.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <span className="text-[12px] text-muted-foreground">to</span>
            <input
              type="date"
              value={endDate}
              min={startDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-9 px-2.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <Button size="sm" variant="outline" onClick={handleExport}>
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Export
          </Button>
        </div>
      </div>

      {/* Cards grid */}
      <div className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {cards.map((card) => (
            <ReportCardView
              key={card.id}
              card={card}
              expanded={expanded === card.id}
              onToggle={() =>
                setExpanded((cur) => (cur === card.id ? null : card.id))
              }
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── card view ──────────────────────────────────────────────────────────────

function ReportCardView({
  card,
  expanded,
  onToggle,
}: {
  card: ReportCard
  expanded: boolean
  onToggle: () => void
}) {
  const Icon = card.icon
  const table = expanded ? card.build() : null

  return (
    <div className="bg-white border border-border rounded-xl overflow-hidden">
      <div className="p-4 flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
          <Icon className="h-4.5 w-4.5 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] text-foreground" style={{ fontWeight: 600 }}>
            {card.title}
          </div>
          <div className="text-[12px] text-muted-foreground mt-0.5">{card.description}</div>
          <div className="text-[10.5px] text-muted-foreground/70 mt-1">
            Last generated {fmtDate(NOW)}
          </div>
        </div>
        <Button size="sm" variant={expanded ? 'secondary' : 'outline'} onClick={onToggle}>
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 mr-1.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 mr-1.5" />
          )}
          {expanded ? 'Hide' : 'Generate Report'}
        </Button>
      </div>

      {expanded && table && (
        <div className="border-t border-border overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b border-border">
              <tr>
                {table.columns.map((h) => (
                  <th
                    key={h}
                    className="text-left px-3 py-2.5 text-[10.5px] uppercase tracking-wider text-muted-foreground"
                    style={{ fontWeight: 600 }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {table.rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={table.columns.length}
                    className="px-3 py-6 text-center text-[12.5px] text-muted-foreground"
                  >
                    No data for this period.
                  </td>
                </tr>
              ) : (
                table.rows.map((row, i) => (
                  <tr key={i} className="hover:bg-muted/20">
                    {row.map((cell, j) => (
                      <td
                        key={j}
                        className="px-3 py-2.5 text-[12.5px] text-foreground tabular-nums"
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
            {table.totals && table.rows.length > 0 && (
              <tfoot className="bg-muted/30 border-t border-border">
                <tr>
                  {table.totals.map((cell, j) => (
                    <td
                      key={j}
                      className="px-3 py-2.5 text-[12px] text-foreground tabular-nums"
                      style={{ fontWeight: 700 }}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  )
}
