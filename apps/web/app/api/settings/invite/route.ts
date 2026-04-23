import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import type { OrgRole } from '@/types'

const ADMIN_ROLES: OrgRole[] = ['owner', 'admin']

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['owner', 'admin', 'mechanic', 'pilot', 'viewer', 'auditor']),
})

export async function POST(req: NextRequest) {
  try {
    const ctx = await resolveRequestOrgContext(req)
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createServerSupabase()
    const user = ctx.user

    if (!ADMIN_ROLES.includes(ctx.role as OrgRole)) {
      return NextResponse.json(
        { error: 'Insufficient permissions. Admin or owner role required.' },
        { status: 403 }
      )
    }

    const orgId = ctx.organizationId

    // Parse body
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsed = inviteSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 422 }
      )
    }

    const { email, role } = parsed.data

    // Use service client for admin operations
    const serviceSupabase = createServiceSupabase()

    // 2. Check if user already has an account
    const { data: existingProfiles } = await serviceSupabase
      .from('user_profiles')
      .select('id, email')
      .eq('email', email)
      .limit(1)

    const existingProfile = existingProfiles?.[0] ?? null

    let status: 'invited' | 'added'

    if (existingProfile) {
      // 3a. Existing user: check if already a member of this org
      const { data: existingMembership } = await serviceSupabase
        .from('organization_memberships')
        .select('id, accepted_at')
        .eq('organization_id', orgId)
        .eq('user_id', existingProfile.id)
        .maybeSingle()

      if (existingMembership) {
        return NextResponse.json(
          { error: 'This user is already a member of the organization.' },
          { status: 409 }
        )
      }

      // Create membership record (pending — user must accept)
      const { error: membershipInsertError } = await serviceSupabase
        .from('organization_memberships')
        .insert({
          organization_id: orgId,
          user_id: existingProfile.id,
          role,
          invited_by: user.id,
          invited_at: new Date().toISOString(),
          // accepted_at is null — pending acceptance
        })

      if (membershipInsertError) {
        console.error('[settings/invite] membership insert error', membershipInsertError)
        return NextResponse.json({ error: 'Failed to create membership' }, { status: 500 })
      }

      status = 'added'
    } else {
      // 3b. New user: send invite email via Supabase auth admin
      const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL}/accept-invite?org=${orgId}&role=${role}`

      const { error: inviteError } = await serviceSupabase.auth.admin.inviteUserByEmail(email, {
        redirectTo,
        data: {
          invited_to_org: orgId,
          invited_role: role,
          invited_by: user.id,
        },
      })

      if (inviteError) {
        console.error('[settings/invite] invite error', inviteError)
        return NextResponse.json(
          { error: 'Failed to send invitation email' },
          { status: 500 }
        )
      }

      // We'll create the membership record when they accept via the invite link
      // For now, store a pending invitation record if the table exists
      // (graceful degradation — primary flow is via Supabase auth invite)
      try {
        await serviceSupabase.from('pending_invitations').insert({
          organization_id: orgId,
          email,
          role,
          invited_by: user.id,
          invited_at: new Date().toISOString(),
        })
      } catch {
        // Table may not exist yet — invitation email was still sent
      }

      status = 'invited'
    }

    // 4. Write audit log
    await supabase.from('audit_logs').insert({
      organization_id: orgId,
      actor_user_id: user.id,
      action: status === 'invited' ? 'member.invited' : 'member.added',
      target_type: 'user',
      target_id: existingProfile?.id ?? null,
      metadata: { email, role, status },
    })

    return NextResponse.json({ status }, { status: 200 })
  } catch (err) {
    console.error('[settings/invite POST] unexpected error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
