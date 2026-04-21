import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data — send audio as multipart/form-data with field name "audio".' }, { status: 400 })
  }
  const audioBlob = formData.get('audio')

  if (!audioBlob || !(audioBlob instanceof Blob)) {
    return NextResponse.json({ error: 'No audio file provided' }, { status: 400 })
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      {
        error: 'Speech-to-text not configured',
        code: 'SERVICE_NOT_CONFIGURED',
      },
      { status: 503 }
    )
  }

  try {
    // Convert Blob to File for OpenAI SDK
    const arrayBuffer = await audioBlob.arrayBuffer()
    const audioFile = new File(
      [arrayBuffer],
      'recording.webm',
      { type: audioBlob.type || 'audio/webm' }
    )

    const openai = new (await import('openai')).default({
      apiKey: process.env.OPENAI_API_KEY,
    })

    const transcription = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file: audioFile,
    })

    return NextResponse.json({ text: transcription.text })
  } catch (err: any) {
    console.error('Transcription error:', err)
    return NextResponse.json(
      { error: err.message ?? 'Transcription failed' },
      { status: 500 }
    )
  }
}
