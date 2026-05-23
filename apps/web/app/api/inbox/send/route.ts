/**
 * POST /api/inbox/send
 *
 * Outbound from the unified inbox. Sends an email via Resend AND logs
 * the message into public.inbox_messages with direction='outbound' so
 * the user sees their own sent items in the same thread view as their
 * received items.
 *
 * Body: {
 *   to: string | string[],
 *   subject: string,
 *   body: string,             // plain text (becomes both text + simple html)
 *   thread_key?: string,      // attach to an existing thread
 *   in_reply_to_message_id?: string,
 *   related_work_order_id?: string,
 *   classified_as?: string,   // e.g. 'estimate' when sending an estimate
 * }
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email/resend-client'

export const runtime = 'nodejs'

interface SendBody {
  to?: string | string[]
  subject?: string
  body?: string
  thread_key?: string
  in_reply_to_message_id?: string
  related_work_order_id?: string
  classified_as?: 'receipt' | 'estimate' | 'invoice' | 'reminder' | 'adhoc' | 'spam' | 'other'
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as SendBody
  const to = Array.isArray(body.to) ? body.to : body.to ? [body.to] : []
  const subject = body.subject?.trim() ?? ''
  const bodyText = body.body?.trim() ?? ''
  if (to.length === 0 || !subject || !bodyText) {
    return NextResponse.json({ error: 'to, subject, body are required' }, { status: 400 })
  }

  const service = createServiceSupabase()
  const { data: profile } = await service
    .from('user_profiles')
    .select('inbox_email, full_name')
    .eq('id', user.id)
    .maybeSingle()

  const fromAddr = profile?.inbox_email ?? `noreply@myaircraft.us`
  const fromHeader = profile?.full_name
    ? `${profile.full_name} <${fromAddr}>`
    : fromAddr

  // Org for the audit-trail row (so a shop admin can see what the
  // mechanic sent out).
  const { data: membership } = await service
    .from('organization_memberships')
    .select('organization_id')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .limit(1)
    .maybeSingle()

  // Try to send via Resend first. If it 4xx's (e.g. unverified domain in
  // dev) we still log the outbound row but mark its raw with the error.
  const send = await sendEmail({
    to,
    from: fromHeader,
    subject,
    text: bodyText,
    html: bodyText.replace(/\n/g, '<br>'),
    headers: body.thread_key ? { 'In-Reply-To': `<${body.thread_key}>` } : undefined,
    tags: [{ name: 'inbox-outbound', value: 'true' }],
  })

  const { data: row, error: insertErr } = await service
    .from('inbox_messages')
    .insert({
      user_id: user.id,
      organization_id: membership?.organization_id ?? null,
      source: 'email',
      direction: 'outbound',
      from_addr: fromAddr,
      to_addr: to[0],
      cc_addrs: to.slice(1),
      subject,
      body_text: bodyText,
      body_html: bodyText.replace(/\n/g, '<br>'),
      thread_key: body.thread_key ?? null,
      provider_msg_id: send.ok ? (send.id ?? null) : null,
      raw: send.ok ? null : { error: send.error, status: send.status },
      classified_as: body.classified_as ?? null,
      related_work_order_id: body.related_work_order_id ?? null,
      // Outbound messages are "read" by definition for the sender.
      read_at: new Date().toISOString(),
    })
    .select('id, thread_key, created_at')
    .single()

  if (insertErr) {
    return NextResponse.json(
      { error: 'Send succeeded but log failed', detail: insertErr.message },
      { status: 500 },
    )
  }
  return NextResponse.json({
    ok: send.ok,
    message_id: row.id,
    thread_key: row.thread_key,
    provider_id: send.id,
    error: send.ok ? undefined : send.error,
  })
}
