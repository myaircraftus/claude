// Owner Economics dashboard — one card per aircraft showing dry/wet
// cost-per-hour and monthly estimate from the saved operating-cost
// profile (aircraft_operating_costs), plus actual month-to-date spend
// from cost_entries.
import { redirect } from 'next/navigation'
import Link from '@/components/shared/tenant-link'
import { Plane, TrendingUp, DollarSign, Upload, ArrowRight, Settings2, Sparkles } from 'lucide-react'
import { requireAppServerSession } from '@/lib/auth/server-app'
import { requirePersona } from '@/lib/persona/route-guard'
import { Topbar } from '@/components/shared/topbar'
import { computeOperatingCost, usd0, usd2, type OperatingCostInputs } from '@/lib/economics/operating-cost'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Economics' }

export default async function EconomicsDashboardPage() {
  const guard = await requirePersona(['owner', 'admin'])
  if (!guard.allowed) redirect(guard.redirectTo!)

  const { supabase, profile, membership } = await requireAppServerSession()
  const orgId = membership.organization_id

  // Month-to-date window for actual spend.
  const monthStart = new Date()
  monthStart.setUTCDate(1)
  const monthStartStr = monthStart.toISOString().slice(0, 10)

  const [aircraftRes, opCostRes, costEntriesRes] = await Promise.all([
    supabase
      .from('aircraft')
      .select('id, tail_number, make, model, year')
      .eq('organization_id', orgId)
      .eq('is_archived', false)
      .order('tail_number', { ascending: true }),
    supabase
      .from('aircraft_operating_costs')
      .select('*')
      .eq('organization_id', orgId),
    supabase
      .from('cost_entries')
      .select('aircraft_id, amount')
      .eq('organization_id', orgId)
      .eq('approved', true)
      .gte('cost_date', monthStartStr),
  ])

  const aircraft = (aircraftRes.data ?? []) as Array<{
    id: string
    tail_number: string
    make: string | null
    model: string | null
    year: number | null
  }>

  const opCostByAircraft = new Map<string, OperatingCostInputs & { ai_confidence?: string | null }>()
  for (const row of (opCostRes.data ?? []) as any[]) {
    opCostByAircraft.set(row.aircraft_id, row)
  }

  // Actual MTD spend per aircraft (cost_entries with an aircraft attribution).
  const mtdByAircraft = new Map<string, number>()
  for (const row of (costEntriesRes.data ?? []) as Array<{ aircraft_id: string | null; amount: number | string | null }>) {
    if (!row.aircraft_id) continue
    const amt = Number(row.amount)
    if (!Number.isFinite(amt)) continue
    mtdByAircraft.set(row.aircraft_id, (mtdByAircraft.get(row.aircraft_id) ?? 0) + amt)
  }

  // Per-aircraft computed economics.
  const cards = aircraft.map((ac) => {
    const opCost = opCostByAircraft.get(ac.id) ?? null
    const calc = opCost ? computeOperatingCost(opCost) : null
    return {
      ...ac,
      opCost,
      calc,
      mtd: mtdByAircraft.get(ac.id) ?? 0,
      aiConfidence: (opCost?.ai_confidence as string | null | undefined) ?? null,
    }
  })

  const withCost = cards.filter((c) => c.calc)
  const totalMonthlyEst = withCost.reduce((s, c) => s + (c.calc?.monthlyEst ?? 0), 0)
  const totalMtd = cards.reduce((s, c) => s + c.mtd, 0)
  const avgCostHr =
    withCost.length > 0
      ? withCost.reduce((s, c) => s + (c.calc?.wetCostPerHr ?? 0), 0) / withCost.length
      : 0

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar profile={profile} breadcrumbs={[{ label: 'Economics' }]} />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto p-6 space-y-5">
          {/* Header */}
          <div className="flex items-end justify-between gap-3 flex-wrap">
            <div>
              <h1 className="text-[22px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>
                Economics
              </h1>
              <p className="text-[12.5px] text-muted-foreground mt-0.5">
                Per-aircraft operating cost vs. actual month-to-date spend.
              </p>
            </div>
            <Link
              href="/economics/upload-cost"
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 transition-colors"
              style={{ fontWeight: 600 }}
            >
              <Upload className="h-4 w-4" />
              Upload Cost Document
            </Link>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SummaryCard icon={<Plane className="h-4 w-4 text-blue-700" />} bg="bg-blue-50" label="Total aircraft" value={String(aircraft.length)} />
            <SummaryCard icon={<TrendingUp className="h-4 w-4 text-amber-700" />} bg="bg-amber-50" label="Total monthly est." value={usd0(totalMonthlyEst)} />
            <SummaryCard icon={<DollarSign className="h-4 w-4 text-emerald-700" />} bg="bg-emerald-50" label="Actual spend MTD" value={usd0(totalMtd)} />
            <SummaryCard icon={<TrendingUp className="h-4 w-4 text-violet-700" />} bg="bg-violet-50" label="Avg cost / hr" value={usd2(avgCostHr)} />
          </div>

          {/* Aircraft grid */}
          {aircraft.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-2">
              <p className="text-sm font-medium text-foreground">No aircraft yet</p>
              <p className="text-xs text-muted-foreground">Economics appear here once an aircraft is added.</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {cards.map((c) => (
                <div key={c.id} className="rounded-2xl border border-border bg-white p-4 flex flex-col">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                      <Plane className="h-4 w-4 text-blue-700" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[14px] text-foreground truncate" style={{ fontWeight: 700 }}>
                        {c.tail_number}
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {[c.make, c.model, c.year].filter(Boolean).join(' · ') || 'Aircraft'}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex-1">
                    {c.calc ? (
                      <div className="space-y-1.5">
                        <Row label="Cost / hr (dry)" value={usd2(c.calc.dryCostPerHr)} />
                        <Row label="Cost / hr (wet)" value={usd2(c.calc.wetCostPerHr)} strong />
                        <Row label="Monthly est." value={usd0(c.calc.monthlyEst)} />
                        <Row label="Actual MTD" value={usd0(c.mtd)} muted />
                        {c.aiConfidence && (
                          <div className="pt-1">
                            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                              <Sparkles className="h-2.5 w-2.5" />
                              AI-estimated ({c.aiConfidence})
                            </span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-4 text-center">
                        <p className="text-[12px] text-muted-foreground">No operating cost set</p>
                      </div>
                    )}
                  </div>

                  <Link
                    href={`/economics/operating-cost?aircraft=${encodeURIComponent(c.id)}`}
                    className="mt-3 inline-flex items-center justify-center gap-1.5 h-9 rounded-md border border-border text-[13px] text-foreground hover:bg-muted/50 transition-colors"
                    style={{ fontWeight: 600 }}
                  >
                    {c.calc ? (
                      <>
                        <Settings2 className="h-3.5 w-3.5" />
                        Edit Economics
                      </>
                    ) : (
                      <>
                        <Settings2 className="h-3.5 w-3.5" />
                        Set Up
                      </>
                    )}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

function SummaryCard({
  icon, bg, label, value,
}: {
  icon: React.ReactNode
  bg: string
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-3 p-4 rounded-xl border border-border bg-white">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${bg}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-[18px] text-foreground leading-none tabular-nums" style={{ fontWeight: 700 }}>{value}</p>
        <p className="text-[11px] text-muted-foreground mt-1">{label}</p>
      </div>
    </div>
  )
}

function Row({
  label, value, strong, muted,
}: {
  label: string
  value: string
  strong?: boolean
  muted?: boolean
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11.5px] text-muted-foreground">{label}</span>
      <span
        className={`tabular-nums ${muted ? 'text-muted-foreground' : 'text-foreground'} ${strong ? 'text-[15px]' : 'text-[12.5px]'}`}
        style={{ fontWeight: strong ? 700 : 600 }}
      >
        {value}
      </span>
    </div>
  )
}
