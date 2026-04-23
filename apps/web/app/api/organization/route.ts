import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req, { includeOrganization: true })
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  let organization = ctx.organization as any
  if (!organization) {
    const { data } = await supabase
      .from('organizations')
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
      .eq('id', ctx.organizationId)
      .single()
    organization = data ?? null
  }
  if (!organization) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  return NextResponse.json({
    organization_id: ctx.organizationId,
    role: ctx.role,
    organization,
  })
}

export async function PATCH(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  if (!['owner', 'admin', 'mechanic'].includes(ctx.role)) {
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
    .eq('id', ctx.organizationId)
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
