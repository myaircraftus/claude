import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServiceSupabase } from '@/lib/supabase/server'

interface RouteContext {
  params: { id: string }
}

export const runtime = 'nodejs'

function buildDisposition(fileName: string | null, download: boolean) {
  const safeName = (fileName ?? 'document.pdf').replace(/"/g, '')
  return `${download ? 'attachment' : 'inline'}; filename="${safeName}"`
}

/**
 * Extract a single page from a PDF as a standalone PDF.
 *
 * Why: iPad Safari (and some corporate PDF readers) ignore the
 * `#page=N` PDF Open Parameters hash, so embedding the same source
 * PDF in N iframes with different #page hashes shows page 1 every
 * time. Serving one PDF per page sidesteps that — every iframe loads
 * a different file. Cheap on small PDFs; we cap to single-page extracts.
 */
async function extractSinglePagePdf(
  source: ArrayBuffer,
  pageNumber: number,
): Promise<ArrayBuffer | null> {
  try {
    // Lazy-load pdf-lib so the rest of the route doesn't pay the parse
    // cost when the caller doesn't ask for a specific page.
    const { PDFDocument } = await import('pdf-lib')
    const src = await PDFDocument.load(source, { ignoreEncryption: true })
    const total = src.getPageCount()
    const safePage = Math.min(Math.max(pageNumber, 1), total)
    const out = await PDFDocument.create()
    const [copied] = await out.copyPages(src, [safePage - 1])
    out.addPage(copied)
    const bytes = await out.save()
    // Copy into a fresh ArrayBuffer so we never hand a SharedArrayBuffer view
    // back to NextResponse (which only accepts BodyInit's narrower set).
    const fresh = new ArrayBuffer(bytes.byteLength)
    new Uint8Array(fresh).set(bytes)
    return fresh
  } catch (err) {
    console.warn('[documents preview] page extract failed, returning full PDF', err)
    return null
  }
}

export async function GET(req: NextRequest, { params }: RouteContext) {
  const context = await resolveRequestOrgContext(req)

  if (!context) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const service = createServiceSupabase()
  const { data: document, error } = await service
    .from('documents')
    .select('id, organization_id, file_path, file_name, mime_type, title')
    .eq('id', params.id)
    .eq('organization_id', context.organizationId)
    .single()

  if (error || !document) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  const { data: file, error: downloadError } = await service.storage
    .from('documents')
    .download(document.file_path)

  if (downloadError || !file) {
    console.error('[documents preview GET] storage download error:', downloadError)
    return NextResponse.json({ error: 'Failed to load document' }, { status: 500 })
  }

  const fileBuffer = await file.arrayBuffer()
  const download = req.nextUrl.searchParams.get('download') === '1'
  const pageParam = req.nextUrl.searchParams.get('page')
  const requestedPage =
    pageParam && /^\d+$/.test(pageParam) ? parseInt(pageParam, 10) : null

  // If a specific page was requested AND we're not in download mode AND it
  // looks like a PDF, return only that page so each iframe loads a unique
  // resource. Falls through to the full file on any extraction error.
  let body = fileBuffer
  let suffix = ''
  if (
    requestedPage &&
    !download &&
    (document.mime_type ?? 'application/pdf').toLowerCase().includes('pdf')
  ) {
    const single = await extractSinglePagePdf(fileBuffer, requestedPage)
    if (single) {
      body = single
      suffix = `-p${requestedPage}`
    }
  }

  const baseName = (document.file_name ?? document.title ?? 'document.pdf')
  const dotIdx = baseName.lastIndexOf('.')
  const namedFile =
    suffix && dotIdx > 0
      ? `${baseName.slice(0, dotIdx)}${suffix}${baseName.slice(dotIdx)}`
      : baseName

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': document.mime_type || 'application/pdf',
      'Content-Length': String(body.byteLength),
      'Content-Disposition': buildDisposition(namedFile, download),
      'Cache-Control': 'private, max-age=300',
      'X-Frame-Options': 'SAMEORIGIN',
    },
  })
}
