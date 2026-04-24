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
      const firstName = (customerName || '').split(' ')[0] || 'there'
      const logoUrl = 'https://www.myaircraft.us/redesign/MY_AIRCRAFT_LOGO.svg'

      const subject = `Welcome to myaircraft — ${fromParty} invited you`

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
    ${fromParty} invited you to myaircraft — coordinate maintenance, approvals, logbooks, and messages in one place. 30-day free trial, no card.
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td align="center" style="padding:0 0 20px;">
          <img src="${logoUrl}" alt="myaircraft" width="180" style="display:block;border:0;outline:none;max-width:180px;height:auto;" />
        </td></tr>
        <tr><td style="background:linear-gradient(135deg,#1e40af 0%,#3b82f6 100%);background-color:#1e40af;border-radius:16px 16px 0 0;padding:36px 32px;color:#ffffff;">
          <p style="margin:0 0 6px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#bfdbfe;font-weight:600;">
            You're invited
          </p>
          <h1 style="margin:0 0 10px;font-size:26px;line-height:1.25;font-weight:700;color:#ffffff;">
            Hi ${firstName} — welcome to myaircraft.
          </h1>
          <p style="margin:0;font-size:15px;line-height:1.55;color:#dbeafe;">
            ${fromParty} uses myaircraft to coordinate aircraft maintenance with owners like you. Accept this invite to get your own workspace — logbooks, approvals, invoices, and messages, all in one place.
          </p>
        </td></tr>
        <tr><td style="background:#ffffff;padding:32px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center" style="padding:0 0 28px;">
              <a href="${inviteUrl}" style="display:inline-block;padding:14px 36px;background:#1e40af;color:#ffffff;text-decoration:none;border-radius:10px;font-weight:600;font-size:15px;letter-spacing:0.01em;box-shadow:0 4px 12px rgba(30,64,175,0.25);">
                Claim your account
              </a>
              <p style="margin:14px 0 0;font-size:13px;color:#64748b;">
                30-day free trial &middot; No credit card required
              </p>
            </td></tr>
            <tr><td style="padding:4px 0 8px;">
              <p style="margin:0;font-size:13px;color:#475569;letter-spacing:0.08em;text-transform:uppercase;font-weight:600;">
                What you get
              </p>
            </td></tr>
            <tr><td style="padding:0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="40" valign="top" style="padding:12px 12px 0 0;">
                    <div style="width:36px;height:36px;border-radius:10px;background:#eff6ff;color:#1d4ed8;font-size:18px;line-height:36px;text-align:center;font-weight:700;">&#10003;</div>
                  </td>
                  <td valign="top" style="padding:12px 0 0;">
                    <p style="margin:0 0 2px;font-size:14px;font-weight:600;color:#0f172a;">Every answer, cited to the page</p>
                    <p style="margin:0;font-size:13px;color:#475569;line-height:1.5;">Ask your logbooks, POH, AFM, and maintenance records anything. Answers come back with the exact page reference.</p>
                  </td>
                </tr>
                <tr>
                  <td width="40" valign="top" style="padding:12px 12px 0 0;">
                    <div style="width:36px;height:36px;border-radius:10px;background:#ecfeff;color:#0e7490;font-size:18px;line-height:36px;text-align:center;font-weight:700;">&#9992;</div>
                  </td>
                  <td valign="top" style="padding:12px 0 0;">
                    <p style="margin:0 0 2px;font-size:14px;font-weight:600;color:#0f172a;">One place for your aircraft</p>
                    <p style="margin:0;font-size:13px;color:#475569;line-height:1.5;">Logbook entries, squawks, work orders, invoices, and estimates from ${fromParty} — approve or question each one in the same thread.</p>
                  </td>
                </tr>
                <tr>
                  <td width="40" valign="top" style="padding:12px 12px 0 0;">
                    <div style="width:36px;height:36px;border-radius:10px;background:#f0fdf4;color:#15803d;font-size:18px;line-height:36px;text-align:center;font-weight:700;">&#128274;</div>
                  </td>
                  <td valign="top" style="padding:12px 0 0;">
                    <p style="margin:0 0 2px;font-size:14px;font-weight:600;color:#0f172a;">Your records, your control</p>
                    <p style="margin:0;font-size:13px;color:#475569;line-height:1.5;">Everything stays in your own workspace. Export anything, revoke mechanic access any time.</p>
                  </td>
                </tr>
                <tr>
                  <td width="40" valign="top" style="padding:12px 12px 0 0;">
                    <div style="width:36px;height:36px;border-radius:10px;background:#fef3c7;color:#b45309;font-size:18px;line-height:36px;text-align:center;font-weight:700;">&#9733;</div>
                  </td>
                  <td valign="top" style="padding:12px 0 0;">
                    <p style="margin:0 0 2px;font-size:14px;font-weight:600;color:#0f172a;">Built for GA owners &amp; A&amp;Ps</p>
                    <p style="margin:0;font-size:13px;color:#475569;line-height:1.5;">FAA 337s, 8130s, ADs, SBs, annual and 100-hour cycles — recognised and organised automatically.</p>
                  </td>
                </tr>
              </table>
            </td></tr>
            <tr><td style="padding:28px 0 0;">
              <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.55;">
                Button not working?
                <a href="${inviteUrl}" style="color:#1d4ed8;text-decoration:none;font-weight:600;">Open your invite &rarr;</a>
              </p>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="background:#0f172a;border-radius:0 0 16px 16px;padding:24px 32px;text-align:center;color:#94a3b8;font-size:12px;line-height:1.6;">
          Questions? Reply to this email or reach us at
          <a href="mailto:info@myaircraft.us" style="color:#cbd5e1;text-decoration:none;">info@myaircraft.us</a>.<br />
          <span style="color:#64748b;">&copy; myaircraft.us &middot; Made for aircraft owners and the mechanics who keep them flying.</span>
        </td></tr>
      </table>
    </td></tr>
  </table>
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
