'use client'

import { useState } from 'react'
import { Loader2, Link2, RefreshCw, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface State {
  realm_id: string | null
  connected_at: string | null
  disconnected_at: string | null
  last_sync_at: string | null
  last_sync_status: string | null
  last_error: string | null
}
interface InvoiceMapping {
  id: string
  local_invoice_id: string
  qbo_invoice_id: string
  sync_status: string
  pushed_at: string
  last_error: string | null
}
interface PaymentMapping {
  id: string
  local_invoice_id: string | null
  qbo_payment_id: string
  amount_cents: number
  payment_date: string | null
  match_confidence: number
  review_status: string
}

interface Props {
  canManage: boolean
  state: State | null
  invoiceMappings: InvoiceMapping[]
  paymentMappings: PaymentMapping[]
  isMock: boolean
}

export function QboIntegrationView({ canManage, state, invoiceMappings, paymentMappings, isMock }: Props) {
  const [busy, setBusy] = useState<string | null>(null)
  const connected = !!state?.connected_at && !state.disconnected_at

  async function pullPayments() {
    setBusy('pull')
    try {
      const res = await fetch('/api/integrations/qbo/sync', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'pull_payments' }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`)
      toast.success(`Pulled ${(json as { payments_seen?: number }).payments_seen ?? 0} payments — ${(json as { matched?: number }).matched ?? 0} auto-matched`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Pull failed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[22px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>QuickBooks Online</h1>
          <p className="text-[13px] text-muted-foreground mt-1">One-way invoice push (Spec 3.3) + auto-payment-reconciliation (Spec 5.7).</p>
        </div>
        {isMock && (
          <span className="inline-flex items-center gap-1 text-[10.5px] uppercase tracking-wider px-2 py-0.5 rounded-full border border-amber-200 bg-amber-50 text-amber-800" style={{ fontWeight: 700 }}>
            <Sparkles className="h-3 w-3" /> Mock — set QBO_CLIENT_ID + QBO_CLIENT_SECRET
          </span>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-white p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-[14px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>Connection</h2>
            <p className="text-[11.5px] text-muted-foreground mt-0.5">
              {connected ? `Connected to realm ${state!.realm_id} since ${new Date(state!.connected_at!).toLocaleString()}` : 'Not connected.'}
            </p>
            {state?.last_error && <p className="text-[11px] text-rose-700 mt-1 inline-flex gap-1"><AlertCircle className="h-3 w-3 mt-0.5" /> {state.last_error}</p>}
          </div>
          {canManage && (
            connected ? (
              <Button onClick={() => void pullPayments()} disabled={busy !== null} size="sm">
                {busy === 'pull' ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
                Pull payments
              </Button>
            ) : (
              <a href="/api/integrations/qbo/connect">
                <Button size="sm">
                  <Link2 className="h-3.5 w-3.5 mr-1" /> Connect QuickBooks
                </Button>
              </a>
            )
          )}
        </div>
        {state?.last_sync_at && (
          <div className="mt-3 text-[11px] text-muted-foreground inline-flex items-center gap-1.5">
            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
            Last sync: {new Date(state.last_sync_at).toLocaleString()} · {state.last_sync_status}
          </div>
        )}
      </div>

      {invoiceMappings.length > 0 && (
        <Card title="Invoice push history (3.3)">
          <table className="w-full text-[12.5px]">
            <tbody className="divide-y divide-border">
              {invoiceMappings.map((m) => (
                <tr key={m.id}>
                  <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{new Date(m.pushed_at).toLocaleDateString()}</td>
                  <td className="px-3 py-1.5 font-mono">{m.qbo_invoice_id}</td>
                  <td className="px-3 py-1.5 capitalize">{m.sync_status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {paymentMappings.length > 0 && (
        <Card title="Auto-recon payment history (5.7)">
          <table className="w-full text-[12.5px]">
            <tbody className="divide-y divide-border">
              {paymentMappings.map((p) => (
                <tr key={p.id}>
                  <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{p.payment_date ?? '—'}</td>
                  <td className="px-3 py-1.5 tabular-nums">${(p.amount_cents / 100).toFixed(2)}</td>
                  <td className="px-3 py-1.5">{p.local_invoice_id ? <span className="text-emerald-700">matched</span> : <span className="text-amber-700">unmatched</span>}</td>
                  <td className="px-3 py-1.5">
                    <span className={cn('inline-flex items-center text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border',
                      p.review_status === 'auto' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                      p.review_status === 'review' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                      'bg-slate-50 text-slate-700 border-slate-200',
                    )} style={{ fontWeight: 700 }}>{p.review_status}</span>
                  </td>
                  <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{Math.round(p.match_confidence * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-white overflow-hidden">
      <div className="px-4 py-2 border-b border-border bg-muted/15">
        <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>{title}</h3>
      </div>
      {children}
    </div>
  )
}
