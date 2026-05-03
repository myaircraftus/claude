'use client'

/**
 * IntakeView (Spec 7.2) — operator's receipt inbox.
 *
 * Two surfaces:
 *   1. Drop zone (POST /api/costs/upload) for receipt PDFs/images
 *   2. Queue list of intake_documents — non-terminal first; ?status=
 *      filter to drill into specific states
 *
 * 7.3 will replace the "Awaiting extraction" empty-state with real
 * extracted cost_entries; this sprint just shows status='received'.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Upload, Mail, Loader2, FileText, ImageIcon, AlertCircle, CheckCircle2, X, Search,
  RotateCw, Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { IntakeDocument, IntakeStatus } from '@/types'

const STATUS_TONE: Record<IntakeStatus, string> = {
  received:   'bg-blue-50 text-blue-700 border-blue-200',
  extracting: 'bg-amber-50 text-amber-700 border-amber-200',
  extracted:  'bg-emerald-50 text-emerald-700 border-emerald-200',
  review:     'bg-amber-50 text-amber-700 border-amber-200',
  posted:     'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected:   'bg-rose-50 text-rose-700 border-rose-200',
}

type Tab = 'pending' | 'received' | 'review' | 'posted' | 'rejected'

const TAB_STATUS: Record<Tab, IntakeStatus | null> = {
  pending:  null, // default = non-terminal
  received: 'received',
  review:   'review',
  posted:   'posted',
  rejected: 'rejected',
}

export function IntakeView({ orgId }: { orgId: string }) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('pending')
  const [items, setItems] = useState<IntakeDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [searchQ, setSearchQ] = useState('')
  const [retrying, setRetrying] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      const s = TAB_STATUS[tab]
      if (s) params.set('status', s)
      const res = await fetch(`/api/costs/intake?${params.toString()}`)
      if (!res.ok) return
      const data = await res.json()
      setItems((data.intake ?? []) as IntakeDocument[])
    } finally {
      setLoading(false)
    }
  }, [tab])

  useEffect(() => { void reload() }, [reload])

  async function handleFiles(files: FileList | File[]) {
    if (!files || (files as FileList).length === 0) return
    setUploading(true)
    let okCount = 0
    let failCount = 0
    for (const file of Array.from(files)) {
      const fd = new FormData()
      fd.append('file', file)
      try {
        const res = await fetch('/api/costs/upload', { method: 'POST', body: fd })
        if (res.ok) okCount++
        else {
          const err = await res.json().catch(() => ({}))
          toast.error(`${file.name}: ${err?.error ?? `HTTP ${res.status}`}`)
          failCount++
        }
      } catch (e) {
        toast.error(`${file.name}: upload failed`)
        failCount++
      }
    }
    setUploading(false)
    if (okCount > 0) toast.success(`${okCount} receipt${okCount === 1 ? '' : 's'} uploaded`)
    if (failCount === 0) await reload()
    else if (okCount > 0) await reload()
  }

  async function runExtraction(id: string) {
    setRetrying(id)
    try {
      const res = await fetch(`/api/costs/intake/${id}/extract`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success(`Extraction queued${data.cost_entries_created ? ` — ${data.cost_entries_created} line items` : ''}`)
      } else {
        toast.error(data?.error ?? `HTTP ${res.status}`)
      }
      await reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Extraction failed')
    } finally {
      setRetrying(null)
    }
  }

  const filtered = items.filter((it) => {
    const q = searchQ.trim().toLowerCase()
    if (!q) return true
    return (
      it.filename.toLowerCase().includes(q) ||
      (it.email_from ?? '').toLowerCase().includes(q) ||
      (it.email_subject ?? '').toLowerCase().includes(q)
    )
  })

  const TABS: Array<{ id: Tab; label: string }> = [
    { id: 'pending',  label: 'Pending' },
    { id: 'received', label: 'Received' },
    { id: 'review',   label: 'In review' },
    { id: 'posted',   label: 'Posted' },
    { id: 'rejected', label: 'Rejected' },
  ]

  // Email-to-cost forwarding address: <orgId>@bills.aircraft.us
  const forwardAddress = `${orgId}@bills.aircraft.us`

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="px-6 py-4 border-b border-border bg-white shrink-0 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>
            Cost intake
          </h1>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            Drop receipts here or forward bills via email. Claude Vision extracts vendor, totals, and line items automatically. Click any row to review.
          </p>
        </div>
        <Button onClick={() => inputRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
          Upload receipts
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="application/pdf,image/jpeg,image/png,image/webp,image/heic"
          className="hidden"
          onChange={(e) => { if (e.target.files) void handleFiles(e.target.files); e.target.value = '' }}
        />
      </div>

      <div className="px-6 py-4 max-w-6xl mx-auto w-full space-y-4">
        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            if (e.dataTransfer.files?.length) void handleFiles(e.dataTransfer.files)
          }}
          className={cn(
            'rounded-2xl border-2 border-dashed p-8 text-center transition-colors cursor-pointer',
            dragOver ? 'border-primary bg-primary/5' : 'border-border bg-muted/20 hover:bg-muted/30',
          )}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
          <p className="text-[14px] text-foreground" style={{ fontWeight: 600 }}>
            {dragOver ? 'Drop to upload' : 'Drop receipts here, or click to browse'}
          </p>
          <p className="text-[11.5px] text-muted-foreground mt-1">
            PDF, JPEG, PNG, WebP, HEIC · 10 MB max per file
          </p>
        </div>

        {/* Email-forward card */}
        <div className="rounded-2xl border border-border bg-white p-5 flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
            <Mail className="h-5 w-5 text-amber-700" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>Forward bills by email</div>
            <p className="text-[11.5px] text-muted-foreground mt-1">
              Send any vendor invoice or fuel receipt to the address below. Attachments
              automatically arrive in this queue.
            </p>
            <div className="mt-2 inline-flex items-center gap-2 bg-muted/50 border border-border rounded-md px-2 py-1.5">
              <code className="font-mono text-[12px] text-foreground select-all">{forwardAddress}</code>
              <button
                type="button"
                onClick={() => { void navigator.clipboard.writeText(forwardAddress); toast.success('Copied') }}
                className="text-[10.5px] text-primary hover:underline"
                style={{ fontWeight: 600 }}
              >
                Copy
              </button>
            </div>
            <p className="text-[10.5px] text-muted-foreground/80 mt-1.5">
              Configured via SendGrid Inbound Parse → /api/costs/email-webhook (server-only).
            </p>
          </div>
        </div>
      </div>

      {/* Queue */}
      <div className="px-6 pt-3 pb-3 border-t border-border bg-white shrink-0 flex items-center justify-between gap-3 flex-wrap">
        <div className="inline-flex gap-1 bg-muted/40 rounded-lg p-1">
          {TABS.map((t) => {
            const active = tab === t.id
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'px-3 py-1.5 rounded-md text-[12px] transition-colors',
                  active ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                )}
                style={{ fontWeight: active ? 600 : 500 }}
              >
                {t.label}
              </button>
            )
          })}
        </div>
        <div className="flex items-center gap-2 bg-muted/40 border border-border rounded-lg px-3 py-1.5 max-w-md flex-1">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="Filename, email sender, subject…"
            className="bg-transparent text-[12px] outline-none flex-1 placeholder:text-muted-foreground/50"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="text-center py-20 text-[12px] text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" />Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <div className="mx-auto w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mb-3">
              <FileText className="w-5 h-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">Queue is empty</p>
            <p className="text-xs text-muted-foreground mt-1">Upload a receipt or forward a bill to populate.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-border overflow-hidden max-w-6xl mx-auto m-6">
            <table className="w-full text-[12.5px]">
              <thead className="bg-muted/30 border-b border-border">
                <tr>
                  {['Source', 'Filename / Subject', 'From', 'Received', 'Status', ''].map((h, i) => (
                    <th key={i} className="text-left px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((it) => {
                  const isStuck = it.status === 'received' || it.status === 'extracting'
                  const isRetrying = retrying === it.id
                  return (
                    <tr
                      key={it.id}
                      onClick={() => router.push(`/costs/intake/${it.id}`)}
                      className="hover:bg-muted/20 cursor-pointer"
                    >
                      <td className="px-3 py-2 capitalize">
                        {it.source === 'email' ? <Mail className="inline h-3 w-3 mr-1 text-amber-700" /> :
                         it.mime_type?.startsWith('image/') ? <ImageIcon className="inline h-3 w-3 mr-1 text-blue-700" /> :
                         <FileText className="inline h-3 w-3 mr-1 text-slate-600" />}
                        {it.source}
                      </td>
                      <td className="px-3 py-2">
                        <div className="text-foreground" style={{ fontWeight: 600 }}>
                          {it.email_subject ?? it.filename}
                        </div>
                        {it.source === 'email' && (
                          <div className="text-[10.5px] text-muted-foreground">{it.filename}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground truncate max-w-[20ch]">
                        {it.email_from ?? '—'}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">
                        {new Date(it.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </td>
                      <td className="px-3 py-2">
                        <span className={cn(
                          'inline-flex items-center text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border',
                          STATUS_TONE[it.status],
                        )} style={{ fontWeight: 700 }}>
                          {it.status === 'rejected' && <X className="h-2.5 w-2.5 mr-0.5" />}
                          {it.status === 'posted' && <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />}
                          {it.status === 'extracting' && <Loader2 className="h-2.5 w-2.5 mr-0.5 animate-spin" />}
                          {it.status === 'extracted' && <Sparkles className="h-2.5 w-2.5 mr-0.5" />}
                          {it.status === 'received' && <AlertCircle className="h-2.5 w-2.5 mr-0.5" />}
                          {it.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                        {isStuck && (
                          <button
                            type="button"
                            onClick={() => void runExtraction(it.id)}
                            disabled={isRetrying}
                            className="inline-flex items-center gap-1 text-[10.5px] text-primary hover:underline disabled:opacity-50"
                            style={{ fontWeight: 600 }}
                            title="Retry Claude Vision extraction"
                          >
                            {isRetrying ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCw className="h-3 w-3" />}
                            {isRetrying ? 'Running' : 'Run extraction'}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
