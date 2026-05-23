/**
 * POST /api/admin/inbox/provision-phone
 * Body: { user_id: string, area_code?: string }
 *
 * Admin-only. Buys a Twilio US local phone number, configures its
 * inbound-SMS webhook to /api/webhooks/twilio/sms, and writes the new
 * E.164 number to user_profiles.inbox_phone.
 *
 * Twilio billing happens on purchase. We deliberately do NOT bulk-
 * provision — the founder explicitly clicks a button per user so cost
 * is visible.
 *
 * Required env:
 *   TWILIO_ACCOUNT_SID
 *   TWILIO_AUTH_TOKEN
 *   TWILIO_INBOUND_SMS_WEBHOOK (defaults to
 *     `${PUBLIC_APP_ORIGIN}/api/webhooks/twilio/sms`)
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const maxDuration = 30

interface TwilioNumber {
  phone_number?: string
  friendly_name?: string
}

function basicAuth(sid: string, token: string): string {
  return 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64')
}

async function twilioRequest<T>(
  sid: string,
  token: string,
  path: string,
  init: { method?: 'GET' | 'POST'; body?: URLSearchParams } = {},
): Promise<{ ok: boolean; status: number; data: T | null; error?: string }> {
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      Authorization: basicAuth(sid, token),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: init.body,
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    return { ok: false, status: res.status, data: null, error: text.slice(0, 300) }
  }
  const data = (await res.json()) as T
  return { ok: true, status: res.status, data }
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('is_platform_admin')
    .eq('id', user.id)
    .maybeSingle()
  const isAdmin = Boolean((profile as { is_platform_admin?: boolean } | null)?.is_platform_admin)
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: { user_id?: unknown; area_code?: unknown }
  try {
    body = (await req.json()) as { user_id?: unknown; area_code?: unknown }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const userId = typeof body.user_id === 'string' ? body.user_id : null
  if (!userId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    return NextResponse.json({ error: 'Valid user_id required' }, { status: 400 })
  }
  const areaCode = typeof body.area_code === 'string' && /^\d{3}$/.test(body.area_code)
    ? body.area_code
    : null

  const SID = process.env.TWILIO_ACCOUNT_SID
  const TOKEN = process.env.TWILIO_AUTH_TOKEN
  if (!SID || !TOKEN) {
    return NextResponse.json(
      { error: 'Twilio not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN missing)' },
      { status: 503 },
    )
  }
  const smsWebhook =
    process.env.TWILIO_INBOUND_SMS_WEBHOOK ??
    `${process.env.PUBLIC_APP_ORIGIN ?? ''}/api/webhooks/twilio/sms`
  if (!smsWebhook.startsWith('https://')) {
    return NextResponse.json(
      {
        error:
          'Inbound SMS webhook URL not configured. Set TWILIO_INBOUND_SMS_WEBHOOK or PUBLIC_APP_ORIGIN.',
      },
      { status: 503 },
    )
  }

  const service = createServiceSupabase()

  // Confirm target user exists + isn't already provisioned
  const { data: target } = await service
    .from('user_profiles')
    .select('id, inbox_phone, email')
    .eq('id', userId)
    .maybeSingle()
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  if ((target as { inbox_phone?: string | null }).inbox_phone) {
    return NextResponse.json(
      { error: 'User already has an inbox_phone', current: (target as { inbox_phone?: string }).inbox_phone },
      { status: 409 },
    )
  }

  // 1) Search Twilio for an available US local number
  const searchParams = new URLSearchParams({ Limit: '5', SmsEnabled: 'true' })
  if (areaCode) searchParams.set('AreaCode', areaCode)
  const search = await twilioRequest<{
    available_phone_numbers?: TwilioNumber[]
  }>(SID, TOKEN, `/AvailablePhoneNumbers/US/Local.json?${searchParams.toString()}`)
  if (!search.ok) {
    return NextResponse.json(
      { error: 'Twilio search failed', detail: search.error },
      { status: 502 },
    )
  }
  const candidate = search.data?.available_phone_numbers?.[0]?.phone_number
  if (!candidate) {
    return NextResponse.json(
      { error: 'No available numbers from Twilio (try a different area code)' },
      { status: 502 },
    )
  }

  // 2) Buy it
  const purchaseBody = new URLSearchParams({
    PhoneNumber: candidate,
    SmsUrl: smsWebhook,
    SmsMethod: 'POST',
    FriendlyName: `myaircraft.us inbox for ${(target as { email?: string }).email ?? userId}`,
  })
  const buy = await twilioRequest<{ phone_number?: string; sid?: string }>(
    SID,
    TOKEN,
    `/IncomingPhoneNumbers.json`,
    { method: 'POST', body: purchaseBody },
  )
  if (!buy.ok || !buy.data?.phone_number) {
    return NextResponse.json(
      { error: 'Twilio purchase failed', detail: buy.error, candidate },
      { status: 502 },
    )
  }

  // 3) Persist on the user
  const { error: upErr } = await service
    .from('user_profiles')
    .update({ inbox_phone: buy.data.phone_number, updated_at: new Date().toISOString() })
    .eq('id', userId)
  if (upErr) {
    // Note: number was bought but write failed — admin will see it in
    // Twilio console and the next provision attempt will 409
    return NextResponse.json(
      {
        error: 'DB write failed but Twilio number was purchased — release manually if abandoned',
        purchased_number: buy.data.phone_number,
        detail: upErr.message,
      },
      { status: 500 },
    )
  }

  return NextResponse.json({
    ok: true,
    user_id: userId,
    inbox_phone: buy.data.phone_number,
    twilio_sid: buy.data.sid ?? null,
  })
}
