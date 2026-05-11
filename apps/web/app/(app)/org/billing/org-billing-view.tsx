'use client'

import { useState } from 'react'
import { Loader2, CreditCard, ExternalLink, Sparkles, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Sub {
  id: string
  status: string
  price_id: string | null
  product_id: string | null
  persona: string | null
  current_period_start: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  trial_end: string | null
}
interface Inv {
  id: string
  status: string
  amount_due: number
  amount_paid: number
  currency: string
  hosted_invoice_url: string | null
  invoice_pdf: string | null
  created_at: string
}

interface Props {
  canManage: boolean
  subscriptions: Sub[]
  invoices: Inv[]
  isMock: boolean
}

const PLAN_TIERS = [
  { id: 'price_owner_monthly_mock',    label: 'Owner — $39/mo',    persona: 'owner'    },
  { id: 'price_mechanic_monthly_mock', label: 'Mechanic — $49/mo', persona: 'shop' },
  { id: 'price_shop_monthly_mock',    label: 'Shop — $199/mo',    persona: 'shop'    },
  { id: 'price_bundle_monthly_mock',  label: 'Bundle — $249/mo', persona: 'bundle' },
]

function fmt$(cents: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100)
}

export function OrgBillingView({ canManage, subscriptions, invoices, isMock }: Props) {
  const [busy, setBusy] = useState<string | null>(null)
  const active = subscriptions.find((s) => s.status === 'active' || s.status === 'trialing')

  async function checkout(price_id: string) {
    setBusy(price_id)
    try {
      const res = await fetch('/api/billing/stub-checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ price_id }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`)
      const url = (json as { url?: string }).url
      if (url) window.location.href = url
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Checkout failed')
    } finally {
      setBusy(null)
    }
  }

  async function portal() {
    setBusy('portal')
    try {
      const res = await fetch('/api/billing/stub-portal', { method: 'POST' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`)
      const url = (json as { url?: string }).url
      if (url) window.location.href = url
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Portal failed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[22px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>Billing</h1>
          <p className="text-[13px] text-muted-foreground mt-1">Subscription + invoices for this org. Self-serve via Stripe Customer Portal.</p>
        </div>
        {isMock && (
          <span className="inline-flex items-center gap-1 text-[10.5px] uppercase tracking-wider px-2 py-0.5 rounded-full border border-amber-200 bg-amber-50 text-amber-800" style={{ fontWeight: 700 }}>
            <Sparkles className="h-3 w-3" /> Mock mode — set STRIPE_SECRET_KEY to enable real checkout
          </span>
        )}
      </div>

      {/* Current subscription */}
      <div className="rounded-2xl border border-border bg-white p-5">
        <div className="flex items-center gap-2 mb-3">
          <CreditCard className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-[14px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>Current plan</h2>
        </div>
        {active ? (
          <div className="space-y-2 text-[13px]">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Status</span>
              <span className="inline-flex items-center text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200" style={{ fontWeight: 700 }}>{active.status}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Price</span>
              <span className="font-mono text-[12px]">{active.price_id ?? '—'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Renews</span>
              <span>{active.current_period_end ? new Date(active.current_period_end).toLocaleDateString() : '—'}</span>
            </div>
            {canManage && (
              <div className="pt-2">
                <Button onClick={() => void portal()} disabled={busy !== null} size="sm">
                  {busy === 'portal' ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5 mr-1" />}
                  Manage subscription
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="text-[12px] text-muted-foreground">
            No active subscription. Pick a plan below to start a {isMock ? 'mock ' : ''}checkout flow.
          </div>
        )}
      </div>

      {/* Plan picker */}
      {canManage && !active && (
        <div className="rounded-2xl border border-border bg-white p-5">
          <h2 className="text-[14px] tracking-tight text-foreground mb-3" style={{ fontWeight: 700 }}>Choose a plan</h2>
          <div className="space-y-2">
            {PLAN_TIERS.map((p) => (
              <div key={p.id} className="flex items-center justify-between border border-border rounded-lg px-3 py-2">
                <div>
                  <div className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>{p.label}</div>
                  <div className="text-[11px] text-muted-foreground capitalize">{p.persona}</div>
                </div>
                <Button onClick={() => void checkout(p.id)} disabled={busy !== null} size="sm">
                  {busy === p.id ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
                  Upgrade
                </Button>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground inline-flex gap-1.5">
            <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
            Real Stripe Price IDs replace the mock IDs once <code className="font-mono">STRIPE_SECRET_KEY</code> is configured.
          </p>
        </div>
      )}

      {/* Invoice history */}
      <div className="rounded-2xl border border-border bg-white overflow-hidden">
        <div className="px-4 py-2 border-b border-border bg-muted/15">
          <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>Invoice history</h3>
        </div>
        {invoices.length === 0 ? (
          <div className="text-center py-10 text-[12px] text-muted-foreground">No invoices yet.</div>
        ) : (
          <table className="w-full text-[12.5px]">
            <tbody className="divide-y divide-border">
              {invoices.map((i) => (
                <tr key={i.id}>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">{new Date(i.created_at).toLocaleDateString()}</td>
                  <td className="px-3 py-2 capitalize">
                    <span className={cn(
                      'inline-flex items-center text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border',
                      i.status === 'paid' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                      i.status === 'open' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                      'bg-rose-50 text-rose-700 border-rose-200',
                    )} style={{ fontWeight: 700 }}>{i.status}</span>
                  </td>
                  <td className="px-3 py-2 tabular-nums">{fmt$(i.amount_due, i.currency)}</td>
                  <td className="px-3 py-2 text-right">
                    {i.hosted_invoice_url && (
                      <a href={i.hosted_invoice_url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-primary hover:underline inline-flex items-center gap-1">
                        View <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
