'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plane, Send, Loader2, CheckCircle2, Clock } from 'lucide-react'
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
  user_marked_unreadable: boolean
  upload_status: string
  processing_status: string
  original_image_path: string | null
}

interface Props { batch: Batch; initialPages: Page[] }

const STATUS_COLOR: Record<string, string> = {
  capturing: 'bg-blue-50 text-blue-700 border-blue-200',
  submitted: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  processing: 'bg-amber-50 text-amber-700 border-amber-200',
  processed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  review_required: 'bg-orange-50 text-orange-700 border-orange-200',
  processing_failed: 'bg-red-50 text-red-700 border-red-200',
  archived: 'bg-slate-50 text-slate-500 border-slate-200',
}

export function BatchCaptureView({ batch, initialPages }: Props) {
  const router = useRouter()
  const [pages, setPages] = useState<Page[]>(initialPages)
  const [submitBusy, setSubmitBusy] = useState(false)
  const [status, setStatus] = useState(batch.status)
  const [error, setError] = useState<string | null>(null)

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

  function handlePageUploaded(p: { id: string; page_number: number; quality_score: number | null; warnings: string[] }) {
    setPages(prev => [
      ...prev.filter(x => x.page_number !== p.page_number),
      {
        id: p.id,
        page_number: p.page_number,
        capture_quality_score: p.quality_score,
        capture_warnings: p.warnings,
        user_marked_unreadable: false,
        upload_status: 'uploaded',
        processing_status: 'queued',
        original_image_path: null,
      },
    ].sort((a, b) => a.page_number - b.page_number))
  }

  const nextPageNumber = pages.length === 0 ? 1 : Math.max(...pages.map(p => p.page_number)) + 1

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
          <CameraCapture batchId={batch.id} initialPageNumber={nextPageNumber} onPageUploaded={handlePageUploaded} />
        </div>
      )}

      {/* Page list */}
      {pages.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold text-foreground mb-3">Captured pages ({pages.length})</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {pages.map(p => (
              <div key={p.id} className="rounded-md border border-border bg-muted/40 p-2 flex items-center gap-2">
                <div className="w-8 h-8 rounded bg-background border border-border flex items-center justify-center text-xs font-semibold text-foreground">
                  {p.page_number}
                </div>
                <div className="flex-1 min-w-0">
                  {p.capture_quality_score != null && (
                    <p className={cn('text-[10px] font-medium', p.capture_quality_score >= 0.65 ? 'text-emerald-600' : p.capture_quality_score >= 0.4 ? 'text-amber-600' : 'text-red-600')}>
                      q {Number(p.capture_quality_score).toFixed(2)}
                    </p>
                  )}
                  {p.capture_warnings && p.capture_warnings.length > 0 && (
                    <p className="text-[10px] text-muted-foreground truncate">{p.capture_warnings.join(', ')}</p>
                  )}
                </div>
                {p.processing_status === 'processed' ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Submit */}
      {capturing && pages.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Done capturing?</p>
            <p className="text-xs text-muted-foreground">Submit to queue this batch for OCR processing.</p>
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
