'use client'

/**
 * CustomerApprovalView (Spec 1.5) — public, unauthenticated view.
 *
 * Lives at /approve/[token]. Token is the auth — anyone with the link
 * can view + respond. No login, no app shell.
 *
 * Uses the public API: /api/public/approvals/[token] (GET) and
 * /api/public/approvals/[token]/respond (POST).
 */

import { useCallback, useEffect, useState } from 'react'
import {
  Loader2, Check, X, Hourglass, Send, AlertTriangle, Plane, ShieldCheck,
} from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { MyAircraftLogo } from '@/components/redesign/MyAircraftLogo'
import type { ApprovalLineItem, ApprovalLineResponse } from '@/types'

interface PublicData {
  request: {
    id: string
    status: string
    subject: string | null
    message: string | null
    sent_date: string | null
    expires_at: string | null
    line_items: ApprovalLineItem[]
  }
  organization: { name: string } | null
  aircraft: { tail_number: string; make?: string; model?: string } | null
  customer: { name: string } | null
}

const RESPONSE_LABELS: Record<ApprovalLineResponse, string> = {
  approved: 'Approve',
  denied: 'Deny',
  deferred: 'Defer',
}

const RESPONSE_TINT: Record<ApprovalLineResponse, { active: string; idle: string; icon: any }> = {
  approved: {
    active: 'bg-emerald-500 border-emerald-500 text-white',
    idle:   'bg-white border-border text-foreground hover:bg-emerald-50 hover:border-emerald-200',
    icon: Check,
  },
  denied: {
    active: 'bg-rose-500 border-rose-500 text-white',
    idle:   'bg-white border-border text-foreground hover:bg-rose-50 hover:border-rose-200',
    icon: X,
  },
  deferred: {
    active: 'bg-amber-500 border-amber-500 text-white',
    idle:   'bg-white border-border text-foreground hover:bg-amber-50 hover:border-amber-200',
    icon: Hourglass,
  },
}

export function CustomerApprovalView({ token }: { token: string }) {
  const [data, setData] = useState<PublicData | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [savingItemId, setSavingItemId] = useState<string | null>(null)
  const [comments, setComments] = useState<Record<string, string>>({})

  const refresh = useCallback(async () => {
    setLoading(true)
    setErrorMsg(null)
    try {
      const res = await fetch(`/api/public/approvals/${token}`, { cache: 'no-store' })
      if (!res.ok) {
        const out = await res.json().catch(() => ({}))
        setErrorMsg(out?.error || 'Could not load approval request.')
        return
      }
      const payload = await res.json() as PublicData
      setData(payload)
      // Hydrate comment drafts from existing customer_comment values so
      // a refresh / re-open shows the prior text.
      const draft: Record<string, string> = {}
      for (const li of payload.request.line_items) {
        if (li.customer_comment) draft[li.id] = li.customer_comment
      }
      setComments(draft)
    } catch {
      setErrorMsg('Could not load approval request.')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { refresh() }, [refresh])

  async function respond(lineItemId: string, response: ApprovalLineResponse) {
    setSavingItemId(lineItemId)
    try {
      const res = await fetch(`/api/public/approvals/${token}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          line_item_id: lineItemId,
          response,
          comment: comments[lineItemId] || null,
        }),
      })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(out?.error || 'Could not save response')
        return
      }
      toast.success(`Marked as ${response}`)
      // Optimistic local update
      setData((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          request: {
            ...prev.request,
            line_items: prev.request.line_items.map((li) =>
              li.id === lineItemId
                ? {
                    ...li,
                    customer_response: response,
                    customer_comment: comments[lineItemId] || null,
                    responded_at: new Date().toISOString(),
                  }
                : li,
            ),
          },
        }
      })
    } finally {
      setSavingItemId(null)
    }
  }

  if (loading) {
    return (
      <ShellWrapper>
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      </ShellWrapper>
    )
  }

  if (errorMsg) {
    return (
      <ShellWrapper>
        <div className="bg-white rounded-2xl border border-border p-10 text-center">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center mb-3">
            <AlertTriangle className="h-5 w-5 text-rose-600" />
          </div>
          <h2 className="text-[16px] text-foreground" style={{ fontWeight: 700 }}>
            Can't load this approval
          </h2>
          <p className="text-[12.5px] text-muted-foreground mt-2 max-w-md mx-auto">
            {errorMsg} If your link is expired, ask the shop to send a new one.
          </p>
        </div>
      </ShellWrapper>
    )
  }

  if (!data) return null

  const { request, organization, aircraft, customer } = data
  const items = request.line_items
  const totalEstimate = items.reduce((s, i) => s + Number(i.estimated_cost ?? 0), 0)
  const allAnswered = items.every((i) => i.customer_response)

  return (
    <ShellWrapper>
      {/* Header */}
      <div className="bg-white rounded-2xl border border-border p-6 mb-4">
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          <span className="text-[11px] uppercase tracking-wider text-emerald-700" style={{ fontWeight: 700 }}>
            Approval request
          </span>
        </div>
        <h1 className="text-[20px] text-foreground" style={{ fontWeight: 700 }}>
          {request.subject || '(no subject)'}
        </h1>
        <div className="mt-1 text-[12.5px] text-muted-foreground flex items-center gap-2 flex-wrap">
          {organization?.name && <span>From <span className="text-foreground" style={{ fontWeight: 500 }}>{organization.name}</span></span>}
          {customer?.name && <span>· To {customer.name}</span>}
          {aircraft && (
            <span className="inline-flex items-center gap-1">
              <Plane className="h-3 w-3" />
              {aircraft.tail_number}
              {(aircraft.make || aircraft.model) && (
                <span className="text-muted-foreground/70">
                  ({[aircraft.make, aircraft.model].filter(Boolean).join(' ')})
                </span>
              )}
            </span>
          )}
        </div>
        {request.message && (
          <p className="mt-3 text-[13px] text-foreground/90 whitespace-pre-line border-l-2 border-border pl-3">
            {request.message}
          </p>
        )}
        <div className="mt-3 inline-flex items-center gap-2 text-[12px] text-foreground bg-muted/50 border border-border rounded-full px-3 py-1.5">
          Total estimate <span className="font-mono" style={{ fontWeight: 700 }}>${totalEstimate.toFixed(2)}</span>
        </div>
      </div>

      {/* Line items */}
      <ul className="space-y-3">
        <AnimatePresence>
          {items.map((it) => {
            const saving = savingItemId === it.id
            return (
              <motion.li
                key={it.id}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="bg-white rounded-2xl border border-border p-5"
              >
                <p className="text-[14px] text-foreground" style={{ fontWeight: 500 }}>
                  {it.description}
                </p>
                <div className="mt-1 text-[12px] text-muted-foreground flex items-center gap-3 flex-wrap">
                  <span><span className="font-mono">${Number(it.estimated_cost).toFixed(2)}</span> total</span>
                  <span>· {Number(it.labor_hours).toFixed(1)} hrs labor</span>
                  <span>· <span className="font-mono">${Number(it.parts_cost).toFixed(2)}</span> parts</span>
                </div>

                {/* Comment field — saved on the next response click */}
                <input
                  value={comments[it.id] ?? ''}
                  onChange={(e) => setComments((c) => ({ ...c, [it.id]: e.target.value }))}
                  disabled={saving}
                  placeholder="Add a comment (optional)…"
                  className="mt-3 w-full rounded-lg border border-border bg-white px-3 py-2 text-[13px] outline-none focus:border-primary"
                />

                {/* Response buttons */}
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {(['approved', 'denied', 'deferred'] as ApprovalLineResponse[]).map((r) => {
                    const conf = RESPONSE_TINT[r]
                    const Icon = conf.icon
                    const active = it.customer_response === r
                    return (
                      <button
                        key={r}
                        onClick={() => respond(it.id, r)}
                        disabled={saving}
                        className={cn(
                          'inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-[13px] border transition-colors',
                          active ? conf.active : conf.idle,
                          saving && 'opacity-60 cursor-wait',
                        )}
                        style={{ fontWeight: 600 }}
                      >
                        {saving && active ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
                        {RESPONSE_LABELS[r]}
                      </button>
                    )
                  })}
                </div>

                {it.responded_at && (
                  <p className="mt-2 text-[10.5px] text-muted-foreground/70">
                    Last updated {new Date(it.responded_at).toLocaleString()}
                  </p>
                )}
              </motion.li>
            )
          })}
        </AnimatePresence>
      </ul>

      {/* Done banner */}
      {allAnswered && items.length > 0 && (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 flex items-center gap-3">
          <Send className="h-4 w-4 text-emerald-700" />
          <div className="flex-1">
            <p className="text-[13px] text-emerald-900" style={{ fontWeight: 600 }}>
              All set — {organization?.name || 'the shop'} has been notified of your responses.
            </p>
            <p className="text-[11.5px] text-emerald-800/80 mt-0.5">
              You can change a response by clicking a different button. They'll be re-notified.
            </p>
          </div>
        </div>
      )}
    </ShellWrapper>
  )
}

function ShellWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b border-border bg-white">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <MyAircraftLogo height={20} />
          <span className="text-[11px] text-muted-foreground" style={{ fontWeight: 500 }}>
            Customer approval portal
          </span>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        {children}
      </main>
      <footer className="max-w-3xl mx-auto px-6 py-6 text-center text-[11px] text-muted-foreground">
        Secured by myaircraft.us
      </footer>
    </div>
  )
}
