import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createServerSupabase()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: membership } = await supabase
      .from('organization_memberships')
      .select('organization_id')
      .eq('user_id', user.id)
      .not('accepted_at', 'is', null)
      .single()

    if (!membership) return NextResponse.json({ error: 'No organization found' }, { status: 404 })

    const { data: search, error } = await supabase
      .from('atlas_part_searches')
      .select('*')
      .eq('id', params.id)
      .eq('organization_id', membership.organization_id)
      .single()

    if (error || !search) return NextResponse.json({ error: 'Search not found' }, { status: 404 })

    const { data: offers } = await supabase
      .from('atlas_part_offers')
      .select('*')
      .eq('part_search_id', params.id)
      .order('rank_score', { ascending: false })

    return NextResponse.json({ ...search, offers: offers ?? [] })
  } catch (err) {
    console.error('[GET /api/parts/searches/[id]] unexpected error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
