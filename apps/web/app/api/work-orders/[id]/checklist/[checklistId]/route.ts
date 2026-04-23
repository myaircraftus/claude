import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; checklistId: string } }
) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const orgId = ctx.organizationId
  if (!['owner', 'admin', 'mechanic'].includes(ctx.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const completed = body.completed === true

  const { data, error } = await supabase
    .from('work_order_checklist_items')
    .update({
      completed,
      completed_at: completed ? new Date().toISOString() : null,
      completed_by: completed ? ctx.user.id : null,
      updated_at: new Date().toISOString(),
    })
    .eq('organization_id', orgId)
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
