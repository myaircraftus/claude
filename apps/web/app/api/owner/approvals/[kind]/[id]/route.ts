import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'

type Kind = 'estimate' | 'work_order'
type Action = 'approve' | 'reject'

const TABLE_BY_KIND: Record<Kind, string> = {
  estimate: 'estimates',
  work_order: 'work_orders',
}

const TRANSITIONS: Record<Kind, Record<Action, { from: string[]; to: string }>> = {
  estimate: {
    approve: { from: ['sent', 'awaiting_approval', 'draft'], to: 'approved' },
    reject: { from: ['sent', 'awaiting_approval', 'draft', 'approved'], to: 'rejected' },
  },
  work_order: {
    approve: { from: ['ready_for_signoff', 'open', 'in_progress'], to: 'signed_off' },
    reject: { from: ['ready_for_signoff', 'open', 'in_progress'], to: 'disputed' },
  },
}

function isKind(value: string): value is Kind {
  return value === 'estimate' || value === 'work_order'
}

function isAction(value: unknown): value is Action {
  return value === 'approve' || value === 'reject'
}

export async function POST(
  req: NextRequest,
  { params }: { params: { kind: string; id: string } }
) {
  if (!isKind(params.kind)) {
    return NextResponse.json({ error: 'Invalid kind' }, { status: 400 })
  }
  const kind: Kind = params.kind

  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as { action?: unknown }
  if (!isAction(body.action)) {
    return NextResponse.json({ error: 'action must be approve or reject' }, { status: 400 })
  }
  const action: Action = body.action

  const service = createServiceSupabase()
  const table = TABLE_BY_KIND[kind]

  const { data: item, error: itemErr } = await service
    .from(table)
    .select('id, status, customer_id, organization_id')
    .eq('id', params.id)
    .maybeSingle()

  if (itemErr || !item) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (!item.customer_id) {
    return NextResponse.json({ error: 'No customer linked to this record' }, { status: 409 })
  }

  const { data: customer } = await service
    .from('customers')
    .select('id, portal_user_id, portal_access')
    .eq('id', item.customer_id)
    .maybeSingle()

  if (!customer || customer.portal_user_id !== user.id || !customer.portal_access) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const transition = TRANSITIONS[kind][action]
  if (!transition.from.includes(item.status ?? '')) {
    return NextResponse.json(
      { error: `Cannot ${action} from status "${item.status}"` },
      { status: 409 }
    )
  }

  const { data: updated, error: updateErr } = await service
    .from(table)
    .update({ status: transition.to, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .select('id, status')
    .single()

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  await service.from('audit_logs').insert({
    organization_id: item.organization_id,
    user_id: user.id,
    action: `owner.${kind}.${action === 'approve' ? 'approved' : 'rejected'}`,
    entity_type: params.kind,
    entity_id: params.id,
    metadata_json: { previous_status: item.status, new_status: transition.to },
  })

  return NextResponse.json({ id: updated.id, status: updated.status })
}
