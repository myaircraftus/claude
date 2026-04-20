import { NextRequest, NextResponse } from 'next/server'
import { reconcileOrganizationStaleDocuments } from '@/lib/documents/processing-health'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()
  if (!membership) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const aircraft_id = searchParams.get('aircraft_id')
  const status = searchParams.get('status')
  const limit = parseInt(searchParams.get('limit') ?? '100', 10)
  const offset = parseInt(searchParams.get('offset') ?? '0', 10)

  await reconcileOrganizationStaleDocuments(createServiceSupabase(), membership.organization_id)

  let query = supabase
    .from('documents')
    .select(
      `
      id, title, doc_type, document_group_id, document_detail_id, record_family,
      truth_role, parsing_status, parse_error, page_count, file_size_bytes,
      uploaded_at:created_at, aircraft_id,
      aircraft:aircraft_id (id, tail_number, make, model)
    `,
      { count: 'exact' }
    )
    .eq('organization_id', membership.organization_id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (aircraft_id) query = query.eq('aircraft_id', aircraft_id)
  if (status) query = query.eq('parsing_status', status)

  const { data, count, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(
    { documents: data ?? [], total: count ?? 0 },
    {
      headers: {
        'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
      },
    }
  )
}
