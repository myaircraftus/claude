/**
 * POST /api/voice/transcribe  (Spec 5.4)
 *
 * Multipart audio upload → OpenAI Whisper. Server-side proxy so
 * OPENAI_API_KEY never reaches the browser. Logs one ai_activity_log
 * row per call (success + failure + cap-exceeded paths).
 *
 * Limits:
 *   - 25 MB max upload (Whisper's own cap)
 *   - allowed mime: audio/webm, audio/mp4, audio/mpeg, audio/wav, audio/ogg
 *   - 30s recording cap is enforced client-side; server checks size only
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { rateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const ALLOWED_MIME = new Set([
  'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/x-m4a',
])
const MAX_BYTES = 25 * 1024 * 1024

export async function POST(req: NextRequest) {
  // Whisper costs real money per request — rate-limit per IP (security-audit §5.8).
  const rl = rateLimit(`voice-transcribe:${getClientIp(req.headers)}`, { limit: 10, windowSeconds: 60 })
  if (!rl.success) return rateLimitResponse(rl)

  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()
  if (!membership) return NextResponse.json({ error: 'No org' }, { status: 403 })

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'Voice transcription not configured' }, { status: 503 })

  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'multipart/form-data required' }, { status: 400 })

  const file = form.get('audio')
  if (!(file instanceof File)) return NextResponse.json({ error: 'audio file required' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Audio too large (max 25MB)' }, { status: 413 })
  if (file.type && !ALLOWED_MIME.has(file.type)) {
    return NextResponse.json({ error: `Unsupported audio mime: ${file.type}` }, { status: 415 })
  }

  const started = Date.now()
  const fd = new FormData()
  fd.append('file', file, file.name || 'audio.webm')
  fd.append('model', 'whisper-1')
  fd.append('response_format', 'json')

  const service = createServiceSupabase()
  try {
    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}` },
      body: fd,
      signal: AbortSignal.timeout(45_000),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      const msg = `whisper ${res.status}: ${body.slice(0, 240)}`
      await logActivity(service, membership.organization_id, user.id, 'failed', null, started, null, null, msg)
      return NextResponse.json({ error: msg }, { status: 500 })
    }
    const json = (await res.json()) as { text?: string }
    const text = (json.text ?? '').trim()
    await logActivity(service, membership.organization_id, user.id, 'success', 'whisper-1', started, file.size, text.length, null)
    return NextResponse.json({ text, duration_ms: Date.now() - started })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'transcription failed'
    await logActivity(service, membership.organization_id, user.id, 'failed', null, started, null, null, msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

async function logActivity(
  service: ReturnType<typeof createServiceSupabase>,
  organization_id: string,
  user_id: string,
  status: 'success' | 'failed',
  model: string | null,
  started: number,
  audio_bytes: number | null,
  output_chars: number | null,
  error_message: string | null,
) {
  try {
    await service.from('ai_activity_log').insert({
      organization_id,
      user_id,
      scope: 'voice-transcribe',
      entity_kind: null,
      entity_id: null,
      model,
      status,
      input_tokens: audio_bytes,         // bytes-as-tokens proxy
      output_tokens: output_chars,
      cost_usd_cents: null,              // Whisper pricing not in our PRICING map
      duration_ms: Date.now() - started,
      error_message,
      context: {},
    })
  } catch (e) {
    console.warn('[voice-transcribe] activity log insert failed:', e)
  }
}
