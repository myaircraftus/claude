import { NextRequest, NextResponse } from 'next/server'
import { cookies, headers } from 'next/headers'
import { createServerSupabase } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

interface OrganizationRecord {
  id: string
  slug?: string | null
}

interface MembershipRecord {
  organization_id: string
  role: string
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

export async function GET(req: NextRequest) {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const requestedOrgId = getRequestedOrganizationId()
  const requestedOrgSlug = getRequestedOrganizationSlug()

  const { data: memberships } = await supabase
    .from('organization_memberships')
    .select('organization_id, role, organizations(*)')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .limit(25)

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

  if (!membership) {
    return NextResponse.json({ error: 'No organization' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const rawIds = [
    ...searchParams.getAll('id'),
    ...searchParams
      .getAll('ids')
      .flatMap((value) => value.split(','))
      .map((value) => value.trim()),
  ]
  const ids = [...new Set(rawIds.filter(Boolean))].slice(0, 100)

  if (ids.length === 0) {
    return NextResponse.json(
      { documents: [] },
      {
        headers: {
          'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
        },
      }
    )
  }

  const { data, error } = await supabase
    .from('documents')
    .select('id, parsing_status, processing_state, parse_error')
    .eq('organization_id', membership.organization_id)
    .in('id', ids)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(
    { documents: data ?? [] },
    {
      headers: {
        'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
      },
    }
  )
}
