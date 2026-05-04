/**
 * /api/org/info  (Spec 6.2)
 *
 *   GET → org row (name, type, home base, logo, contact email, billing email)
 *   PUT → owner+admin only update of those fields
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const WRITE_ROLES = new Set(['owner', 'admin'])

interface PutBody {
  name?: string
  org_type?: string
  home_base?: string | null
  logo_url?: string | null
  billing_email?: string | null
}

export async function GET() {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_memberships').select('organization_id')
    .eq('user_id', user.id).not('accepted_at', 'is', null).single()
  if (!membership) return NextResponse.json({ error: 'No org' }, { status: 403 })

  const { data: org } = await supabase
    .from('organizations')
    .select('id, name, slug, plan, org_type, home_base, billing_email, logo_url, created_at, updated_at')
    .eq('id', membership.organization_id).maybeSingle()
  return NextResponse.json({ organization: org ?? null })
}

export async function PUT(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_memberships').select('organization_id, role')
    .eq('user_id', user.id).not('accepted_at', 'is', null).single()
  if (!membership) return NextResponse.json({ error: 'No org' }, { status: 403 })
  if (!WRITE_ROLES.has(membership.role)) return NextResponse.json({ error: 'Owner/admin only' }, { status: 403 })

  let body: PutBody
  try { body = (await req.json()) as PutBody } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const patch: Record<string, unknown> = {}
  if (typeof body.name === 'string' && body.name.trim().length > 0) patch.name = body.name.trim().slice(0, 200)
  if (typeof body.org_type === 'string') patch.org_type = body.org_type
  if (body.home_base !== undefined) patch.home_base = typeof body.home_base === 'string' ? body.home_base.toUpperCase().slice(0, 8) : null
  if (body.logo_url !== undefined) patch.logo_url = body.logo_url
  if (body.billing_email !== undefined) patch.billing_email = body.billing_email
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 })

  const { data, error } = await supabase
    .from('organizations').update(patch).eq('id', membership.organization_id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ organization: data })
}
