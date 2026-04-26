import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { rateLimit, rateLimitResponse, getClientIp } from '@/lib/rate-limit'
import {
  synthesizeSpeech,
  isElevenLabsConfigured,
  ElevenLabsNotConfiguredError,
} from '@/lib/elevenlabs/tts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  text: z.string().min(1).max(2000),
  voiceId: z.string().min(1).max(64).optional(),
  modelId: z.string().min(1).max(64).optional(),
})

/**
 * Authenticated text-to-speech endpoint backed by ElevenLabs.
 *
 * Returns audio/mpeg bytes on success. Returns 503 when ElevenLabs is not
 * configured (no ELEVENLABS_API_KEY). Auth required to prevent open API-key
 * usage; per-user rate limit prevents accidental loops from burning credits.
 */
export async function POST(req: NextRequest) {
  if (!isElevenLabsConfigured()) {
    return NextResponse.json(
      { error: 'Text-to-speech is not configured.' },
      { status: 503 },
    )
  }

  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Rate-limit by user — TTS is metered upstream, prevent loops/abuse.
  const limit = rateLimit(`tts:${ctx.user.id}`, { limit: 30, windowSeconds: 60 })
  if (!limit.success) return rateLimitResponse(limit)

  const body = schema.safeParse(await req.json().catch(() => null))
  if (!body.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: body.error.flatten() },
      { status: 400 },
    )
  }

  try {
    const { audio, contentType } = await synthesizeSpeech({
      text: body.data.text,
      voiceId: body.data.voiceId,
      modelId: body.data.modelId,
    })

    return new Response(audio, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, no-store',
        'Content-Length': String(audio.byteLength),
      },
    })
  } catch (err) {
    if (err instanceof ElevenLabsNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 })
    }
    const message = err instanceof Error ? err.message : 'Synthesis failed'
    console.error('[tts]', getClientIp(req.headers), message)
    return NextResponse.json({ error: 'Synthesis failed' }, { status: 502 })
  }
}
