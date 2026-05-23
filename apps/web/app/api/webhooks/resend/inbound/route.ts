/**
 * POST /api/webhooks/resend/inbound
 *
 * Resend → us. Every inbound email to <handle>@myaircraft.us hits this
 * webhook. We resolve the recipient to a user_profiles row (by
 * inbox_email), persist a row in public.inbox_messages with
 * direction='inbound', and fire the classifier agent asynchronously.
 *
 * Auth: Resend signs each webhook with a shared secret in the
 * `Resend-Signature` header. We compare against RESEND_WEBHOOK_SECRET.
 * Without the env var set we accept everything in dev — production
 * MUST set it.
 *
 * Idempotent: dedup on (provider_msg_id, source='email').
 */
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { createServiceSupabase } from '@/lib/supabase/server'
import { parseResendInbound, type ResendInboundPayload } from '@/lib/inbox/parse-resend'

export const runtime = 'nodejs'
export const maxDuration = 60

function verifySignature(rawBody: string, headerSig: string | null): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) {
    // Dev mode: allow unsigned. PROD MUST SET THE VAR.
    return process.env.VERCEL_ENV !== 'production'
  }
  if (!headerSig) return false
  const expected = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
  // Resend sends "sha256=<hex>"; tolerate either form.
  const presented = headerSig.replace(/^sha256=/, '')
  // Constant-time compare
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(presented, 'hex'))
  } catch {
    return false
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  if (!verifySignature(rawBody, req.headers.get('resend-signature'))) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let payload: ResendInboundPayload
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = parseResendInbound(payload)
  if (!parsed.from || parsed.recipients.length === 0) {
    return NextResponse.json({ error: 'Missing from/to' }, { status: 400 })
  }

  const service = createServiceSupabase()

  // Resolve the recipient to a user. Recipients may be multiple — pick
  // the first one that matches a user_profiles.inbox_email; we'll fan
  // out additional rows for cc-style multi-recipient cases later.
  const lowered = parsed.recipients.map((r) => r.toLowerCase())
  const { data: profiles } = await service
    .from('user_profiles')
    .select('id, inbox_email')
    .in('inbox_email', lowered)
  const profile = (profiles ?? [])[0]
  if (!profile) {
    // Not addressed to a known user. Still log it so an admin can audit
    // — useful for debugging routing issues — but mark unrelated.
    await service.from('inbox_messages').insert({
      user_id: null,
      organization_id: null,
      source: 'email',
      direction: 'inbound',
      from_addr: parsed.from,
      to_addr: parsed.recipients[0] ?? '',
      cc_addrs: parsed.cc,
      subject: parsed.subject,
      body_text: parsed.bodyText,
      body_html: parsed.bodyHtml,
      raw: payload as unknown as Record<string, unknown>,
      classified_as: 'other',
      provider_msg_id: parsed.providerMsgId,
      thread_key: parsed.threadKey,
      attachments: parsed.attachments,
    })
    return NextResponse.json({ ok: true, matched: false })
  }

  // Resolve their org via membership (first one — most users have 1).
  const { data: membership } = await service
    .from('organization_memberships')
    .select('organization_id')
    .eq('user_id', profile.id)
    .not('accepted_at', 'is', null)
    .limit(1)
    .maybeSingle()

  // Idempotent insert keyed on (provider_msg_id, source).
  const { data: inserted, error } = await service
    .from('inbox_messages')
    .upsert(
      {
        user_id: profile.id,
        organization_id: membership?.organization_id ?? null,
        source: 'email',
        direction: 'inbound',
        from_addr: parsed.from,
        to_addr: profile.inbox_email,
        cc_addrs: parsed.cc,
        subject: parsed.subject,
        body_text: parsed.bodyText,
        body_html: parsed.bodyHtml,
        raw: payload as unknown as Record<string, unknown>,
        provider_msg_id: parsed.providerMsgId,
        thread_key: parsed.threadKey,
        attachments: parsed.attachments,
      },
      { onConflict: 'provider_msg_id,source', ignoreDuplicates: false },
    )
    .select('id')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // TODO Phase 2: fire inbox.classifier agent here. For now we just
  // persist and let a downstream cron sweep classify-on-demand.

  return NextResponse.json({ ok: true, matched: true, message_id: inserted?.id })
}
