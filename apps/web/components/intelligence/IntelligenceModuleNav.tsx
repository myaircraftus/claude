'use client'

/** Compact breadcrumb shared by every Aircraft Intelligence module page. */
import Link from '@/components/shared/tenant-link'
import { ArrowLeft } from 'lucide-react'
import type { IntelligenceModule } from '@/lib/intelligence/types'

const MODULE_LABELS: Record<IntelligenceModule, string> = {
  history: 'Full History Package',
  prebuy: 'Prebuy Report',
  'ad-traceability': 'AD / SB Traceability',
  'missing-records': 'Missing Records Detector',
  'squawk-patterns': 'Recurring Squawk Patterns',
  'maintenance-forecast': 'Maintenance Forecast',
  'market-value': 'Market Value Estimate',
  'lender-summary': 'Lender / Insurance Summary',
  'component-search': 'Component History Search',
  'time-comparison': 'Airframe / Engine / Prop Comparison',
}

export function IntelligenceModuleNav({
  aircraftId,
  active,
}: {
  aircraftId: string
  active: IntelligenceModule
}) {
  return (
    <div className="flex items-center gap-2 border-b border-border bg-white px-6 py-2.5 shrink-0 text-[12px]">
      <Link
        href={`/aircraft/${aircraftId}/intelligence`}
        className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
        style={{ fontWeight: 500 }}
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Aircraft Intelligence
      </Link>
      <span className="text-border">/</span>
      <span className="text-foreground" style={{ fontWeight: 600 }}>
        {MODULE_LABELS[active] ?? active}
      </span>
    </div>
  )
}
