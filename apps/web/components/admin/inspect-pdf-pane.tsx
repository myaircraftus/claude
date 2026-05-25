'use client'

/**
 * InspectPdfPane — the right column of /admin/documents/[id]/inspect.
 *
 * Loads the FULL document PDF once and navigates between pages by mutating
 * the iframe's hash (`#page=N`), so the operator can scroll context around
 * any chunk without re-downloading the file on every jump.
 *
 * Why not reuse the existing `DocumentViewer` from /components/ask?
 * That component is built for citation rendering and intentionally calls
 * `/api/documents/{id}/preview?page=N`, which uses pdf-lib server-side to
 * return a *single-page* standalone PDF (fast, focused, ideal for an Ask AI
 * answer). For the inspector we need the whole document so the user can
 * see context above and below a chunk. So this is a deliberately separate,
 * thinner viewer that hits the unparameterized preview endpoint.
 *
 * Page navigation strategy: the initial iframe src is captured into state
 * on mount and never re-set from React (React re-renders won't reload the
 * PDF). When `pageNumber` changes we instead set the iframe's
 * contentWindow hash — same-origin, so the Chromium / Firefox built-in
 * PDF viewer just scrolls. Snippet highlighting via `#search=` is layered
 * on the same hash when a chunk's text is provided.
 *
 * Client-only because PDF rendering requires the browser.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'

interface Props {
  documentId: string
  documentTitle: string
  docType: string | null
  pageNumber: number
  chunkId?: string | null
  snippet?: string | null
}

function buildHash(page: number, snippet?: string | null): string {
  const safePage = Math.max(1, page)
  const trimmed = snippet ? snippet.replace(/\s+/g, ' ').trim().slice(0, 80) : ''
  const search = trimmed ? `&search=${encodeURIComponent(trimmed)}` : ''
  return `page=${safePage}${search}`
}

export function InspectPdfPane({
  documentId,
  documentTitle,
  docType,
  pageNumber,
  snippet,
}: Props) {
  const previewUrl = `/api/documents/${documentId}/preview`
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Latch the initial src ONCE on mount so React re-renders never force the
  // iframe to reload the whole PDF — page nav is done via hash mutation in
  // the useEffect below.
  const [initialSrc] = useState(() => `${previewUrl}#${buildHash(pageNumber, snippet)}`)

  // Navigate to a new page by mutating the iframe's hash. The Chromium /
  // Firefox built-in PDF viewer responds to `#page=N` without reloading.
  // Same-origin so the cross-frame access is permitted; on the off chance
  // it's blocked we fall back to resetting src (one-time reload — still
  // correct, just less smooth).
  useEffect(() => {
    const frame = iframeRef.current
    if (!frame) return
    const hash = buildHash(pageNumber, snippet)
    try {
      const win = frame.contentWindow
      if (win) {
        win.location.hash = hash
        return
      }
    } catch {
      // fall through to src reset
    }
    frame.src = `${previewUrl}#${hash}`
  }, [pageNumber, snippet, previewUrl])

  const headerLabel = useMemo(() => {
    const parts: string[] = [`page ${Math.max(1, pageNumber)}`]
    if (docType) parts.push(docType)
    return parts.join(' · ')
  }, [pageNumber, docType])

  return (
    <div className="h-full min-h-0 flex flex-col rounded-xl border border-border bg-white overflow-hidden">
      <div className="px-3 py-2 border-b border-border bg-muted/30 flex items-center justify-between gap-2">
        <div className="min-w-0 flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold shrink-0">
            Source PDF
          </span>
          <span className="text-[11px] text-foreground truncate" title={documentTitle}>
            · {documentTitle}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground shrink-0">
          <span>{headerLabel}</span>
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            open raw ↗
          </a>
        </div>
      </div>
      <div className="relative flex-1 min-h-0 bg-muted/30">
        {isLoading ? (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 text-muted-foreground bg-background/70 pointer-events-none">
            <Loader2 className="h-6 w-6 animate-spin" />
            <p className="text-xs">Loading PDF…</p>
          </div>
        ) : null}
        <iframe
          ref={iframeRef}
          src={initialSrc}
          title={documentTitle}
          className="absolute inset-0 w-full h-full bg-white border-0"
          onLoad={() => setIsLoading(false)}
        />
      </div>
    </div>
  )
}
