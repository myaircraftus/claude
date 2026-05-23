'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Check, X, Plane } from 'lucide-react'

interface Delta {
  user_id: string
  aircraft_id: string
  tail_number: string
  current_hours: number | null
  scraped_hours: number
  system: string
}
interface Proposal {
  user_id: string
  tail_number: string
  make: string | null
  model: string | null
  year: number | null
  scraped_hours: number | null
  system: string
}
interface ReviewState {
  latest_run: { id: string; completed_at: string } | null
  deltas: Delta[]
  proposed_new_aircraft: Proposal[]
}

export function TachReviewClient() {
  const [state, setState] = useState<ReviewState | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  const refresh = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/tach-review')
    if (res.ok) setState(await res.json())
    setLoading(false)
  }, [])
  useEffect(() => {
    void refresh()
  }, [refresh])

  async function applyDelta(d: Delta) {
    setBusy(`delta:${d.aircraft_id}`)
    const res = await fetch('/api/admin/tach-review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apply_delta: { aircraft_id: d.aircraft_id, scraped_hours: d.scraped_hours },
      }),
    })
    setBusy(null)
    if (res.ok) {
      toast.success(`Updated ${d.tail_number} to ${d.scraped_hours}h`)
      setDismissed((prev) => new Set(prev).add(`delta:${d.aircraft_id}`))
    } else {
      toast.error('Failed to apply delta')
    }
  }
  async function applyProposal(p: Proposal, organization_id: string) {
    setBusy(`prop:${p.tail_number}`)
    const res = await fetch('/api/admin/tach-review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apply_proposal: {
          tail_number: p.tail_number,
          make: p.make,
          model: p.model,
          year: p.year,
          organization_id,
          scraped_hours: p.scraped_hours,
        },
      }),
    })
    setBusy(null)
    if (res.ok) {
      toast.success(`Added ${p.tail_number}`)
      setDismissed((prev) => new Set(prev).add(`prop:${p.tail_number}`))
    } else {
      toast.error('Failed to add aircraft')
    }
  }

  if (loading || !state) {
    return (
      <div className="py-16 text-center text-muted-foreground">
        <Loader2 className="w-4 h-4 mx-auto animate-spin" />
      </div>
    )
  }

  const visibleDeltas = state.deltas.filter(
    (d) => !dismissed.has(`delta:${d.aircraft_id}`),
  )
  const visibleProposals = state.proposed_new_aircraft.filter(
    (p) => !dismissed.has(`prop:${p.tail_number}`),
  )

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl tracking-tight font-bold">Tach-time review</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            data-sync.tach-time-scraper compares vendor-reported tach hours against
            ours. Approve a delta to update <code>aircraft.total_time_hours</code>; dismiss
            to skip until next sync.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded-md border border-border bg-white px-3 py-1.5 text-xs hover:bg-muted"
        >
          Refresh
        </button>
      </div>

      {!state.latest_run ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-900 p-4 text-sm">
          No tach-time review recommendations yet. The scraper runs daily at 06:00 UTC; you
          can also trigger it manually from <a className="underline" href="/admin/agents">/admin/agents</a>.
        </div>
      ) : (
        <div className="rounded-md border border-border bg-white px-3 py-2 text-xs text-muted-foreground">
          Latest run: {new Date(state.latest_run.completed_at).toLocaleString()} ·{' '}
          {state.deltas.length} delta{state.deltas.length === 1 ? '' : 's'} ·{' '}
          {state.proposed_new_aircraft.length} proposed new aircraft
        </div>
      )}

      {/* Deltas */}
      <section className="rounded-lg border border-border bg-white">
        <header className="px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold">
            Tach deltas ({visibleDeltas.length} pending)
          </h2>
        </header>
        {visibleDeltas.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">
            No pending deltas. All approved or none reported by the scraper.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {visibleDeltas.map((d) => {
              const diff =
                d.current_hours == null ? null : d.scraped_hours - Number(d.current_hours)
              return (
                <li key={`${d.aircraft_id}:${d.scraped_hours}`} className="px-4 py-3 flex items-center gap-4">
                  <Plane className="w-4 h-4 text-muted-foreground" />
                  <div className="flex-1">
                    <div className="text-sm font-semibold">{d.tail_number}</div>
                    <div className="text-xs text-muted-foreground">
                      ours: {d.current_hours == null ? '(unset)' : `${d.current_hours}h`} → vendor:{' '}
                      {d.scraped_hours}h
                      {diff != null && (
                        <span
                          className={
                            diff > 0
                              ? 'ml-2 text-emerald-700'
                              : diff < 0
                                ? 'ml-2 text-rose-700'
                                : 'ml-2'
                          }
                        >
                          {diff > 0 ? '+' : ''}
                          {diff.toFixed(1)}h
                        </span>
                      )}
                      <span className="ml-2 font-mono text-[10px]">({d.system})</span>
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => applyDelta(d)}
                      disabled={busy === `delta:${d.aircraft_id}`}
                      className="inline-flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md px-2.5 py-1 text-[11px] font-semibold disabled:opacity-50"
                    >
                      {busy === `delta:${d.aircraft_id}` ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Check className="w-3 h-3" />
                      )}
                      Apply
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setDismissed((p) => new Set(p).add(`delta:${d.aircraft_id}`))
                      }
                      className="inline-flex items-center gap-1 border border-border bg-white rounded-md px-2.5 py-1 text-[11px] hover:bg-muted"
                    >
                      <X className="w-3 h-3" /> Skip
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* Proposals */}
      <section className="rounded-lg border border-border bg-white">
        <header className="px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold">
            Proposed new aircraft ({visibleProposals.length} pending)
          </h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Vendor lists an aircraft we don't have. Approve to insert it (you'll fill in
            organization on the form).
          </p>
        </header>
        {visibleProposals.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">
            None proposed.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {visibleProposals.map((p) => (
              <ProposalRow
                key={`${p.tail_number}:${p.system}`}
                proposal={p}
                busy={busy === `prop:${p.tail_number}`}
                onApply={(orgId) => applyProposal(p, orgId)}
                onSkip={() =>
                  setDismissed((prev) => new Set(prev).add(`prop:${p.tail_number}`))
                }
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function ProposalRow({
  proposal,
  busy,
  onApply,
  onSkip,
}: {
  proposal: Proposal
  busy: boolean
  onApply: (orgId: string) => void
  onSkip: () => void
}) {
  const [orgId, setOrgId] = useState<string>('')
  return (
    <li className="px-4 py-3 flex items-center gap-4">
      <Plane className="w-4 h-4 text-muted-foreground" />
      <div className="flex-1">
        <div className="text-sm font-semibold">{proposal.tail_number}</div>
        <div className="text-xs text-muted-foreground">
          {[proposal.year, proposal.make, proposal.model].filter(Boolean).join(' · ') ||
            'unknown make/model'}
          {proposal.scraped_hours != null && (
            <span className="ml-2">· {proposal.scraped_hours}h</span>
          )}
          <span className="ml-2 font-mono text-[10px]">({proposal.system})</span>
        </div>
      </div>
      <input
        value={orgId}
        onChange={(e) => setOrgId(e.target.value)}
        placeholder="organization_id (uuid)"
        className="text-[11px] font-mono border border-border rounded px-2 py-1 w-[180px]"
      />
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => orgId && onApply(orgId)}
          disabled={busy || !orgId}
          className="inline-flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md px-2.5 py-1 text-[11px] font-semibold disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
          Add
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="inline-flex items-center gap-1 border border-border bg-white rounded-md px-2.5 py-1 text-[11px] hover:bg-muted"
        >
          <X className="w-3 h-3" /> Skip
        </button>
      </div>
    </li>
  )
}
