/**
 * POST /api/webhooks/twilio/sms
 *
 * Twilio inbound SMS webhook. Lands in the same inbox_messages table as
 * email, with source='sms', so the unified inbox UI doesn't care which
 * channel the message came from.
 *
 * Twilio sends form-urlencoded — not JSON. Fields we use:
 *   From, To, Body, MessageSid, NumMedia, MediaUrl0..N, MediaContentType0..N
 *
 * Auth: Twilio signs each webhook with X-Twilio-Signature (HMAC-SHA1
 * over the URL + sorted POST params). Verify against TWILIO_AUTH_TOKEN.
 * If TWILIO_AUTH_TOKEN is unset (dev), we accept anything; production
 * MUST set it.
 *
 * Idempotent on (provider_msg_id=MessageSid, source='sms').
 */
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { createServiceSupabase } from '@/lib/supabase/server'
import { classifyInboxMessage } from '@/lib/agents/impl/inbox-classifier'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function verifyTwilio(req: NextRequest, params: URLSearchParams): boolean {
  const token = process.env.TWILIO_AUTH_TOKEN
  if (!token) return process.env.VERCEL_ENV !== 'production'
  const sig = req.headers.get('x-twilio-signature')
  if (!sig) return false
  // Twilio signs: URL + sorted key+value concatenation (no separators).
  const url = req.headers.get('x-forwarded-proto')
    ? `${req.headers.get('x-forwarded-proto')}://${req.headers.get('host')}${req.nextUrl.pathname}`
    : req.url
  const sorted = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .reduce((acc, [k, v]) => acc + k + v, url)
  const expected = crypto.createHmac('sha1', token).update(sorted).digest('base64')
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))
  } catch {
    return false
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const params = new URLSearchParams(rawBody)
  if (!verifyTwilio(req, params)) {
    return new NextResponse('Invalid signature', { status: 401 })
  }

  const from = (params.get('From') ?? '').trim()
  const to = (params.get('To') ?? '').trim()
  const body = params.get('Body') ?? ''
  const messageSid = params.get('MessageSid') ?? null
  const numMedia = parseInt(params.get('NumMedia') ?? '0', 10) || 0
  const attachments: Array<{ url: string; contentType: string }> = []
  for (let i = 0; i < Math.min(numMedia, 10); i++) {
    const url = params.get(`MediaUrl${i}`)
    const contentType = params.get(`MediaContentType${i}`) ?? 'application/octet-stream'
    if (url) attachments.push({ url, contentType })
  }
  if (!from || !to) return NextResponse.json({ error: 'Missing From/To' }, { status: 400 })

  const service = createServiceSupabase()
  const { data: profile } = await service
    .from('user_profiles')
    .select('id, inbox_phone')
    .eq('inbox_phone', to)
    .maybeSingle()
  if (!profile) {
    // Unknown recipient — log it admin-side, return 200 so Twilio doesn't retry.
    await service.from('inbox_messages').insert({
      user_id: null,
      source: 'sms',
      direction: 'inbound',
      from_addr: from,
      to_addr: to,
      body_text: body,
      raw: Object.fromEntries(params),
      provider_msg_id: messageSid,
      attachments,
      classified_as: 'other',
    })
    return new NextResponse('<Response></Response>', {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    })
  }

  const { data: membership } = await service
    .from('organization_memberships')
    .select('organization_id')
    .eq('user_id', profile.id)
    .not('accepted_at', 'is', null)
    .limit(1)
    .maybeSingle()

  const { data: inserted, error } = await service
    .from('inbox_messages')
    .upsert(
      {
        user_id: profile.id,
        organization_id: membership?.organization_id ?? null,
        source: 'sms',
        direction: 'inbound',
        from_addr: from,
        to_addr: to,
        body_text: body,
        body_html: null,
        raw: Object.fromEntries(params),
        provider_msg_id: messageSid,
        attachments,
        thread_key: `sms:${from}:${to}`,
      },
      { onConflict: 'provider_msg_id,source', ignoreDuplicates: false },
    )
    .select('id')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Run classifier (best-effort, 6s budget so Twilio's 15s timeout never
  // bites). SMS classify is mostly "reminder vs adhoc".
  if (inserted?.id) {
    await Promise.race([
      classifyInboxMessage({
        supabase: service,
        triggeredBy: profile.id,
        messageId: inserted.id,
        from,
        subject: null,
        body,
        attachmentNames: attachments.map((a) => a.url.split('/').pop() ?? 'media'),
      }).catch(() => undefined),
      new Promise((res) => setTimeout(res, 6000)),
    ])
  }

  // Twilio expects a TwiML response (XML); empty = "no auto-reply".
  return new NextResponse('<Response></Response>', {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
  })
}
