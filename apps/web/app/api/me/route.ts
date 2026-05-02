import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

export async function GET(_req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [profileRes, membershipRes] = await Promise.all([
    supabase
      .from('user_profiles')
      .select('id, email, full_name, avatar_url, job_title, is_platform_admin, handle, persona')
      .eq('id', user.id)
      .single(),
    supabase
      .from('organization_memberships')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .not('accepted_at', 'is', null)
      .single(),
  ])

  const profile = profileRes.data
  const membership = membershipRes.data

  return NextResponse.json({
    user,
    profile,
    membership,
    organization_id: membership?.organization_id ?? null,
    role: membership?.role ?? null,
  })
}

export async function PATCH(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const updates: Record<string, string | null> = {}
  if (typeof body.full_name === 'string') {
    const trimmed = body.full_name.trim()
    updates.full_name = trimmed.length > 0 ? trimmed : null
  }
  if (typeof body.job_title === 'string') {
    const trimmed = body.job_title.trim()
    updates.job_title = trimmed.length > 0 ? trimmed : null
  }
  if (typeof body.avatar_url === 'string') {
    const trimmed = body.avatar_url.trim()
    updates.avatar_url = trimmed.length > 0 ? trimmed : null
  }
  if (typeof body.handle === 'string') {
    const normalized = body.handle.trim().toLowerCase()
    if (normalized.length > 0) {
      if (!/^[a-z0-9][a-z0-9-]{2,31}$/.test(normalized)) {
        return NextResponse.json(
          { error: 'Handle must be 3-32 chars, lowercase letters, numbers, or dashes.' },
          { status: 400 }
        )
      }
      const { data: taken } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('handle', normalized)
        .neq('id', user.id)
        .maybeSingle()
      if (taken) {
        return NextResponse.json({ error: 'Handle is already taken.' }, { status: 409 })
      }
      updates.handle = normalized
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('user_profiles')
    .update(updates)
    .eq('id', user.id)
    .select('id, email, full_name, avatar_url, job_title, is_platform_admin, handle, persona')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ profile: data })
}
