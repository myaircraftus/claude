import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { ADMIN_AND_ABOVE } from '@/lib/roles'
const nodemailer = require('nodemailer')

export async function POST(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const user = ctx.user

  if (!ADMIN_AND_ABOVE.includes(ctx.role as any)) {
    return NextResponse.json({ error: 'Insufficient permissions — owner/admin required' }, { status: 403 })
  }

  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { mechanic_name, mechanic_email, mechanic_phone, estimate_id, aircraft_id } = body ?? {}
  if (!mechanic_name) {
    return NextResponse.json({ error: 'mechanic_name is required' }, { status: 422 })
  }
  if (!mechanic_email && !mechanic_phone) {
    return NextResponse.json({ error: 'At least one of mechanic_email or mechanic_phone is required' }, { status: 422 })
  }

  const orgId = ctx.organizationId
  const serviceSupabase = createServiceSupabase()

  // a. Try to find existing user by email
  let existingUserId: string | null = null
  let existingOrgId: string | null = null

  if (mechanic_email) {
    const { data: existingProfiles } = await serviceSupabase
      .from('user_profiles')
      .select('id, email, organization_memberships(organization_id, role)')
      .eq('email', mechanic_email.toLowerCase())
      .limit(1)

    const found = existingProfiles?.[0] ?? null
    if (found) {
      existingUserId = found.id
      const mem = Array.isArray(found.organization_memberships)
        ? found.organization_memberships[0]
        : null
      existingOrgId = mem?.organization_id ?? null
    }
  }

  const trialExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

  // b. Insert mechanic_invites record
  const { data: invite, error: insertError } = await serviceSupabase
    .from('mechanic_invites')
    .insert({
      invited_by_user_id: user.id,
      invited_by_org_id: orgId,
      estimate_id: estimate_id ?? null,
      aircraft_id: aircraft_id ?? null,
      mechanic_name,
      mechanic_email: mechanic_email ?? null,
      mechanic_phone: mechanic_phone ?? null,
      existing_user_id: existingUserId,
      existing_org_id: existingOrgId,
      trial_expires_at: existingUserId ? null : trialExpiresAt,
      status: 'sent',
    })
    .select()
    .single()

  if (insertError || !invite) {
    console.error('[mechanics/invite] insert error', insertError)
    return NextResponse.json({ error: insertError?.message ?? 'Failed to create invite' }, { status: 500 })
  }

  const inviteToken = invite.invite_token
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.myaircraft.us'
  const inviteUrl = `${appUrl}/accept-mechanic-invite?token=${inviteToken}`

  // c. Send email invite
  let emailSent = false
  if (mechanic_email && process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    try {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.GMAIL_USER,
          pass: process.env.GMAIL_APP_PASSWORD,
        },
      })

      const subject = existingUserId
        ? `You've been invited to review an estimate on myaircraft.us`
        : `You've been invited to join myaircraft.us — free 30-day trial`

      const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:32px 16px;">
    <div style="background:white;border-radius:8px;border:1px solid #e5e7eb;overflow:hidden;">
      <div style="padding:24px;border-bottom:1px solid #e5e7eb;">
        <h1 style="margin:0;font-size:20px;color:#111827;">You're invited, ${mechanic_name}</h1>
        <p style="margin:4px 0 0;font-size:14px;color:#6b7280;">via myaircraft.us</p>
      </div>
      <div style="padding:24px;">
        <p style="font-size:14px;color:#374151;">
          ${existingUserId
            ? 'An aircraft owner has shared an estimate or work request with you through myaircraft.us.'
            : 'An aircraft owner has invited you to view an estimate or work request. Accept to get a <strong>free 30-day trial</strong> of myaircraft.us — no credit card required.'}
        </p>
        <div style="text-align:center;margin:24px 0;">
          <a href="${inviteUrl}" style="display:inline-block;padding:12px 32px;background-color:#3b82f6;color:white;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;">
            ${existingUserId ? 'View Estimate' : 'Accept Invite &amp; Start Free Trial'}
          </a>
        </div>
        <p style="font-size:12px;color:#9ca3af;text-align:center;">
          Or copy this link: ${inviteUrl}
        </p>
      </div>
    </div>
    <p style="text-align:center;margin-top:24px;font-size:12px;color:#9ca3af;">Sent via myaircraft.us</p>
  </div>
</body>
</html>`

      await transporter.sendMail({
        from: `"myaircraft.us" <${process.env.GMAIL_USER}>`,
        to: mechanic_email,
        subject,
        html,
      })

      await serviceSupabase
        .from('mechanic_invites')
        .update({ email_sent_at: new Date().toISOString() })
        .eq('id', invite.id)

      emailSent = true
    } catch (emailErr: any) {
      console.error('[mechanics/invite] email error', emailErr)
      // Non-fatal — invite row was still created
    }
  }

  // d. SMS: log as "would send" — Twilio not yet configured
  const smsSent = false
  if (mechanic_phone) {
    console.log(`[mechanics/invite] SMS would send to ${mechanic_phone}: ${inviteUrl}`)
    // TODO: wire Twilio here when TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM_NUMBER are set
  }

  // e. Audit log (best-effort)
  const { error: auditErr } = await supabase.from('audit_logs').insert({
    organization_id: orgId,
    user_id: user.id,
    action: 'mechanic.invited',
    entity_type: 'mechanic_invite',
    entity_id: invite.id,
    metadata_json: {
      mechanic_name,
      mechanic_email: mechanic_email ?? null,
      mechanic_phone: mechanic_phone ?? null,
      existing_user: !!existingUserId,
      email_sent: emailSent,
    },
  })
  if (auditErr) console.warn('[audit] mechanic.invited insert failed', auditErr.message)

  return NextResponse.json({
    invite_id: invite.id,
    invite_token: inviteToken,
    invite_url: inviteUrl,
    email_sent: emailSent,
    sms_sent: smsSent,
    existing_user: !!existingUserId,
    trial_expires_at: existingUserId ? null : trialExpiresAt,
  }, { status: 201 })
}
