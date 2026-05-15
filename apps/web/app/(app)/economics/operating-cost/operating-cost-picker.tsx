'use client'

/**
 * Aircraft selector for the operating-cost page. Changing the selection
 * navigates to ?aircraft=<id> so the server recomputes the breakdown and
 * re-hydrates EconomicsView for the chosen aircraft.
 */

import { useTenantRouter } from '@/components/shared/tenant-link'

export function OperatingCostPicker({
  aircraft,
  selectedId,
}: {
  aircraft: Array<{ id: string; label: string }>
  selectedId: string
}) {
  const router = useTenantRouter()
  return (
    <label className="inline-flex items-center gap-2 text-[12.5px] text-muted-foreground">
      <span style={{ fontWeight: 600 }}>Aircraft</span>
      <select
        value={selectedId}
        onChange={(e) =>
          router.push(`/economics/operating-cost?aircraft=${encodeURIComponent(e.target.value)}`)
        }
        className="h-9 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      >
        {aircraft.map((a) => (
          <option key={a.id} value={a.id}>
            {a.label}
          </option>
        ))}
      </select>
    </label>
  )
}
