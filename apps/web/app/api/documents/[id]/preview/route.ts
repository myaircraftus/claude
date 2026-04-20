import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServiceSupabase } from '@/lib/supabase/server'

interface RouteContext {
  params: { id: string }
}

function buildDisposition(fileName: string | null, download: boolean) {
  const safeName = (fileName ?? 'document.pdf').replace(/"/g, '')
  return `${download ? 'attachment' : 'inline'}; filename="${safeName}"`
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

  return new NextResponse(fileBuffer, {
    status: 200,
    headers: {
      'Content-Type': document.mime_type || 'application/pdf',
      'Content-Length': String(fileBuffer.byteLength),
      'Content-Disposition': buildDisposition(document.file_name ?? document.title ?? null, download),
      'Cache-Control': 'private, max-age=300',
      'X-Frame-Options': 'SAMEORIGIN',
    },
  })
}
