'use client'

import { useMemo, useState } from 'react'
import { Check, Download, ExternalLink, FileText, Loader2, Share2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { AnswerCitation } from '@/types'

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

/**
 * In-page document preview.
 *
 * Previously used @react-pdf-viewer/core which mounts a Web Worker hosted from
 * a third-party CDN — that combination crashed on render in production for
 * multiple users (the React error boundary above caught it and showed
 * "Source preview unavailable"). We now use the browser's built-in PDF viewer
 * via a same-origin iframe with PDF Open Parameters
 * (https://www.adobe.com/content/dam/acom/en/devnet/acrobat/pdfs/pdf_open_parameters.pdf):
 *   #page=N      → jump to page N
 *   &search=text → highlight the cited passage (Chrome/Edge/Firefox)
 *
 * No Worker, no CDN, no library — works in every modern browser, falls back
 * to download if a browser doesn't ship a PDF viewer.
 */
export function DocumentViewer({ citation, documentId, onClose }: DocumentViewerProps) {
  const previewUrl = useMemo(() => buildPreviewUrl(documentId), [documentId])
  const downloadUrl = useMemo(() => buildDownloadUrl(documentId), [documentId])
  const [isLoading, setIsLoading] = useState(true)
  const [shareCopied, setShareCopied] = useState(false)

  const activePage = Math.max(citation?.pageNumber ?? 1, 1)
  const passage = citation?.quotedText ?? citation?.snippet ?? ''

  // PDF Open Parameters fragment for #search=text (highlight passage). We
  // intentionally do NOT put page=N in the fragment — iPad Safari ignores it,
  // so we use the server-side ?page=N query param instead, which returns the
  // single requested page as a standalone PDF. That way every iframe loads a
  // unique resource and the right page renders on every browser.
  const pdfFragment = useMemo(() => {
    const trimmed = passage.replace(/\s+/g, ' ').trim().slice(0, 80)
    return trimmed ? `search=${encodeURIComponent(trimmed)}` : ''
  }, [passage])

  const iframeSrc = previewUrl
    ? `${previewUrl}?page=${activePage}${pdfFragment ? `#${pdfFragment}` : ''}`
    : null

  const shareUrl = useMemo(() => {
    if (!documentId || typeof window === 'undefined') return null
    const params = new URLSearchParams()
    if (citation?.pageNumber) params.set('page', String(citation.pageNumber))
    if (citation?.chunkId) params.set('chunk', citation.chunkId)
    if (passage) params.set('snippet', passage.slice(0, 240))
    const qs = params.toString()
    const path = qs ? `/documents/${documentId}?${qs}` : `/documents/${documentId}`
    return `${window.location.origin}${path}`
  }, [documentId, citation?.pageNumber, citation?.chunkId, passage])

  const handleShare = async () => {
    if (!shareUrl) return
    try {
      if (typeof navigator !== 'undefined' && 'share' in navigator) {
        await (navigator as any).share({
          title: citation?.documentTitle ?? 'Aircraft document',
          text: citation?.snippet ?? 'View this aircraft record',
          url: shareUrl,
        })
        return
      }
      await (navigator as Navigator).clipboard.writeText(shareUrl)
      setShareCopied(true)
      setTimeout(() => setShareCopied(false), 2000)
    } catch {
      /* user cancelled / clipboard blocked — silently no-op */
    }
  }

  if (!citation && !documentId) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground p-8">
        <FileText className="h-12 w-12 text-muted-foreground/30" />
        <p className="text-sm text-center">Click a citation to preview the source document</p>
      </div>
    )
  }

  if (!iframeSrc) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground p-8">
        <FileText className="h-12 w-12 text-muted-foreground/30" />
        <p className="text-sm text-center">Missing document preview source</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
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
          {shareUrl ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleShare}
              title={shareCopied ? 'Link copied' : 'Share this page'}
              aria-label="Share this page"
            >
              {shareCopied ? (
                <Check className="h-3.5 w-3.5 text-emerald-600" />
              ) : (
                <Share2 className="h-3.5 w-3.5" />
              )}
            </Button>
          ) : null}
          {downloadUrl ? (
            <a href={downloadUrl} target="_blank" rel="noopener noreferrer" title="Download PDF">
              <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Download PDF">
                <Download className="h-3.5 w-3.5" />
              </Button>
            </a>
          ) : null}
          <a href={iframeSrc ?? previewUrl ?? '#'} target="_blank" rel="noopener noreferrer" title="Open in new tab">
            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Open in new tab">
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          </a>
          {onClose ? (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} aria-label="Close">
              <X className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>
      </div>

      {/* PDF iframe */}
      <div className="relative flex-1 min-h-0 bg-muted/30">
        {isLoading ? (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 text-muted-foreground p-8 bg-background/70 backdrop-blur-[1px] pointer-events-none">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-center">
              Opening cited page {citation?.pageNumber ?? 1}…
            </p>
          </div>
        ) : null}

        <iframe
          key={iframeSrc}
          src={iframeSrc}
          title={citation?.documentTitle ?? 'Document preview'}
          className="absolute inset-0 w-full h-full bg-white border-0"
          onLoad={() => setIsLoading(false)}
        />
      </div>

      {/* Cited passage strip */}
      {citation?.snippet ? (
        <div className="p-3 border-t border-border bg-brand-50 flex-shrink-0">
          <p className="text-xs font-medium text-brand-700 mb-1">Cited passage</p>
          <p className="text-xs text-brand-800 leading-relaxed italic line-clamp-3">
            &ldquo;{citation.quotedText ?? citation.snippet}&rdquo;
          </p>
          <p className="text-[11px] text-brand-700/80 mt-2">
            Page {citation.pageNumber}
            {citation.pageNumberEnd && citation.pageNumberEnd !== citation.pageNumber
              ? `–${citation.pageNumberEnd}`
              : ''}
            {' '}of the source PDF — use the toolbar above to download or share.
          </p>
        </div>
      ) : null}
    </div>
  )
}
