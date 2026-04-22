import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()

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
