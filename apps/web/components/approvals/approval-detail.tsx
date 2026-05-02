'use client'

/**
 * ApprovalDetail (Spec 1.5) — operator-side detail view of one approval
 * request. Self-fetches /api/approval-requests/[id]. Send button POSTs
 * to /send and reveals the public URL. Per-line response display is
 * read-only on the operator side — customer is the source of truth.
 */

import { useCallback, useEffect, useState } from 'react'
import {
  Loader2, Mailbox, Send, Copy, Check, ExternalLink, Hourglass, X,
} from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { toast } from 'sonner'
import Link from '@/components/shared/tenant-link'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type {
  ApprovalRequest, ApprovalRequestStatus, ApprovalLineItem, ApprovalLineResponse, OrgRole,
} from '@/types'

const READ_ONLY_ROLES = new Set<OrgRole>(['viewer', 'auditor', 'pilot'])

const STATUS_TINT: Record<ApprovalRequestStatus, string> = {
  draft:                'bg-slate-100 text-slate-600 border-slate-200',
  sent:                 'bg-blue-50 text-blue-700 border-blue-200',
  'partially-responded': 'bg-amber-50 text-amber-700 border-amber-200',
  completed:            'bg-emerald-50 text-emerald-700 border-emerald-200',
  expired:              'bg-rose-50 text-rose-700 border-rose-200',
}

const STATUS_LABEL: Record<ApprovalRequestStatus, string> = {
  draft: 'Draft',
  sent:  'Sent — awaiting customer',
  'partially-responded': 'Partially responded',
  completed: 'Completed',
  expired:   'Expired',
}

const RESPONSE_TINT: Record<ApprovalLineResponse, string> = {
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  denied:   'bg-rose-50 text-rose-700 border-rose-200',
  deferred: 'bg-amber-50 text-amber-700 border-amber-200',
}

const RESPONSE_ICON: Record<ApprovalLineResponse, any> = {
  approved: Check,
  denied:   X,
  deferred: Hourglass,
}

interface DetailData {
  request: ApprovalRequest & { line_items: ApprovalLineItem[] }
}

export function ApprovalDetail({
  requestId,
  userRole,
}: {
  requestId: string
  userRole: OrgRole
}) {
  const canMutate = !READ_ONLY_ROLES.has(userRole)
  const [data, setData] = useState<DetailData | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [publicUrl, setPublicUrl] = useState<string>('')
  const [copied, setCopied] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/approval-requests/${requestId}`, { cache: 'no-store' })
      if (!res.ok) return
      const payload = await res.json()
      setData(payload as DetailData)
      // If already sent, derive public URL from token so the operator can
      // re-share without firing another /send.
      const token = payload?.request?.public_token
      if (token) {
        const origin = window.location.origin
        setPublicUrl(`${origin}/approve/${token}`)
      }
    } finally {
      setLoading(false)
    }
  }, [requestId])

  useEffect(() => { refresh() }, [refresh])

  async function handleSend() {
    setSending(true)
    try {
      const res = await fetch(`/api/approval-requests/${requestId}/send`, { method: 'POST' })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(out?.error || 'Send failed')
        return
      }
      if (out?.public_url) setPublicUrl(out.public_url)
      toast.success('Approval marked sent')
      refresh()
    } finally {
      setSending(false)
    }
  }

  async function handleCopy() {
    if (!publicUrl) return
    try {
      await navigator.clipboard.writeText(publicUrl)
      setCopied(true)
      toast.success('Link copied')
      setTimeout(() => setCopied(false), 1800)
    } catch {
      toast.error('Could not copy link')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    )
  }
  if (!data) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center">
        <p className="text-[12.5px] text-muted-foreground">Approval not found.</p>
      </div>
    )
  }

  const r = data.request
  const items = r.line_items
  const totalEstimate = items.reduce((s, i) => s + Number(i.estimated_cost ?? 0), 0)
  const answeredCount = items.filter((i) => i.customer_response).length

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-border p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Mailbox className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-[16px] text-foreground" style={{ fontWeight: 700 }}>
                {r.subject || '(no subject)'}
              </h2>
              <span className={cn('inline-flex items-center text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border', STATUS_TINT[r.status])} style={{ fontWeight: 700 }}>
                {STATUS_LABEL[r.status]}
              </span>
            </div>
            <div className="mt-1 text-[12px] text-muted-foreground">
              {answeredCount} / {items.length} answered ·
              {' '}<span className="font-mono">${totalEstimate.toFixed(2)}</span> total estimate
              {r.sent_date && <> · sent {r.sent_date.slice(0, 10)}</>}
              {r.responded_date && <> · first response {r.responded_date.slice(0, 10)}</>}
              {r.expires_at && <> · expires {r.expires_at.slice(0, 10)}</>}
            </div>
            {r.message && (
              <p className="mt-2 text-[12.5px] text-muted-foreground whitespace-pre-line">
                {r.message}
              </p>
            )}
          </div>
          {canMutate && r.status === 'draft' && (
            <Button onClick={handleSend} disabled={sending}>
              {sending ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : <Send className="h-3 w-3 mr-1.5" />}
              Send to customer
            </Button>
          )}
        </div>

        {publicUrl && r.status !== 'draft' && (
          <div className="mt-3 rounded-xl border border-border bg-muted/30 p-3 flex items-center gap-2 flex-wrap">
            <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />
            <code className="text-[11.5px] text-foreground font-mono flex-1 min-w-0 truncate">
              {publicUrl}
            </code>
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] border border-border bg-white hover:bg-muted text-foreground"
              style={{ fontWeight: 500 }}
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? 'Copied' : 'Copy link'}
            </button>
            <Link
              href={`/approve/${r.public_token}`}
              target="_blank"
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] border border-border bg-white hover:bg-muted text-foreground"
              style={{ fontWeight: 500 }}
            >
              <ExternalLink className="h-3 w-3" />
              Preview
            </Link>
          </div>
        )}
      </div>

      {/* Line items */}
      <ul className="space-y-2">
        <AnimatePresence>
          {items.map((it) => {
            const ResponseIcon = it.customer_response ? RESPONSE_ICON[it.customer_response] : null
            const tint = it.customer_response ? RESPONSE_TINT[it.customer_response] : 'bg-muted/40 text-muted-foreground border-border'
            return (
              <motion.li
                key={it.id}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className={cn('bg-white rounded-2xl border border-border p-4')}
              >
                <div className="flex items-start gap-3">
                  <div className={cn('w-9 h-9 rounded-xl border flex items-center justify-center shrink-0', tint)}>
                    {ResponseIcon ? <ResponseIcon className="h-4 w-4" /> : <Hourglass className="h-4 w-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] text-foreground" style={{ fontWeight: 500 }}>{it.description}</p>
                    <div className="mt-1 flex items-center gap-3 flex-wrap text-[11.5px] text-muted-foreground">
                      <span><span className="font-mono">${Number(it.estimated_cost).toFixed(2)}</span> total</span>
                      <span>· {Number(it.labor_hours).toFixed(1)} hrs labor</span>
                      <span>· <span className="font-mono">${Number(it.parts_cost).toFixed(2)}</span> parts</span>
                      {it.customer_response && (
                        <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[10px] uppercase tracking-wider', RESPONSE_TINT[it.customer_response])} style={{ fontWeight: 700 }}>
                          {it.customer_response}
                        </span>
                      )}
                    </div>
                    {it.customer_comment && (
                      <p className="mt-1.5 text-[12px] text-muted-foreground italic">
                        &ldquo;{it.customer_comment}&rdquo;
                      </p>
                    )}
                    {it.responded_at && (
                      <p className="mt-1 text-[10.5px] text-muted-foreground/70">
                        Responded {new Date(it.responded_at).toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
              </motion.li>
            )
          })}
        </AnimatePresence>
      </ul>
    </div>
  )
}
