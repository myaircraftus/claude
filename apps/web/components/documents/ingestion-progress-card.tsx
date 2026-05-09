'use client'

/**
 * Phase 13.3 — IngestionProgressCard.
 *
 * Subscribes via Supabase realtime to `ingestion_progress` rows for a single
 * document and renders a vertical timeline. Stages:
 *   uploaded → ocr → chunking → text_embedding → vision_render → vision_embedding → indexed
 *
 * On stage='failed', shows the error_message + a "Contact support" CTA.
 * Hides itself 5s after stage='indexed' (completion) unless the parent
 * passes `persistOnComplete`.
 *
 * Realtime: filters by (document_id) — RLS policy limits the user to rows
 * they can already see in their org. Service-role writes don't go through
 * realtime authorization (they're emitted regardless), so the filter on
 * the client side guarantees one user sees only their own doc's rows.
 */
import { useEffect, useMemo, useState } from 'react'
import { createBrowserSupabase } from '@/lib/supabase/browser'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  CheckCircle2,
  Circle,
  Loader2,
  XCircle,
  Eye,
  Brain,
  ScanLine,
  Image as ImageIcon,
  Sparkles,
  FileCheck,
  Upload,
} from 'lucide-react'

export type IngestionStage =
  | 'uploaded'
  | 'ocr'
  | 'chunking'
  | 'text_embedding'
  | 'vision_render'
  | 'vision_embedding'
  | 'indexed'
  | 'failed'

interface IngestionProgressRow {
  id: string
  document_id: string
  organization_id: string
  stage: IngestionStage
  stage_started_at: string
  stage_completed_at: string | null
  error_message: string | null
  metadata: Record<string, unknown>
}

const STAGE_DEFS: Array<{
  id: IngestionStage
  label: string
  icon: typeof Loader2
}> = [
  { id: 'uploaded', label: 'Upload received', icon: Upload },
  { id: 'ocr', label: 'OCR text extraction', icon: ScanLine },
  { id: 'chunking', label: 'Chunking', icon: FileCheck },
  { id: 'text_embedding', label: 'Text embeddings', icon: Brain },
  { id: 'vision_render', label: 'Vision render', icon: ImageIcon },
  { id: 'vision_embedding', label: 'Vision embeddings', icon: Sparkles },
  { id: 'indexed', label: 'Indexed & searchable', icon: CheckCircle2 },
]

export interface IngestionProgressCardProps {
  documentId: string
  organizationId: string
  /** When true, card stays visible even after indexed. */
  persistOnComplete?: boolean
  /** Where to send users when an error needs support — admin sees full err. */
  isAdmin?: boolean
  className?: string
}

export function IngestionProgressCard({
  documentId,
  organizationId,
  persistOnComplete = false,
  isAdmin = false,
  className,
}: IngestionProgressCardProps) {
  const [rows, setRows] = useState<IngestionProgressRow[]>([])
  const [hidden, setHidden] = useState(false)
  const supabase = useMemo(() => createBrowserSupabase(), [])

  // Initial fetch + realtime subscription
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const { data } = await supabase
        .from('ingestion_progress')
        .select('*')
        .eq('document_id', documentId)
        .order('stage_started_at', { ascending: true })
      if (!cancelled && data) {
        setRows(data as IngestionProgressRow[])
      }
    })()

    const channel = supabase
      .channel(`ingestion_progress:${documentId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ingestion_progress',
          filter: `document_id=eq.${documentId}`,
        },
        (payload) => {
          setRows((prev) => {
            if (payload.eventType === 'INSERT') {
              return [...prev, payload.new as IngestionProgressRow]
            }
            if (payload.eventType === 'UPDATE') {
              return prev.map((r) =>
                r.id === (payload.new as IngestionProgressRow).id
                  ? (payload.new as IngestionProgressRow)
                  : r,
              )
            }
            if (payload.eventType === 'DELETE') {
              return prev.filter((r) => r.id !== (payload.old as IngestionProgressRow).id)
            }
            return prev
          })
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
  }, [documentId, supabase])

  // Auto-hide 5s after we see an `indexed` row
  useEffect(() => {
    if (persistOnComplete) return
    const indexed = rows.find((r) => r.stage === 'indexed')
    if (!indexed) return
    const timer = setTimeout(() => setHidden(true), 5_000)
    return () => clearTimeout(timer)
  }, [rows, persistOnComplete])

  if (hidden) return null

  // Compute current stage by latest started row
  const sorted = [...rows].sort((a, b) =>
    a.stage_started_at.localeCompare(b.stage_started_at),
  )
  const failed = sorted.find((r) => r.stage === 'failed')
  const indexed = sorted.find((r) => r.stage === 'indexed')
  const inProgress = sorted.find(
    (r) => r.stage_completed_at === null && r.stage !== 'failed',
  )
  const completedStages = new Set(
    sorted.filter((r) => r.stage_completed_at !== null).map((r) => r.stage),
  )

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          {failed ? (
            <XCircle className="h-4 w-4 text-destructive" />
          ) : indexed ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          ) : (
            <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
          )}
          {failed
            ? 'Ingestion failed'
            : indexed
              ? 'Ingestion complete'
              : 'Ingestion in progress'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="space-y-2">
          {STAGE_DEFS.map((def) => {
            const row = sorted.find((r) => r.stage === def.id)
            const isCurrent = inProgress?.stage === def.id
            const isComplete = completedStages.has(def.id)
            const Icon = def.icon

            const elapsed = row
              ? formatElapsed(row.stage_started_at, row.stage_completed_at)
              : null

            return (
              <li key={def.id} className="flex items-center gap-3 text-sm">
                {isCurrent ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-500" />
                ) : isComplete ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                ) : (
                  <Circle className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                )}
                <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span
                  className={
                    isCurrent
                      ? 'font-medium'
                      : isComplete
                        ? 'text-foreground'
                        : 'text-muted-foreground'
                  }
                >
                  {def.label}
                </span>
                {elapsed && (
                  <span className="ml-auto text-xs text-muted-foreground">
                    {elapsed}
                  </span>
                )}
              </li>
            )
          })}
        </ol>

        {failed && (
          <div className="mt-3 rounded border border-destructive/40 bg-destructive/5 p-2 text-xs">
            <div className="font-medium text-destructive flex items-center gap-1">
              <XCircle className="h-3.5 w-3.5" />
              {isAdmin ? 'Error (admin view)' : 'Something went wrong'}
            </div>
            {isAdmin && failed.error_message && (
              <pre className="mt-1 whitespace-pre-wrap font-mono text-xs">
                {failed.error_message}
              </pre>
            )}
            {!isAdmin && (
              <p className="mt-1 text-muted-foreground">
                We couldn't index this document. Our team has been notified.
              </p>
            )}
            <Button asChild size="sm" variant="link" className="px-0 mt-1">
              <a href="mailto:support@myaircraft.us?subject=Document ingestion failed">
                <Eye className="mr-1 h-3 w-3" /> Contact support
              </a>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function formatElapsed(start: string, end: string | null): string {
  const s = new Date(start).getTime()
  const e = end ? new Date(end).getTime() : Date.now()
  const ms = Math.max(0, e - s)
  if (ms < 1000) return '<1s'
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`
  return `${(ms / 3_600_000).toFixed(1)}h`
}
