'use client'

import dynamic from 'next/dynamic'
import Link from '@/components/shared/tenant-link'
import { ArrowLeft, Download, ExternalLink, Plane } from 'lucide-react'
import { Loader2 } from 'lucide-react'
import { DocumentViewerBoundary } from '@/components/ask/document-viewer-boundary'
import type { AnswerCitation } from '@/types'

const DocumentViewer = dynamic(
  () => import('@/components/ask/document-viewer').then((m) => m.DocumentViewer),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading viewer…
      </div>
    ),
  },
)

interface Props {
  documentId: string
  title: string
  docType: string | null
  pageCount: number | null
  aircraftId: string | null
  citation: AnswerCitation | null
}

export function DocumentViewerPage({
  documentId,
  title,
  docType,
  pageCount,
  aircraftId,
  citation,
}: Props) {
  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 p-4 border-b border-border bg-white">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/documents"
            className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Documents
          </Link>
          <span className="text-muted-foreground/40">/</span>
          <h1
            className="text-[14px] text-foreground truncate"
            style={{ fontWeight: 600 }}
            title={title}
          >
            {title}
          </h1>
          {docType && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground" style={{ fontWeight: 600 }}>
              {docType}
            </span>
          )}
          {pageCount && (
            <span className="text-[11px] text-muted-foreground">
              {pageCount} pages
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {aircraftId && (
            <Link
              href={`/aircraft/${aircraftId}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] border border-border rounded-lg hover:border-primary hover:bg-primary/5 transition-colors"
              style={{ fontWeight: 500 }}
            >
              <Plane className="w-3.5 h-3.5 text-primary" /> Open aircraft
            </Link>
          )}
          <a
            href={`/api/documents/${documentId}/preview?download=1`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] border border-border rounded-lg hover:border-primary hover:bg-primary/5 transition-colors"
            style={{ fontWeight: 500 }}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Download className="w-3.5 h-3.5" /> Download
          </a>
          <a
            href={`/api/documents/${documentId}/preview`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Raw PDF
          </a>
        </div>
      </div>

      {/* Citation context strip */}
      {citation && citation.snippet && (
        <div className="px-4 py-2 border-b border-border bg-amber-50/40">
          <div className="text-[11px] text-amber-900/70 uppercase tracking-wide mb-0.5" style={{ fontWeight: 600 }}>
            Cited passage · page {citation.pageNumber}
          </div>
          <p className="text-[12px] text-foreground/80 italic line-clamp-2">
            &ldquo;{citation.snippet}&rdquo;
          </p>
        </div>
      )}

      {/* Viewer */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <DocumentViewerBoundary
          resetKey={`${documentId}:${citation?.chunkId ?? 'page'}:${citation?.pageNumber ?? 1}`}
        >
          <DocumentViewer
            citation={citation}
            documentId={documentId}
          />
        </DocumentViewerBoundary>
      </div>
    </div>
  )
}
