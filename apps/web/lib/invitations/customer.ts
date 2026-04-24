import { createServiceSupabase } from '@/lib/supabase/server'

const nodemailer = require('nodemailer')

interface InviteCustomerArgs {
  customerId: string
  customerName: string
  customerEmail: string
  invitedByOrgId: string
  invitedByUserId: string
  inviterDisplayName?: string | null
  orgDisplayName?: string | null
}

interface InviteCustomerResult {
  invitationId: string | null
  inviteToken: string | null
  inviteUrl: string | null
  emailSent: boolean
  reused: boolean
  skipped?: string
  error?: string
}

export async function inviteCustomerOwner(args: InviteCustomerArgs): Promise<InviteCustomerResult> {
  const { customerId, customerName, customerEmail, invitedByOrgId, invitedByUserId } = args
  const email = (customerEmail ?? '').trim().toLowerCase()

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return {
      invitationId: null,
      inviteToken: null,
      inviteUrl: null,
      emailSent: false,
      reused: false,
      skipped: 'invalid-email',
    }
  }

  const service = createServiceSupabase()

  const { data: existing } = await service
    .from('customer_invitations')
    .select('id, invite_token, status, email_sent_at')
    .eq('customer_id', customerId)
    .in('status', ['pending', 'sent'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let invitationId: string | null = existing?.id ?? null
  let inviteToken: string | null = existing?.invite_token ?? null
  let reused = !!existing

  if (!existing) {
    const { data: inserted, error: insertErr } = await service
      .from('customer_invitations')
      .insert({
        invited_by_org_id: invitedByOrgId,
        invited_by_user_id: invitedByUserId,
        customer_id: customerId,
        email,
        name: customerName,
        status: 'pending',
      })
      .select('id, invite_token')
      .single()

    if (insertErr || !inserted) {
      console.error('[invite/customer] insert error', insertErr)
      return {
        invitationId: null,
        inviteToken: null,
        inviteUrl: null,
        emailSent: false,
        reused: false,
        error: insertErr?.message ?? 'insert-failed',
      }
    }

    invitationId = inserted.id
    inviteToken = inserted.invite_token
  }

  if (!inviteToken) {
    return {
      invitationId,
      inviteToken: null,
      inviteUrl: null,
      emailSent: false,
      reused,
      error: 'missing-token',
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.myaircraft.us'
  const inviteUrl = `${appUrl}/signup?invite=${inviteToken}`

  let emailSent = false
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    try {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.GMAIL_USER,
          pass: process.env.GMAIL_APP_PASSWORD,
        },
      })

      const inviterName = (args.inviterDisplayName ?? '').trim()
      const orgName = (args.orgDisplayName ?? '').trim()
      const fromParty = orgName || inviterName || 'Your maintenance shop'

      const subject = `${fromParty} invited you to coordinate your aircraft on myaircraft.us`

      const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:32px 16px;">
    <div style="background:white;border-radius:8px;border:1px solid #e5e7eb;overflow:hidden;">
      <div style="padding:24px;border-bottom:1px solid #e5e7eb;">
        <h1 style="margin:0;font-size:20px;color:#111827;">Hi ${customerName || 'there'},</h1>
        <p style="margin:6px 0 0;font-size:14px;color:#6b7280;">You have been invited to myaircraft.us by ${fromParty}.</p>
      </div>
      <div style="padding:24px;">
        <p style="font-size:14px;color:#374151;line-height:1.55;">
          This is where your aircraft coordination with your mechanic happens — see approvals, invoices, logbook entries, squawks, and messages in one place.
        </p>
        <p style="font-size:14px;color:#374151;line-height:1.55;">
          Click below to claim your account and start a <strong>30-day free trial</strong>. No credit card required.
        </p>
        <div style="text-align:center;margin:24px 0;">
          <a href="${inviteUrl}" style="display:inline-block;padding:12px 32px;background-color:#3b82f6;color:white;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;">
            Claim your account
          </a>
        </div>
        <p style="font-size:12px;color:#9ca3af;text-align:center;">
          Or copy this link: ${inviteUrl}
        </p>
      </div>
    </div>
    <p style="text-align:center;margin-top:24px;font-size:12px;color:#9ca3af;">
      Questions? <a href="mailto:info@myaircraft.us" style="color:#6b7280;">info@myaircraft.us</a>
    </p>
  </div>
</body>
</html>`

      await transporter.sendMail({
        from: `"myaircraft.us" <${process.env.GMAIL_USER}>`,
        to: email,
        subject,
        html,
      })

      await service
        .from('customer_invitations')
        .update({ status: 'sent', email_sent_at: new Date().toISOString() })
        .eq('id', invitationId)

      emailSent = true
    } catch (emailErr: any) {
      console.error('[invite/customer] email error', emailErr)
    }
  } else {
    console.log(`[invite/customer] GMAIL not configured — would send invite to ${email}: ${inviteUrl}`)
  }

  return {
    invitationId,
    inviteToken,
    inviteUrl,
    emailSent,
    reused,
  }
}
