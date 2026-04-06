import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

// GET /api/saved-parts?org=<id>&q=<search>
export async function GET(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const orgId = searchParams.get('org')
  const q = searchParams.get('q') ?? ''

  if (!orgId) return NextResponse.json({ error: 'org required' }, { status: 400 })

  let query = supabase
    .from('saved_parts')
    .select('id, part_number, description, vendor, unit_price, condition, category, use_count, last_used_at, created_at')
    .eq('organization_id', orgId)
    .order('use_count', { ascending: false })
    .limit(100)

  if (q) {
    query = query.or(`part_number.ilike.%${q}%,description.ilike.%${q}%,vendor.ilike.%${q}%`)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ parts: data ?? [] })
}
