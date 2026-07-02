import { Loader2 } from 'lucide-react'

/**
 * Route-level loading UI for the estimate detail. Without this the list
 * page stayed frozen (no feedback at all) for the entire server
 * render/compile of the segment — the client component's own spinner only
 * appears after navigation completes.
 */
export default function EstimateDetailLoading() {
  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-5xl mx-auto">
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center gap-3 py-10 px-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <div>
            <p className="text-sm font-medium text-foreground">Opening estimate…</p>
            <p className="text-sm text-muted-foreground">Fetching the latest estimate data.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
