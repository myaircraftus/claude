/**
 * POST /api/approval-requests/[id]/send (Spec 1.5)
 *
 * Marks the approval request as sent: status='sent', sent_date=now.
 * Returns the public_token + a fully-qualified public URL the operator
 * can paste into an email or text. Real email delivery via SendGrid is
 * a logged follow-up (matches Sprint 0d's email adapter TODO).
 *
 * Mechanic+ only.
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import { MECHANIC_AND_ABOVE } from '@/lib/roles'
import { sendNotification } from '@/lib/notifications/dispatch'
import { regenerateForApprovalRequest } from '../regenerate-explanations/route'
import type { OrgRole } from '@/types'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!MECHANIC_AND_ABOVE.includes(ctx.role as OrgRole)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const supabase = createServerSupabase()

  const { data: existing } = await supabase
    .from('approval_requests')
    .select('id, status, public_token, customer_id, subject')
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle()
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Re-sending after partially-responded / completed is allowed (re-prompt).
  // We don't reset line-item responses — those stay intact.
  const { data, error } = await supabase
    .from('approval_requests')
    .update({
      status: 'sent',
      sent_date: new Date().toISOString(),
    })
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)
    .select('*')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Spec 5.6 cross-wire: kick off plain-English explanation generation in
  // the background. Don't block the send response — explanations land in
  // <30s and the customer view falls back to operator's description until
  // they arrive. ANTHROPIC_API_KEY missing → silent skip.
  void regenerateForApprovalRequest({
    organization_id: ctx.organizationId,
    user_id: ctx.user.id,
    approval_request_id: params.id,
    force: false,
  }).catch((e) => console.warn('[approvals/send] explainer background error:', e))

  // Cross-wire to Sprint 0d: notify the operator's org that an approval
  // is out (in-app only — email-to-customer is a separate, future
  // SendGrid integration).
  sendNotification(supabase, {
    organization_id: ctx.organizationId,
    user_id: 'all-org-members',
    category: 'approval',
    title: 'Approval request sent',
    body: `${(existing as { subject: string | null }).subject ?? 'Approval request'} is now awaiting customer response.`,
    link: `/approvals/${params.id}`,
    source_kind: 'approval_request',
    source_id: params.id,
  }).catch((e) => console.warn('[approvals/send] notify failed:', e))

  // Build the public URL. Falls back to relative path if the env var
  // isn't set (caller can compose host themselves).
  const origin =
    process.env.NEXT_PUBLIC_APP_URL ??
    req.nextUrl.origin
  const publicUrl = `${origin}/approve/${(data as { public_token: string }).public_token}`

  return NextResponse.json({
    ok: true,
    request: data,
    public_url: publicUrl,
  })
}
