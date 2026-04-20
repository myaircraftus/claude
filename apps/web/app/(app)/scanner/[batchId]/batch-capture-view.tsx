'use client'

import { useState } from 'react'
import { useTenantRouter } from '@/components/shared/tenant-link'
import { Plane, Send, Loader2, CheckCircle2, Clock, Trash2, EyeOff, AlertTriangle, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { CameraCapture } from '../components/camera-capture'

interface Batch {
  id: string
  title: string | null
  notes: string | null
  batch_type: string
  source_mode: string
  status: string
  page_count: number
  aircraft?: { id: string; tail_number: string } | null
  submitted_at: string | null
  created_at: string
}
interface Page {
  id: string
  page_number: number
  capture_quality_score: number | null
  capture_warnings: string[] | null
  capture_classification: string | null
  user_marked_unreadable: boolean
  low_quality_override: boolean
  upload_status: string
  processing_status: string
  original_image_path: string | null
}

interface Props { batch: Batch; initialPages: Page[] }

const STATUS_COLOR: Record<string, string> = {
  capturing: 'bg-blue-50 text-blue-700 border-blue-200',
  submitted: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  uploading: 'bg-sky-50 text-sky-700 border-sky-200',
  assembled: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  processing: 'bg-amber-50 text-amber-700 border-amber-200',
  review: 'bg-orange-50 text-orange-700 border-orange-200',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  failed: 'bg-red-50 text-red-700 border-red-200',
  abandoned: 'bg-slate-50 text-slate-500 border-slate-200',
}

const CLASSIFICATIONS = [
  { value: 'unknown', label: '— unknown —' },
  { value: 'logbook_entry', label: 'Logbook entry' },
  { value: 'work_order', label: 'Work order' },
  { value: 'estimate', label: 'Estimate' },
  { value: 'annual_inspection', label: 'Annual inspection' },
  { value: '50hr_inspection', label: '50-hour inspection' },
  { value: '100hr_inspection', label: '100-hour inspection' },
  { value: 'ad_record', label: 'AD record' },
  { value: 'service_bulletin', label: 'Service bulletin' },
  { value: 'yellow_tag', label: 'Yellow tag' },
  { value: 'form_337', label: 'Form 337' },
  { value: 'form_8130', label: 'Form 8130-3' },
  { value: 'squawk_discrepancy', label: 'Squawk / discrepancy' },
  { value: 'discrepancy_sheet', label: 'Discrepancy sheet' },
  { value: 'invoice', label: 'Invoice / receipt' },
  { value: 'weight_balance', label: 'Weight & balance' },
  { value: 'poh_afm_supplement', label: 'POH / AFM / supplement' },
  { value: 'part_trace_conformity', label: 'Part trace / 8130 / conformity' },
  { value: 'photo_evidence', label: 'Photo evidence' },
  { value: 'stc_reference', label: 'STC / reference' },
  { value: 'informational', label: 'Informational' },
]

export function BatchCaptureView({ batch, initialPages }: Props) {
  const router = useTenantRouter()
  const [pages, setPages] = useState<Page[]>(initialPages)
  const [submitBusy, setSubmitBusy] = useState(false)
  const [status, setStatus] = useState(batch.status)
  const [error, setError] = useState<string | null>(null)
  const [pageBusy, setPageBusy] = useState<Record<string, boolean>>({})
  const [carryForwardClassification, setCarryForwardClassification] = useState(true)

  const capturing = status === 'capturing'

  async function handleSubmit() {
    if (!capturing || pages.length === 0) return
    setSubmitBusy(true); setError(null)
    try {
      const resp = await fetch(`/api/scanner/batches/${batch.id}/submit`, { method: 'POST' })
      const j = await resp.json()
      if (!resp.ok) throw new Error(j.error ?? 'Submit failed')
      setStatus('submitted')
      router.refresh()
    } catch (err: any) {
      setError(err?.message ?? 'Submit failed')
    } finally {
      setSubmitBusy(false)
    }
  }

  async function updatePage(pageId: string, patch: Partial<Pick<Page, 'capture_classification' | 'user_marked_unreadable' | 'low_quality_override'>>) {
    setPageBusy(prev => ({ ...prev, [pageId]: true }))
    try {
      const resp = await fetch(`/api/scanner/batches/${batch.id}/pages/${pageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const j = await resp.json()
      if (!resp.ok) throw new Error(j.error ?? 'Update failed')
      setPages(prev => prev.map(p => p.id === pageId ? { ...p, ...patch } as Page : p))
    } catch (err: any) {
      setError(err?.message ?? 'Update failed')
    } finally {
      setPageBusy(prev => ({ ...prev, [pageId]: false }))
    }
  }

  async function deletePage(pageId: string) {
    if (!confirm('Delete this page? The captured image will be removed.')) return
    setPageBusy(prev => ({ ...prev, [pageId]: true }))
    try {
      const resp = await fetch(`/api/scanner/batches/${batch.id}/pages/${pageId}`, { method: 'DELETE' })
      const j = await resp.json()
      if (!resp.ok) throw new Error(j.error ?? 'Delete failed')
      setPages(prev => prev.filter(p => p.id !== pageId))
    } catch (err: any) {
      setError(err?.message ?? 'Delete failed')
    } finally {
      setPageBusy(prev => ({ ...prev, [pageId]: false }))
    }
  }

  function handlePageUploaded(p: { id: string; page_number: number; quality_score: number | null; warnings: string[] }) {
    const previousPage = [...pages].sort((a, b) => a.page_number - b.page_number).at(-1)
    const inheritedClassification =
      carryForwardClassification && previousPage?.capture_classification
        ? previousPage.capture_classification
        : 'unknown'

    setPages(prev => [
      ...prev.filter(x => x.page_number !== p.page_number),
      {
        id: p.id,
        page_number: p.page_number,
        capture_quality_score: p.quality_score,
        capture_warnings: p.warnings,
        capture_classification: inheritedClassification,
        user_marked_unreadable: false,
        low_quality_override: false,
        upload_status: 'uploaded',
        processing_status: 'queued',
        original_image_path: null,
      },
    ].sort((a, b) => a.page_number - b.page_number))

    if (inheritedClassification !== 'unknown') {
      void updatePage(p.id, { capture_classification: inheritedClassification })
    }
  }

  const nextPageNumber = pages.length === 0 ? 1 : Math.max(...pages.map(p => p.page_number)) + 1
  const lowQualityCount = pages.filter(p => (p.capture_quality_score ?? 1) < 0.4 && !p.low_quality_override).length
  const unreadableCount = pages.filter(p => p.user_marked_unreadable).length

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-foreground truncate">
              {batch.title ?? `Batch ${batch.id.slice(0, 8)}`}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="capitalize">{batch.batch_type.replace(/_/g, ' ')}</span>
              <span className="text-muted-foreground/50">·</span>
              <span className="capitalize">{batch.source_mode}</span>
              {batch.aircraft && (
                <>
                  <span className="text-muted-foreground/50">·</span>
                  <span className="flex items-center gap-1 font-mono">
                    <Plane className="h-3 w-3" />
                    {batch.aircraft.tail_number}
                  </span>
                </>
              )}
            </div>
          </div>
          <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border flex-shrink-0', STATUS_COLOR[status] ?? STATUS_COLOR.capturing)}>
            {status.replace(/_/g, ' ')}
          </span>
        </div>
      </div>

      {/* Capture */}
      {capturing && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold text-foreground mb-3">Capture pages</h2>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs">
            <label className="flex items-center gap-2 text-muted-foreground">
              <input
                type="checkbox"
                checked={carryForwardClassification}
                onChange={(e) => setCarryForwardClassification(e.target.checked)}
                className="rounded border-border"
              />
              Same as previous page
            </label>
            <span className="text-muted-foreground">
              New captures inherit the last page class to speed up long logbook or manual batches.
            </span>
          </div>
          <CameraCapture batchId={batch.id} initialPageNumber={nextPageNumber} onPageUploaded={handlePageUploaded} />
        </div>
      )}

      {/* Quality warning strip */}
      {capturing && (lowQualityCount > 0 || unreadableCount > 0) && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <div className="space-y-0.5">
            {lowQualityCount > 0 && <p><strong>{lowQualityCount}</strong> page{lowQualityCount !== 1 ? 's' : ''} have low capture quality — consider retaking or tick &ldquo;override&rdquo;.</p>}
            {unreadableCount > 0 && <p><strong>{unreadableCount}</strong> page{unreadableCount !== 1 ? 's' : ''} marked unreadable — downstream will route these to review.</p>}
          </div>
        </div>
      )}

      {/* Page list with inline classification + actions */}
      {pages.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold text-foreground mb-3">Captured pages ({pages.length})</h2>
          <div className="space-y-2">
            {pages.map(p => {
              const quality = p.capture_quality_score == null ? null : Number(p.capture_quality_score)
              const qualityColor =
                quality == null ? 'text-muted-foreground'
                : quality >= 0.65 ? 'text-emerald-600'
                : quality >= 0.4 ? 'text-amber-600'
                : 'text-red-600'
              const busy = pageBusy[p.id] ?? false
              const previousPage = pages.find((candidate) => candidate.page_number === p.page_number - 1)
              const previousClass =
                previousPage?.capture_classification && previousPage.capture_classification !== 'unknown'
                  ? previousPage.capture_classification
                  : null
              return (
                <div key={p.id} className={cn(
                  'flex flex-wrap items-center gap-2 rounded-md border p-2',
                  p.user_marked_unreadable ? 'border-red-200 bg-red-50/50' : 'border-border bg-muted/30',
                )}>
                  <div className="w-8 h-8 rounded bg-background border border-border flex items-center justify-center text-xs font-semibold text-foreground flex-shrink-0">
                    {p.page_number}
                  </div>
                  {quality != null && (
                    <span className={cn('text-[10px] font-medium tabular-nums w-10 flex-shrink-0', qualityColor)}>
                      q {quality.toFixed(2)}
                    </span>
                  )}
                  {p.capture_warnings && p.capture_warnings.length > 0 && (
                    <span className="text-[10px] text-muted-foreground truncate max-w-[100px] flex-shrink-0">{p.capture_warnings.join(', ')}</span>
                  )}
                  {capturing ? (
                    <select
                      value={p.capture_classification ?? 'unknown'}
                      onChange={e => updatePage(p.id, { capture_classification: e.target.value })}
                      disabled={busy}
                      className="h-7 flex-1 min-w-[140px] text-xs px-2 rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      {CLASSIFICATIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  ) : (
                    <span className="text-xs text-muted-foreground flex-1 min-w-[100px] capitalize">
                      {(p.capture_classification ?? 'unknown').replace(/_/g, ' ')}
                    </span>
                  )}
                  {p.processing_status === 'completed' ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0" />
                  ) : (
                    <Clock className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  )}
                  {capturing && (
                    <>
                      <button
                        type="button"
                        onClick={() => previousClass && updatePage(p.id, { capture_classification: previousClass })}
                        disabled={busy || !previousClass}
                        className="h-7 px-2 text-[10px] rounded border border-border bg-background text-muted-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1 flex-shrink-0"
                        title={previousClass ? `Copy ${previousClass.replace(/_/g, ' ')} from previous page` : 'No previous page classification'}
                      >
                        <Copy className="h-3 w-3" />
                        Copy previous
                      </button>
                      <button
                        type="button"
                        onClick={() => updatePage(p.id, { user_marked_unreadable: !p.user_marked_unreadable })}
                        disabled={busy}
                        className={cn(
                          'h-7 px-2 text-[10px] rounded border transition-colors flex items-center gap-1 flex-shrink-0',
                          p.user_marked_unreadable
                            ? 'border-red-300 bg-red-100 text-red-700 hover:bg-red-200'
                            : 'border-border bg-background text-muted-foreground hover:bg-muted'
                        )}
                        title={p.user_marked_unreadable ? 'Unmark unreadable' : 'Mark unreadable'}
                      >
                        <EyeOff className="h-3 w-3" />
                        {p.user_marked_unreadable ? 'Unreadable' : 'Mark'}
                      </button>
                      <button
                        type="button"
                        onClick={() => deletePage(p.id)}
                        disabled={busy}
                        className="h-7 w-7 rounded border border-border bg-background text-muted-foreground hover:bg-red-50 hover:text-red-600 hover:border-red-300 transition-colors flex items-center justify-center flex-shrink-0"
                        title="Delete page"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Submit */}
      {capturing && pages.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Done capturing?</p>
            <p className="text-xs text-muted-foreground">Submit to queue this batch for OCR processing. After submit, pages become read-only.</p>
          </div>
          <Button onClick={handleSubmit} disabled={submitBusy} className="gap-1">
            {submitBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Submit batch
          </Button>
        </div>
      )}

      {!capturing && (
        <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          This batch has been submitted. Processing happens asynchronously — refresh to see updates.
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}
    </div>
  )
}
