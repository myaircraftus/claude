'use client'

/** Sub-navigation shared by the 4 Aircraft Intelligence module pages. */
import Link from '@/components/shared/tenant-link'
import { History, ClipboardCheck, ShieldCheck, AlertTriangle, ArrowLeft } from 'lucide-react'
import type { IntelligenceModule } from '@/lib/intelligence/types'

const MODULES: Array<{ key: IntelligenceModule; label: string; icon: typeof History }> = [
  { key: 'history', label: 'Full History', icon: History },
  { key: 'prebuy', label: 'Prebuy Report', icon: ClipboardCheck },
  { key: 'ad-traceability', label: 'AD / SB Traceability', icon: ShieldCheck },
  { key: 'missing-records', label: 'Missing Records', icon: AlertTriangle },
]

export function IntelligenceModuleNav({
  aircraftId,
  active,
}: {
  aircraftId: string
  active: IntelligenceModule
}) {
  return (
    <div className="flex items-center gap-1 flex-wrap border-b border-border bg-white px-6 py-2 shrink-0">
      <Link
        href={`/aircraft/${aircraftId}/intelligence`}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
        style={{ fontWeight: 500 }}
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Intelligence
      </Link>
      <span className="text-border">|</span>
      {MODULES.map((m) => {
        const Icon = m.icon
        const isActive = m.key === active
        return (
          <Link
            key={m.key}
            href={`/aircraft/${aircraftId}/intelligence/${m.key}`}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] transition-colors ${
              isActive
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
            }`}
            style={{ fontWeight: isActive ? 600 : 500 }}
          >
            <Icon className="h-3.5 w-3.5" />
            {m.label}
          </Link>
        )
      })}
    </div>
  )
}
