'use client'

import { useEffect, useMemo, useState } from 'react'
import { Download, ExternalLink, FileText, Loader2, X } from 'lucide-react'
import {
  Worker,
  Viewer,
  SpecialZoomLevel,
  type Plugin,
  type PluginRenderPageLayer,
} from '@react-pdf-viewer/core'
import { searchPlugin } from '@react-pdf-viewer/search'
import { Button } from '@/components/ui/button'
import type { AnswerCitation, CitationBoundingRegion } from '@/types'

interface DocumentViewerProps {
  citation: AnswerCitation | null
  documentId?: string
  filePath?: string
  onClose?: () => void
}

function buildPreviewUrl(documentId?: string) {
  if (!documentId) return null
  return `/api/documents/${documentId}/preview`
}

function buildDownloadUrl(documentId?: string) {
  const previewUrl = buildPreviewUrl(documentId)
  if (!previewUrl) return null
  return `${previewUrl}?download=1`
}

function renderBoundingRegions(regions: CitationBoundingRegion[]) {
  if (!regions || regions.length === 0) return null
  return regions.map((region, index) => (
    <div
      key={`${region.page}-${index}`}
      className="absolute rounded-md border-2 border-brand-500 bg-brand-200/30 shadow-[0_0_0_1px_rgba(59,130,246,0.2)]"
      style={{
        left: `${region.x * 100}%`,
        top: `${region.y * 100}%`,
        width: `${region.width * 100}%`,
        height: `${region.height * 100}%`,
      }}
    />
  ))
}

export function DocumentViewer({ citation, documentId, onClose }: DocumentViewerProps) {
  const previewUrl = useMemo(() => buildPreviewUrl(documentId), [documentId])
  const downloadUrl = useMemo(() => buildDownloadUrl(documentId), [documentId])
  const [isLoading, setIsLoading] = useState(true)

  const activePage = Math.max(citation?.pageNumber ?? 1, 1)
  const viewerKey = `${citation?.documentId ?? documentId}:${citation?.chunkId ?? 'document'}:${activePage}:${citation?.quotedText ?? ''}`
  const workerUrl = 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js'
  const citationRegions = citation?.boundingRegions ?? []

  const searchPluginInstance = useMemo(() => {
    const keyword = citation?.quotedText ?? citation?.snippet ?? ''
    return searchPlugin({
      keyword: keyword ? [keyword] : [],
    })
  }, [citation?.quotedText, citation?.snippet, citation?.documentId])

  const citationHighlightPlugin = useMemo<Plugin>(() => ({
    renderPageLayer: (renderProps: PluginRenderPageLayer) => {
      const regionsForPage = citationRegions.filter(
        (region) => region.page === renderProps.pageIndex + 1
      )

      if (regionsForPage.length === 0) return <></>

      return (
        <div className="absolute inset-0 pointer-events-none">
          {renderBoundingRegions(regionsForPage)}
        </div>
      )
    },
  }), [citationRegions])

  useEffect(() => {
    setIsLoading(true)
  }, [viewerKey])

  if (!citation && !documentId) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground p-8">
        <FileText className="h-12 w-12 text-muted-foreground/30" />
        <p className="text-sm text-center">Click a citation to preview the source document</p>
      </div>
    )
  }

  if (!previewUrl) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground p-8">
        <FileText className="h-12 w-12 text-muted-foreground/30" />
        <p className="text-sm text-center">Missing document preview source</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between p-3 border-b border-border flex-shrink-0 gap-3">
        <div className="min-w-0 flex-1">
          {citation ? (
            <>
              <p className="text-sm font-medium truncate">{citation.documentTitle}</p>
              <p className="text-xs text-muted-foreground truncate">
                Page {citation.pageNumber}
                {citation.pageNumberEnd && citation.pageNumberEnd !== citation.pageNumber
                  ? `–${citation.pageNumberEnd}`
                  : ''}
                {citation.sectionTitle ? ` · ${citation.sectionTitle}` : ''}
              </p>
            </>
          ) : null}
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {downloadUrl ? (
            <a href={downloadUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <Download className="h-3.5 w-3.5" />
              </Button>
            </a>
          ) : null}
          <a href={`${previewUrl}#page=${activePage}`} target="_blank" rel="noopener noreferrer">
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          </a>
          {onClose ? (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
              <X className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>
      </div>

      <div className="relative flex-1 min-h-0 bg-muted/30">
        {isLoading ? (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 text-muted-foreground p-8 bg-background/70 backdrop-blur-[1px]">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-center">
              Opening cited page {citation?.pageNumber ?? 1}…
            </p>
          </div>
        ) : null}

        <Worker workerUrl={workerUrl}>
          <Viewer
            key={viewerKey}
            fileUrl={previewUrl}
            initialPage={Math.max(activePage - 1, 0)}
            defaultScale={SpecialZoomLevel.PageWidth}
            plugins={[searchPluginInstance, citationHighlightPlugin]}
            onDocumentLoad={() => setIsLoading(false)}
          />
        </Worker>
      </div>

      <div className="flex items-center justify-between gap-2 p-2 border-t border-border flex-shrink-0">
        <div className="text-xs text-muted-foreground">
          Page {citation?.pageNumber ?? 1}
          {citation?.pageNumberEnd && citation.pageNumberEnd !== citation.pageNumber
            ? `–${citation.pageNumberEnd}`
            : ''}
        </div>

        <div className="text-[11px] text-muted-foreground">
          Source preview opens directly to the cited page with exact highlighting
        </div>
      </div>

      {citation?.snippet ? (
        <div className="p-3 border-t border-border bg-brand-50 flex-shrink-0">
          <p className="text-xs font-medium text-brand-700 mb-1">Relevant excerpt</p>
          <p className="text-xs text-brand-800 leading-relaxed italic">
            &ldquo;{citation.quotedText ?? citation.snippet}&rdquo;
          </p>
          <p className="text-[11px] text-brand-700/80 mt-2">
            This opens the cited page inline. Use the external-link button if you want the
            document in a full browser tab.
          </p>
        </div>
      ) : null}
    </div>
  )
}
