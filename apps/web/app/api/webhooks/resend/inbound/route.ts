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
import { classifyInboxMessage } from '@/lib/agents/impl/inbox-classifier'
import { extractExpenseFromInbox } from '@/lib/agents/impl/inbox-expense-extractor'
import { parseEstimateFromInbox } from '@/lib/agents/impl/inbox-estimate-parser'
import { importInvoiceFromInbox } from '@/lib/agents/impl/inbox-invoice-importer'

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
  if (!inserted?.id) {
    return NextResponse.json({ ok: true, matched: true, message_id: null })
  }

  // Phase 2: classifier → extractor chain. Both awaited inside a single
  // Promise.race(8s) budget so the webhook responds promptly while still
  // letting the audit rows land via the agent_runs runner. Vercel
  // function timeout is 60s so we have headroom; the 8s budget protects
  // us against a slow OpenAI tail.
  const messageId = inserted.id
  const ctx = {
    supabase: service,
    triggeredBy: profile.id,
    messageId,
    from: parsed.from,
    subject: parsed.subject,
    body: parsed.bodyText,
    attachmentNames: parsed.attachments.map((a) => a.filename),
  } as const

  const chain = (async () => {
    const classifyResult = await classifyInboxMessage(ctx)
    const category = classifyResult.output?.category
    const confidence = classifyResult.output?.confidence
    if (
      !category ||
      !confidence ||
      confidence === 'low' ||
      confidence === 'refused' ||
      !['receipt', 'estimate', 'invoice'].includes(category)
    ) {
      return { classified: category ?? 'unknown', extractor: 'skipped' }
    }
    const extractorArgs = {
      supabase: service,
      triggeredBy: profile.id,
      messageId,
      orgId: membership?.organization_id ?? null,
      userId: profile.id,
      subject: parsed.subject,
      body: parsed.bodyText,
      from: parsed.from,
    }
    if (category === 'receipt') {
      await extractExpenseFromInbox(extractorArgs)
      return { classified: 'receipt', extractor: 'inbox.expense-extractor' }
    }
    if (category === 'estimate') {
      await parseEstimateFromInbox(extractorArgs)
      return { classified: 'estimate', extractor: 'inbox.estimate-parser' }
    }
    if (category === 'invoice') {
      await importInvoiceFromInbox(extractorArgs)
      return { classified: 'invoice', extractor: 'inbox.invoice-importer' }
    }
    return { classified: category, extractor: 'none' }
  })().catch((err) => ({ error: err instanceof Error ? err.message : String(err) }))

  const chainResult = await Promise.race([
    chain,
    new Promise<{ timeout: true }>((resolve) =>
      setTimeout(() => resolve({ timeout: true }), 8000),
    ),
  ])

  return NextResponse.json({
    ok: true,
    matched: true,
    message_id: messageId,
    chain: chainResult,
  })
}
