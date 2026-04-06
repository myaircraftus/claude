import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabase } from '@/lib/supabase/server'

const createOrgSchema = z.object({
  name: z.string().min(2).max(80),
  slug: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/, 'Slug may only contain lowercase letters, numbers and hyphens'),
})

export async function POST(req: NextRequest) {
  try {
    // 1. Auth check
    const supabase = createServerSupabase()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. Parse + validate body
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const parsed = createOrgSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 422 }
      )
    }

    const { name, slug } = parsed.data

    // 3. Check slug uniqueness
    const { data: existing, error: slugError } = await supabase
      .from('organizations')
      .select('id')
      .eq('slug', slug)
      .maybeSingle()

    if (slugError) {
      console.error('[organizations POST] slug check error', slugError)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    if (existing) {
      return NextResponse.json(
        { error: 'That slug is already taken. Please choose a different one.' },
        { status: 409 }
      )
    }

    // 4. Insert organization
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert({
        name,
        slug,
        plan: 'starter',
        plan_aircraft_limit: 3,
        plan_storage_gb: 5,
        plan_queries_monthly: 100,
        queries_used_this_month: 0,
        queries_reset_at: new Date().toISOString(),
      })
      .select('id, name, slug')
      .single()

    if (orgError || !org) {
      console.error('[organizations POST] insert error', orgError)
      return NextResponse.json({ error: 'Failed to create organization' }, { status: 500 })
    }

    // 5. Insert owner membership
    const { error: membershipError } = await supabase
      .from('organization_memberships')
      .insert({
        organization_id: org.id,
        user_id: user.id,
        role: 'owner',
        invited_at: new Date().toISOString(),
        accepted_at: new Date().toISOString(),
      })

    if (membershipError) {
      console.error('[organizations POST] membership insert error', membershipError)
      // Roll back: delete the org we just created
      await supabase.from('organizations').delete().eq('id', org.id)
      return NextResponse.json({ error: 'Failed to set up organization membership' }, { status: 500 })
    }

    // 6. Audit log
    await supabase.from('audit_logs').insert({
      organization_id: org.id,
      actor_user_id: user.id,
      action: 'organization.created',
      target_type: 'organization',
      target_id: org.id,
      metadata: { name, slug },
    })

    // 7. Return created org
    return NextResponse.json({ id: org.id, name: org.name, slug: org.slug }, { status: 201 })
  } catch (err) {
    console.error('[organizations POST] unexpected error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
