import { NextRequest, NextResponse } from 'next/server'
import { cookies, headers } from 'next/headers'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { inviteCustomerOwner } from '@/lib/invitations/customer'
import { BillingBlockedError, requireActiveBilling } from '@/lib/billing/gate'

interface OrganizationRecord {
  id: string
  slug?: string | null
}

interface MembershipRecord {
  organization_id: string
  organizations?: OrganizationRecord | OrganizationRecord[] | null
}

function normalizeOrganizationRecord(
  value: MembershipRecord['organizations']
): OrganizationRecord | null {
  if (!value) return null
  if (Array.isArray(value)) return (value[0] as OrganizationRecord | undefined) ?? null
  return value as OrganizationRecord
}

function getRequestedOrganizationId(): string | null {
  const headerStore = headers()
  const cookieStore = cookies()
  return (
    headerStore.get('x-organization-id') ||
    headerStore.get('x-org-id') ||
    cookieStore.get('active_organization_id')?.value ||
    cookieStore.get('organization_id')?.value ||
    null
  )
}

function getRequestedOrganizationSlug(): string | null {
  const headerStore = headers()
  const cookieStore = cookies()
  return (
    headerStore.get('x-organization-slug') ||
    headerStore.get('x-org-slug') ||
    cookieStore.get('active_organization_slug')?.value ||
    null
  )
}

async function resolveOrganizationId(
  supabase: ReturnType<typeof createServerSupabase>,
  userId: string
) {
  const requestedOrgId = getRequestedOrganizationId()
  const requestedOrgSlug = getRequestedOrganizationSlug()

  const { data: memberships, error } = await supabase
    .from('organization_memberships')
    .select('organization_id, organizations(*)')
    .eq('user_id', userId)
    .not('accepted_at', 'is', null)
    .limit(25)

  if (error) {
    return { organizationId: null as string | null, error }
  }

  const membership =
    ((memberships ?? []) as MembershipRecord[]).find(
      (entry) => requestedOrgId && entry.organization_id === requestedOrgId
    ) ??
    ((memberships ?? []) as MembershipRecord[]).find((entry) => {
      if (!requestedOrgSlug) return false
      return normalizeOrganizationRecord(entry.organizations)?.slug === requestedOrgSlug
    }) ??
    ((memberships ?? []) as MembershipRecord[])[0] ??
    null

  return { organizationId: membership?.organization_id ?? null, error: null }
}

function normalizeCustomerText(value?: string | null) {
  return (value ?? '')
    .toLowerCase()
    .replace(/\b(inc|llc|corp|corporation|company|co)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export async function GET(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { organizationId, error: orgError } = await resolveOrganizationId(supabase, user.id)
  if (orgError) return NextResponse.json({ error: orgError.message }, { status: 500 })
  if (!organizationId) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search') ?? ''
  const limit = parseInt(searchParams.get('limit') ?? '100', 10)
  const offset = parseInt(searchParams.get('offset') ?? '0', 10)

  // DB column is preferred_communication; expose as preferred_contact for UI compat.
  let query = supabase
    .from('customers')
    .select(`
      id, name, company, email, phone, secondary_email, secondary_phone,
      billing_address, notes,
      preferred_contact:preferred_communication,
      tags, portal_access,
      imported_at, import_source, created_at, updated_at,
      aircraft_customer_assignments (
        id, aircraft_id, relationship, is_primary,
        aircraft:aircraft_id (id, tail_number, make, model)
      )
    `, { count: 'exact' })
    .eq('organization_id', organizationId)
    .order('name', { ascending: true })
    .range(offset, offset + limit - 1)

  if (search) {
    query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%,company.ilike.%${search}%`)
  }

  const { data, count, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ customers: data ?? [], total: count ?? 0 })
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { organizationId, error: orgError } = await resolveOrganizationId(supabase, user.id)
  if (orgError) return NextResponse.json({ error: orgError.message }, { status: 500 })
  if (!organizationId) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  try {
    await requireActiveBilling(organizationId, 'mechanic')
  } catch (err) {
    if (err instanceof BillingBlockedError) {
      return NextResponse.json({ error: err.message, billing: err.status }, { status: 402 })
    }
    throw err
  }

  const body = await req.json()

  if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  const normalizedName = normalizeCustomerText(body.name)
  const normalizedEmail = normalizeCustomerText(body.email)
  const normalizedCompany = normalizeCustomerText(body.company)

  const { data: existingCustomers, error: existingError } = await supabase
    .from('customers')
    .select('id, name, company, email, phone, billing_address, notes, tags, secondary_email, secondary_phone')
    .eq('organization_id', organizationId)
    .limit(250)

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 })
  }

  const existing = (existingCustomers ?? []).find((customer) => {
    const customerName = normalizeCustomerText(customer.name)
    const customerEmail = normalizeCustomerText(customer.email)
    const customerCompany = normalizeCustomerText(customer.company)

    if (normalizedEmail && customerEmail && normalizedEmail === customerEmail) return true
    if (normalizedName && customerName && normalizedName === customerName) return true
    if (normalizedCompany && customerCompany && normalizedCompany === customerCompany) return true
    return false
  })

  if (existing) {
    return NextResponse.json(existing, { status: 200 })
  }

  const { data, error } = await supabase
    .from('customers')
    .insert({
      organization_id: organizationId,
      name: body.name.trim(),
      company: body.company?.trim() || null,
      email: body.email?.trim() || null,
      phone: body.phone?.trim() || null,
      billing_address: body.billing_address ?? null,
      notes: body.notes?.trim() || null,
      tags: body.tags ?? null,
      secondary_email: body.secondary_email?.trim() || null,
      secondary_phone: body.secondary_phone?.trim() || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Auto-invite the owner to coordinate on myaircraft — fire-and-forget, never blocks the response
  const customerEmail = (body.email ?? '').trim()
  if (customerEmail && data?.id) {
    const service = createServiceSupabase()
    const [{ data: orgRow }, { data: profileRow }] = await Promise.all([
      service.from('organizations').select('name').eq('id', organizationId).maybeSingle(),
      service.from('user_profiles').select('full_name').eq('id', user.id).maybeSingle(),
    ])

    inviteCustomerOwner({
      customerId: data.id,
      customerName: data.name ?? body.name.trim(),
      customerEmail,
      invitedByOrgId: organizationId,
      invitedByUserId: user.id,
      orgDisplayName: orgRow?.name ?? null,
      inviterDisplayName: profileRow?.full_name ?? null,
    }).catch((err) => {
      console.error('[customers.POST] auto-invite failed', err)
    })
  }

  return NextResponse.json(data, { status: 201 })
}
