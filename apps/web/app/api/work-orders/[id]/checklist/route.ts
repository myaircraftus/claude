import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveRequestOrgContext(_req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const orgId = ctx.organizationId

  const { data, error } = await supabase
    .from('work_order_checklist_items')
    .select(`
      id,
      template_key,
      template_label,
      section,
      item_key,
      item_label,
      item_description,
      source,
      source_reference,
      required,
      completed,
      completed_at,
      completed_by,
      sort_order
    `)
    .eq('organization_id', orgId)
    .eq('work_order_id', params.id)
    .order('sort_order', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ items: data ?? [] })
}
