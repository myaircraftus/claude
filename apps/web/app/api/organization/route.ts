import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

export async function GET(_req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: memberships } = await supabase
    .from('organization_memberships')
    .select(`
      organization_id,
      role,
      organizations (
        id,
        name,
        plan,
        logo_url,
        business_email,
        business_phone,
        website_url,
        company_address,
        invoice_footer,
        estimate_terms,
        work_order_terms,
        checklist_templates
      )
    `)
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .order('accepted_at', { ascending: false })
    .limit(1)

  const membership = memberships?.[0] ?? null
  if (!membership) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  return NextResponse.json({
    organization_id: membership.organization_id,
    role: membership.role,
    organization: membership.organizations,
  })
}

export async function PATCH(req: NextRequest) {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()

  if (!membership) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  if (!['owner', 'admin', 'mechanic'].includes(membership.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const allowedFields = [
    'name',
    'logo_url',
    'business_email',
    'business_phone',
    'website_url',
    'company_address',
    'invoice_footer',
    'estimate_terms',
    'work_order_terms',
    'checklist_templates',
  ] as const

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  for (const field of allowedFields) {
    if (field in body) {
      updates[field] = body[field]
    }
  }

  const { data, error } = await supabase
    .from('organizations')
    .update(updates)
    .eq('id', membership.organization_id)
    .select(`
      id,
      name,
      plan,
      logo_url,
      business_email,
      business_phone,
      website_url,
      company_address,
      invoice_footer,
      estimate_terms,
      work_order_terms,
      checklist_templates
    `)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ organization: data })
}
