'use client'

/**
 * Owner all-aircraft economics dashboard (wired 2026-05-15).
 *
 * Renders one ProfitabilityCard per aircraft over the server-computed
 * 90-day operating-cost breakdown. Revenue is $0 until aircraft gain a
 * rental_rate column (existing 7.x follow-up) — ProfitabilityCard shows
 * the "Set rental rate" empty state, same as /aircraft/[id]/economics.
 * Each card links to the full per-aircraft economics view.
 */

import Link from '@/components/shared/tenant-link'
import { Plane, ArrowRight, TrendingUp } from 'lucide-react'
import { ProfitabilityCard } from '@/components/economics/ProfitabilityCard'

interface AircraftEconomics {
  id: string
  tailNumber: string
  make: string | null
  model: string | null
  costTotal: number
  flightHours: number
  wetCostPerHour: number
  confidence: number
}

export function EconomicsDashboard({ aircraft }: { aircraft: AircraftEconomics[] }) {
  if (aircraft.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2">
        <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center">
          <TrendingUp className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-foreground">No aircraft yet</p>
        <p className="text-xs text-muted-foreground">Economics appear here once an aircraft is added.</p>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-4">
      <div>
        <h1 className="text-[22px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>
          Economics
        </h1>
        <p className="text-[12.5px] text-muted-foreground mt-0.5">
          All-aircraft profitability over the last 90 days. Open any aircraft for the full
          revenue, cost-breakdown, and reserve detail.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {aircraft.map((ac) => (
          <div key={ac.id} className="space-y-2">
            <div className="flex items-center justify-between gap-2 px-1">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                  <Plane className="h-4 w-4 text-blue-700" />
                </div>
                <div className="min-w-0">
                  <div className="text-[14px] text-foreground truncate" style={{ fontWeight: 700 }}>
                    {ac.tailNumber}
                  </div>
                  <div className="text-[11.5px] text-muted-foreground truncate">
                    {[ac.make, ac.model].filter(Boolean).join(' ') || 'Aircraft'}
                  </div>
                </div>
              </div>
              <Link
                href={`/aircraft/${ac.id}/economics`}
                className="inline-flex items-center gap-1 text-[12px] text-primary hover:underline shrink-0"
                style={{ fontWeight: 600 }}
              >
                Full economics
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <ProfitabilityCard
              revenueTotal={0}
              costTotal={ac.costTotal}
              flightHours={ac.flightHours}
              rentalRate={null}
              period="90d"
            />
          </div>
        ))}
      </div>
    </div>
  )
}
