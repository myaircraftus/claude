/**
 * POST /api/vision/scan-logbook  (Spec 5.4)
 *
 * Multipart image upload → Claude Vision → structured logbook entry
 * fields. Returns a draft shape the client can preview + confirm before
 * persisting via the existing logbook-entries route.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { callAnthropic } from '@/lib/ai/anthropic'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
const MAX_BYTES = 10 * 1024 * 1024

const SYSTEM_PROMPT = `You are an aviation logbook OCR assistant. Extract the maintenance entry visible in this logbook page image.

Output STRICT JSON, no markdown:
{
  "tail_number": "<or null>",
  "event_date": "<YYYY-MM-DD or null>",
  "event_type": "annual|100hr|repair|inspection|other or null",
  "tach_time": <number or null>,
  "airframe_tt": <number or null>,
  "description": "<the work description>",
  "mechanic_name": "<or null>",
  "mechanic_cert_number": "<or null>",
  "ad_references": ["..."],
  "confidence": <0-1>,
  "raw_text": "<full text you read off the page>"
}

Rules:
- Tail numbers look like N12345; preserve as-is.
- Dates MUST be YYYY-MM-DD; if you see e.g. "5/3/26" interpret as 2026-05-03 ONLY if context makes year unambiguous, else null.
- Never invent FAR/AD/SB numbers — only return them if literally visible on the page.
- raw_text is the operator's verification string.`

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()
  if (!membership) return NextResponse.json({ error: 'No org' }, { status: 403 })

  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'multipart/form-data required' }, { status: 400 })
  const file = form.get('image')
  if (!(file instanceof File)) return NextResponse.json({ error: 'image required' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Image too large (10MB max)' }, { status: 413 })
  if (!ALLOWED_MIME.has(file.type)) return NextResponse.json({ error: `Unsupported mime: ${file.type}` }, { status: 415 })

  const base64 = Buffer.from(await file.arrayBuffer()).toString('base64')
  const service = createServiceSupabase()
  try {
    const result = await callAnthropic(service, {
      system: SYSTEM_PROMPT,
      user: 'Extract the logbook entry visible in this image.',
      attachments: [{ kind: 'image', media_type: file.type, data: base64 }],
      max_tokens: 800,
      temperature: 0.0,
      timeout_ms: 60_000,
    }, {
      organization_id: membership.organization_id,
      user_id: user.id,
      scope: 'vision-scan-logbook',
      entity_kind: null,
      entity_id: null,
      context: { mime: file.type, size: file.size },
    })
    const text = result.text.trim()
    const candidate = text.startsWith('{') ? text
      : (text.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1]?.trim() ?? null)
    if (!candidate) return NextResponse.json({ error: 'model returned non-JSON', raw: text.slice(0, 400) }, { status: 502 })
    const parsed = JSON.parse(candidate)
    return NextResponse.json({ draft: parsed })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'vision call failed' }, { status: 500 })
  }
}
