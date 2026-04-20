import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

async function getOrgMembership(
  supabase: ReturnType<typeof createServerSupabase>,
  userId: string
) {
  const { data } = await supabase
    .from('organization_memberships')
    .select('organization_id, role')
    .eq('user_id', userId)
    .not('accepted_at', 'is', null)
    .single()

  return data ?? null
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; checklistId: string } }
) {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const membership = await getOrgMembership(supabase, user.id)
  if (!membership) return NextResponse.json({ error: 'No organization' }, { status: 403 })
  if (!['owner', 'admin', 'mechanic'].includes(membership.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const completed = body.completed === true

  const { data, error } = await supabase
    .from('work_order_checklist_items')
    .update({
      completed,
      completed_at: completed ? new Date().toISOString() : null,
      completed_by: completed ? user.id : null,
      updated_at: new Date().toISOString(),
    })
    .eq('organization_id', membership.organization_id)
    .eq('work_order_id', params.id)
    .eq('id', params.checklistId)
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
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ item: data })
}
