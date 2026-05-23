/**
 * POST /api/inbox/send-sms
 *
 * Outbound SMS via Twilio. Logs to inbox_messages alongside email so
 * the unified inbox UI shows both channels in the same thread view.
 *
 * Body: { to: string, body: string, thread_key?: string }
 *
 * Auth uses TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN env vars.
 * The "From" number is the user's user_profiles.inbox_phone, or the
 * org-shared TWILIO_FROM_DEFAULT env var as fallback.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'

export const runtime = 'nodejs'

interface SendBody {
  to?: string
  body?: string
  thread_key?: string
}

async function sendViaTwilio(args: {
  accountSid: string
  authToken: string
  from: string
  to: string
  body: string
}): Promise<{ ok: boolean; sid?: string; error?: string }> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${args.accountSid}/Messages.json`
  const form = new URLSearchParams({ From: args.from, To: args.to, Body: args.body })
  const auth = Buffer.from(`${args.accountSid}:${args.authToken}`).toString('base64')
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    })
    const json = (await res.json().catch(() => ({}))) as { sid?: string; message?: string }
    if (!res.ok) return { ok: false, error: json.message ?? `Twilio ${res.status}` }
    return { ok: true, sid: json.sid }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as SendBody
  const to = body.to?.trim() ?? ''
  const text = body.body?.trim() ?? ''
  if (!to || !text) {
    return NextResponse.json({ error: 'to and body required' }, { status: 400 })
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!accountSid || !authToken) {
    return NextResponse.json({ error: 'Twilio not configured' }, { status: 500 })
  }

  const service = createServiceSupabase()
  const { data: profile } = await service
    .from('user_profiles')
    .select('inbox_phone')
    .eq('id', user.id)
    .maybeSingle()
  const from = profile?.inbox_phone ?? process.env.TWILIO_FROM_DEFAULT ?? null
  if (!from) {
    return NextResponse.json(
      { error: 'No Twilio number configured for this user' },
      { status: 400 },
    )
  }

  const send = await sendViaTwilio({
    accountSid,
    authToken,
    from,
    to,
    body: text,
  })

  const { data: row } = await service
    .from('inbox_messages')
    .insert({
      user_id: user.id,
      source: 'sms',
      direction: 'outbound',
      from_addr: from,
      to_addr: to,
      body_text: text,
      provider_msg_id: send.sid ?? null,
      thread_key: `sms:${to}:${from}`,
      raw: send.ok ? null : { error: send.error },
      read_at: new Date().toISOString(),
    })
    .select('id, thread_key')
    .single()

  return NextResponse.json({
    ok: send.ok,
    sid: send.sid,
    error: send.ok ? undefined : send.error,
    message_id: row?.id,
    thread_key: row?.thread_key,
  })
}
