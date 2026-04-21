'use client'

import { useState } from 'react'
import Link from '@/components/shared/tenant-link'
import { toast } from 'sonner'
import { AlertTriangle, Loader2, RefreshCw, ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export interface StuckDocument {
  id: string
  title: string
  parsing_status: string
  org_name: string
  parse_error: string | null
  parse_started_at: string | null
  updated_at: string
}

interface Props {
  documents: StuckDocument[]
}

function timeAgo(iso: string | null): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function statusBadgeVariant(status: string): 'danger' | 'warning' | 'info' | 'secondary' {
  if (status === 'failed') return 'danger'
  if (status === 'queued' || status === 'needs_ocr') return 'warning'
  if (['parsing', 'ocr_processing', 'chunking', 'embedding'].includes(status)) return 'info'
  return 'secondary'
}

export function StuckDocumentsCard({ documents: initialDocuments }: Props) {
  const [documents, setDocuments] = useState<StuckDocument[]>(initialDocuments)
  const [bulkRetrying, setBulkRetrying] = useState(false)
  const [individualRetrying, setIndividualRetrying] = useState<Set<string>>(new Set())

  const retryOne = async (doc: StuckDocument, force: boolean): Promise<boolean> => {
    try {
      const res = await fetch(`/api/documents/${doc.id}/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(force ? { force: true } : {}),
      })
      if (!res.ok) {
        let msg = `HTTP ${res.status}`
        try {
          const body = (await res.json()) as { error?: string }
          if (body?.error) msg = body.error
        } catch {}
        throw new Error(msg)
      }
      return true
    } catch (err) {
      console.error(`[retry ${doc.id}]`, err)
      return false
    }
  }

  const handleRetryOne = async (doc: StuckDocument) => {
    setIndividualRetrying((prev) => {
      const next = new Set(prev)
      next.add(doc.id)
      return next
    })
    const inProgress = ['parsing', 'ocr_processing', 'chunking', 'embedding'].includes(
      doc.parsing_status
    )
    const ok = await retryOne(doc, inProgress)
    setIndividualRetrying((prev) => {
      const next = new Set(prev)
      next.delete(doc.id)
      return next
    })
    if (ok) {
      toast.success(`Re-queued "${doc.title.slice(0, 60)}"`)
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id))
    } else {
      toast.error(`Failed to retry "${doc.title.slice(0, 60)}"`)
    }
  }

  const handleBulkRetry = async () => {
    if (documents.length === 0) return
    setBulkRetrying(true)
    let successCount = 0
    let failCount = 0
    const failedIds: string[] = []

    // Process sequentially to avoid hammering the ingestion pipeline.
    for (const doc of documents) {
      const inProgress = ['parsing', 'ocr_processing', 'chunking', 'embedding'].includes(
        doc.parsing_status
      )
      const ok = await retryOne(doc, inProgress)
      if (ok) {
        successCount += 1
      } else {
        failCount += 1
        failedIds.push(doc.id)
      }
    }

    setBulkRetrying(false)
    setDocuments((prev) => prev.filter((d) => failedIds.includes(d.id)))

    if (failCount === 0) {
      toast.success(`Re-queued ${successCount} document${successCount !== 1 ? 's' : ''}`)
    } else if (successCount === 0) {
      toast.error(`Failed to retry any documents (${failCount} error${failCount !== 1 ? 's' : ''})`)
    } else {
      toast.warning(
        `Re-queued ${successCount}, ${failCount} failed. The failures are still listed — click Retry to try again.`
      )
    }
  }

  if (documents.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Stuck Documents</CardTitle>
          <p className="text-sm text-muted-foreground">
            Documents queued &gt; 5 min, failed, or stalled in parsing.
          </p>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No stuck documents — pipeline is healthy.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Stuck Documents
              <Badge variant="warning">{documents.length}</Badge>
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Queued &gt; 5 min, failed, needs_ocr, or stalled &gt; 15 min in parsing.
            </p>
          </div>
          <Button
            size="sm"
            onClick={handleBulkRetry}
            disabled={bulkRetrying || documents.length === 0}
          >
            {bulkRetrying ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Retrying {documents.length}...
              </>
            ) : (
              <>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Retry All Stuck
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-border">
          {documents.map((doc) => {
            const started = doc.parse_started_at ?? doc.updated_at
            const isRetrying = individualRetrying.has(doc.id)
            return (
              <div
                key={doc.id}
                className="px-6 py-3 flex items-start justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      href={`/documents?q=${encodeURIComponent(doc.title)}`}
                      className="text-sm font-medium text-foreground hover:text-primary inline-flex items-center gap-1"
                    >
                      <span className="truncate max-w-[32rem]">{doc.title}</span>
                      <ExternalLink className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                    </Link>
                    <Badge variant={statusBadgeVariant(doc.parsing_status)}>
                      {doc.parsing_status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {doc.org_name}
                    {started && ` · started ${timeAgo(started)}`}
                  </p>
                  {doc.parse_error && (
                    <p className="mt-1 text-xs text-red-700 font-mono bg-red-50 rounded px-2 py-1 break-all">
                      {doc.parse_error.slice(0, 200)}
                      {doc.parse_error.length > 200 ? '…' : ''}
                    </p>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRetryOne(doc)}
                  disabled={isRetrying || bulkRetrying}
                  className="flex-shrink-0"
                >
                  {isRetrying ? (
                    <>
                      <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                      Retrying
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-1.5 h-3 w-3" />
                      Retry
                    </>
                  )}
                </Button>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
