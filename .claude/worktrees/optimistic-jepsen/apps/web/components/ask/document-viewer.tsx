'use client'

import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Download, X, Loader2, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createBrowserSupabase } from '@/lib/supabase/browser'
import type { AnswerCitation } from '@/types'

interface DocumentViewerProps {
  citation: AnswerCitation | null
  documentId?: string
  filePath?: string
  onClose?: () => void
}

export function DocumentViewer({ citation, documentId, filePath, onClose }: DocumentViewerProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [zoom, setZoom] = useState(100)
  const [pdfLoaded, setPdfLoaded] = useState(false)

  useEffect(() => {
    if (!filePath) return
    setLoading(true)
    setPdfLoaded(false)
    const supabase = createBrowserSupabase()
    supabase.storage
      .from('aircraft-documents')
      .createSignedUrl(filePath, 3600)
      .then(({ data }) => {
        setSignedUrl(data?.signedUrl ?? null)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [filePath])

  useEffect(() => {
    if (citation) {
      setCurrentPage(citation.pageNumber)
    }
  }, [citation])

  if (!citation && !documentId) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-muted-foreground p-8">
        <FileText className="h-12 w-12 text-muted-foreground/30" />
        <p className="text-sm text-center">
          Click a citation to preview the source document
        </p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border flex-shrink-0">
        <div className="flex-1 min-w-0">
          {citation && (
            <>
              <p className="text-sm font-medium truncate">{citation.documentTitle}</p>
              <p className="text-xs text-muted-foreground">
                Page {citation.pageNumber}
                {citation.sectionTitle && ` · ${citation.sectionTitle}`}
              </p>
            </>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setZoom(z => Math.max(50, z - 25))}
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <span className="text-xs w-10 text-center">{zoom}%</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setZoom(z => Math.min(200, z + 25))}
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
          {signedUrl && (
            <a href={signedUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <Download className="h-3.5 w-3.5" />
              </Button>
            </a>
          )}
          {onClose && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* PDF content */}
      <div className="flex-1 overflow-auto bg-muted/30 flex items-center justify-center">
        {loading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Loading document…</p>
          </div>
        ) : signedUrl ? (
          <div className="relative w-full h-full">
            <iframe
              src={`${signedUrl}#page=${currentPage}`}
              className="w-full h-full border-0"
              style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center' }}
              title="Document preview"
              onLoad={() => setPdfLoaded(true)}
            />
          </div>
        ) : (
          <div className="text-center p-6 space-y-2">
            <FileText className="h-12 w-12 text-muted-foreground/30 mx-auto" />
            <p className="text-sm text-muted-foreground">Unable to load document preview</p>
          </div>
        )}
      </div>

      {/* Page navigation */}
      {signedUrl && (
        <div className="flex items-center justify-center gap-2 p-2 border-t border-border flex-shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground">Page {currentPage}</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setCurrentPage(p => p + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Snippet highlight */}
      {citation?.snippet && (
        <div className="p-3 border-t border-border bg-brand-50 flex-shrink-0">
          <p className="text-xs font-medium text-brand-700 mb-1">Relevant excerpt:</p>
          <p className="text-xs text-brand-800 leading-relaxed line-clamp-4 italic">
            &ldquo;{citation.snippet}&rdquo;
          </p>
        </div>
      )}
    </div>
  )
}
