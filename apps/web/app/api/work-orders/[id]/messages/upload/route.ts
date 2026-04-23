import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import OpenAI from 'openai'

function inferKind(mimeType: string): 'image' | 'audio' | 'file' {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('audio/')) return 'audio'
  return 'file'
}

function getExtension(filename: string): string {
  const parts = filename.split('.')
  return parts.length > 1 ? parts[parts.length - 1] : 'bin'
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const orgId = ctx.organizationId

  // Verify work order belongs to org
  const { data: wo } = await supabase
    .from('work_orders')
    .select('id')
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .single()
  if (!wo) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const ext = getExtension(file.name)
  const fileId = crypto.randomUUID()
  const storagePath = `${orgId}/${params.id}/${fileId}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: uploadErr } = await supabase.storage
    .from('work-order-chat')
    .upload(storagePath, buffer, {
      contentType: file.type,
      upsert: false,
    })

  if (uploadErr) {
    return NextResponse.json({ error: uploadErr.message }, { status: 500 })
  }

  const kind = inferKind(file.type)

  const result: {
    path: string
    name: string
    size: number
    kind: string
    transcript?: string
  } = {
    path: storagePath,
    name: file.name,
    size: file.size,
    kind,
  }

  // Transcribe audio files with Whisper
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
      // Transcription is best-effort; don't fail the upload
      console.error('Whisper transcription failed:', err)
    }
  }

  return NextResponse.json(result)
}
