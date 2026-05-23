/**
 * Owner-side WO chat attachment upload. Mirror of
 * /api/work-orders/[id]/messages/upload but authed via portal-customer.
 *
 * Same storage scheme: bucket=work-order-chat, path=<orgId>/<woId>/<uuid>.<ext>
 * The owner write policy on storage.objects (migration
 * 20260525_owner_wo_chat_rls) gates writes by walking the
 * work-order → aircraft → customer → user chain.
 */
import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { resolveOwnerContext, getOwnerScopedWorkOrder } from '@/lib/auth/owner-portal'
import { createServiceSupabase } from '@/lib/supabase/server'
import { rateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'

export const runtime = 'nodejs'

function inferKind(mimeType: string): 'image' | 'audio' | 'video' | 'file' {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('audio/')) return 'audio'
  if (mimeType.startsWith('video/')) return 'video'
  return 'file'
}

function getExtension(filename: string): string {
  const parts = filename.split('.')
  return parts.length > 1 ? parts[parts.length - 1] : 'bin'
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const rl = rateLimit(`owner-wo-msg-upload:${getClientIp(req.headers)}`, {
    limit: 10,
    windowSeconds: 60,
  })
  if (!rl.success) return rateLimitResponse(rl)

  const ctx = await resolveOwnerContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const wo = await getOwnerScopedWorkOrder(ctx, params.id)
  if (!wo) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const ext = getExtension(file.name)
  const fileId = crypto.randomUUID()
  const storagePath = `${wo.organization_id}/${wo.id}/${fileId}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const service = createServiceSupabase()
  const { error: uploadErr } = await service.storage
    .from('work-order-chat')
    .upload(storagePath, buffer, { contentType: file.type, upsert: false })
  if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 })

  const kind = inferKind(file.type)
  const result: {
    path: string
    name: string
    size: number
    kind: string
    transcript?: string
  } = { path: storagePath, name: file.name, size: file.size, kind }

  // Audio → Whisper transcript (best-effort; same as shop endpoint).
  if (kind === 'audio' && process.env.OPENAI_API_KEY) {
    try {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      const audioFile = new File([buffer], file.name, { type: file.type })
      const transcription = await openai.audio.transcriptions.create({
        model: 'whisper-1',
        file: audioFile,
      })
      result.transcript = transcription.text
    } catch (err) {
      console.error('Whisper transcription failed:', err)
    }
  }

  return NextResponse.json(result)
}
