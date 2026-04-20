import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { ensureMarketplaceSellerAccount, isMarketplaceSellerManager, requireMarketplaceContext } from '../../_shared'

const MAX_MEDIA_FILE_SIZE_BYTES = 25 * 1024 * 1024

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^\w.\-]+/g, '-')
}

export async function GET(req: NextRequest) {
  const ctxRes = await requireMarketplaceContext()
  if (!ctxRes.ok) return ctxRes.response

  const { service } = ctxRes.ctx
  const path = req.nextUrl.searchParams.get('path')?.trim()
  if (!path) {
    return NextResponse.json({ error: 'path is required' }, { status: 400 })
  }

  const download = await service.storage.from('documents').download(path)
  if (download.error || !download.data) {
    return NextResponse.json({ error: download.error?.message || 'Media not found' }, { status: 404 })
  }

  const fileBuffer = await download.data.arrayBuffer()
  return new NextResponse(fileBuffer, {
    status: 200,
    headers: {
      'Content-Type': download.data.type || 'application/octet-stream',
      'Content-Length': String(fileBuffer.byteLength),
      'Cache-Control': 'private, max-age=300',
      'Content-Disposition': 'inline',
    },
  })
}

export async function POST(req: NextRequest) {
  const ctxRes = await requireMarketplaceContext()
  if (!ctxRes.ok) return ctxRes.response

  const { service, organizationId, role } = ctxRes.ctx
  if (!isMarketplaceSellerManager(role)) {
    return NextResponse.json({ error: 'Owner, admin, or mechanic required' }, { status: 403 })
  }

  const sellerAccount = await ensureMarketplaceSellerAccount(service, organizationId)

  const formData = await req.formData()
  const files = formData
    .getAll('files')
    .filter((item): item is File => typeof File !== 'undefined' && item instanceof File)

  if (files.length === 0) {
    return NextResponse.json({ error: 'At least one media file is required' }, { status: 400 })
  }

  const uploadedMedia = []

  for (const file of files) {
    if (file.size > MAX_MEDIA_FILE_SIZE_BYTES) {
      return NextResponse.json(
        {
          error: `${file.name} exceeds the 25 MB upload limit for marketplace media.`,
        },
        { status: 400 }
      )
    }

    const isVideo = file.type.startsWith('video/')
    if (isVideo && sellerAccount.plan_slug !== 'pro') {
      return NextResponse.json(
        {
          error: 'Video upload is only available on the Pro seller plan.',
        },
        { status: 403 }
      )
    }

    if (!file.type.startsWith('image/') && !isVideo) {
      return NextResponse.json(
        {
          error: `${file.name} must be an image or video file.`,
        },
        { status: 400 }
      )
    }

    const id = randomUUID()
    const storagePath = `${organizationId}/marketplace/media/${id}/${sanitizeFileName(file.name)}`
    const buffer = Buffer.from(await file.arrayBuffer())

    const upload = await service.storage.from('documents').upload(storagePath, buffer, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    })

    if (upload.error) {
      return NextResponse.json({ error: upload.error.message || 'Failed to upload media' }, { status: 500 })
    }

    uploadedMedia.push({
      id,
      type: isVideo ? 'video' : 'image',
      alt: file.name,
      fileName: file.name,
      sizeBytes: file.size,
      mimeType: file.type,
      storagePath,
      url: `/api/marketplace/parts/media?path=${encodeURIComponent(storagePath)}`,
    })
  }

  return NextResponse.json({
    ok: true,
    media: uploadedMedia,
  })
}
