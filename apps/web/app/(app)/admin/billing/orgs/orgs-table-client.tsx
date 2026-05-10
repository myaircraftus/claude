'use client'

/**
 * Phase 14 Sprint 14.5 — admin orgs table.
 *
 * Editable per-row tier select + billing-disabled toggle. Each change
 * POSTs to /api/admin/billing/orgs/change-tier and refreshes.
 */
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TIER_SLUGS, type TierSlug } from '@/lib/billing/pricing-config'

interface Row {
  id: string
  name: string
  tier: TierSlug
  tier_billing_disabled: boolean
  tier_effective_from: string | null
  aircraft_count: number
  monthly_price_usd: number
}

export function OrgsTable({ initialRows }: { initialRows: Row[] }) {
  const [rows, setRows] = useState<Row[]>(initialRows)
  const [busy, setBusy] = useState<string | null>(null)
  const [filter, setFilter] = useState<TierSlug | 'all'>('all')
  const [error, setError] = useState<string | null>(null)

  async function changeTier(orgId: string, newTier: TierSlug, setBillingDisabled?: boolean) {
    setBusy(orgId)
    setError(null)
    try {
      const res = await fetch('/api/admin/billing/orgs/change-tier', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orgId, newTier, setBillingDisabled }),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        setError(`Change failed: ${e.error ?? res.status}`)
        return
      }
      // refresh row locally
      setRows((prev) =>
        prev.map((r) =>
          r.id === orgId
            ? {
                ...r,
                tier: newTier,
                tier_billing_disabled:
                  setBillingDisabled !== undefined ? setBillingDisabled : r.tier_billing_disabled,
                monthly_price_usd:
                  setBillingDisabled || (setBillingDisabled === undefined && r.tier_billing_disabled)
                    ? 0
                    : monthlyPriceFor(newTier, r.aircraft_count),
              }
            : r,
        ),
      )
    } finally {
      setBusy(null)
    }
  }

  const visible = rows.filter((r) => (filter === 'all' ? true : r.tier === filter))
  const totalRevenue = rows
    .filter((r) => !r.tier_billing_disabled)
    .reduce((sum, r) => sum + r.monthly_price_usd, 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant={filter === 'all' ? 'default' : 'outline'}
          onClick={() => setFilter('all')}
        >
          All ({rows.length})
        </Button>
        {TIER_SLUGS.map((t) => {
          const n = rows.filter((r) => r.tier === t).length
          return (
            <Button
              key={t}
              size="sm"
              variant={filter === t ? 'default' : 'outline'}
              onClick={() => setFilter(t)}
            >
              {t[0].toUpperCase()}{t.slice(1)} ({n})
            </Button>
          )
        })}
        <div className="ml-auto text-sm font-semibold">
          Active monthly revenue: ${totalRevenue.toLocaleString()}
        </div>
      </div>

      {error && (
        <div className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Organization</th>
              <th className="px-3 py-2 text-left font-medium">Tier</th>
              <th className="px-3 py-2 text-left font-medium">Aircraft</th>
              <th className="px-3 py-2 text-right font-medium">Monthly</th>
              <th className="px-3 py-2 text-left font-medium">Billing kill-switch</th>
              <th className="px-3 py-2 text-left font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                  No orgs match this filter.
                </td>
              </tr>
            )}
            {visible.map((r) => (
              <tr key={r.id} className="border-b">
                <td className="px-3 py-2">
                  <div className="font-medium">{r.name}</div>
                  <div className="text-xs text-muted-foreground font-mono">
                    {r.id.slice(0, 8)}…
                  </div>
                </td>
                <td className="px-3 py-2">
                  <Badge>{r.tier}</Badge>
                </td>
                <td className="px-3 py-2">{r.aircraft_count}</td>
                <td className="px-3 py-2 text-right font-mono">
                  ${r.monthly_price_usd.toLocaleString()}
                </td>
                <td className="px-3 py-2">
                  {r.tier_billing_disabled ? (
                    <Badge variant="secondary">DISABLED (free)</Badge>
                  ) : (
                    <Badge variant="default">ENABLED (charging)</Badge>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {TIER_SLUGS.filter((t) => t !== r.tier).map((t) => (
                      <Button
                        key={t}
                        size="sm"
                        variant="outline"
                        onClick={() => changeTier(r.id, t)}
                        disabled={busy === r.id}
                      >
                        → {t}
                      </Button>
                    ))}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        changeTier(r.id, r.tier, !r.tier_billing_disabled)
                      }
                      disabled={busy === r.id}
                    >
                      {r.tier_billing_disabled ? 'Enable billing' : 'Disable billing'}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Local copy of the calculation so the row update doesn't require a roundtrip
function monthlyPriceFor(tier: TierSlug, aircraftCount: number): number {
  if (tier === 'beta' || aircraftCount <= 0) return 0
  // Hardcoded for the local fast path — the authoritative calc is on the server.
  const brackets: Record<Exclude<TierSlug, 'beta'>, Array<[number, number | null, number]>> = {
    standard: [[1, 5, 99], [6, 15, 79], [16, null, 59]],
    pro: [[1, 5, 149], [6, 15, 129], [16, null, 109]],
  }
  for (const [min, max, rate] of brackets[tier as Exclude<TierSlug, 'beta'>]) {
    const inLower = aircraftCount >= min
    const inUpper = max === null || aircraftCount <= max
    if (inLower && inUpper) return rate * aircraftCount
  }
  return 0
}
