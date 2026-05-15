import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import { buildClassificationPatch } from '@/lib/taxonomy/format'

const WRITE_ROLES = new Set(['owner', 'admin', 'mechanic'])

const dueItemSchema = z.object({
  title: z.string().min(1).max(180),
  description: z.string().max(4000).optional().nullable(),
  status: z.enum(['overdue', 'due_now', 'due_soon', 'upcoming', 'complied', 'deferred', 'not_applicable', 'needs_review']).default('needs_review'),
  ata_code: z.string().max(2).optional().nullable(),
  jasc_code: z.string().max(4).optional().nullable(),
  business_category: z.string().max(120).optional().nullable(),
  source_type: z.enum(['ai', 'manual', 'maintenance_program', 'ad', 'sb', 'manufacturer', 'shop_template', 'work_order', 'owner_reminder', 'imported_record']).default('manual'),
  source_reference: z.string().max(180).optional().nullable(),
  due_basis: z.enum(['calendar', 'tach', 'hobbs', 'total_time', 'cycles', 'event', 'mixed']).default('calendar'),
  next_due_date: z.string().optional().nullable(),
  next_due_tach: z.number().min(0).optional().nullable(),
  next_due_hobbs: z.number().min(0).optional().nullable(),
  next_due_total_time: z.number().min(0).optional().nullable(),
  next_due_cycles: z.number().int().min(0).optional().nullable(),
  forecast_due_date: z.string().optional().nullable(),
  confidence: z.enum(['high', 'medium', 'low', 'unknown', 'needs_review']).default('unknown'),
  owner_visible: z.boolean().optional(),
  review_state: z.enum(['suggested', 'draft', 'needs_review', 'accepted', 'rejected', 'superseded']).default('needs_review'),
  classification_source: z.enum(['manual', 'suggested', 'template', 'imported', 'ai', 'unknown']).optional().nullable(),
  classification_confidence: z.enum(['high', 'medium', 'low', 'unknown']).optional().nullable(),
  classification_status: z.enum(['classified', 'suggested', 'needs_review', 'unclassified', 'not_applicable']).optional(),
})

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const status = req.nextUrl.searchParams.get('status')
  const supabase = createServerSupabase()
  let query = supabase
    .from('aircraft_due_items')
    .select('*')
    .eq('organization_id', ctx.organizationId)
    .eq('aircraft_id', params.id)
    .is('deleted_at', null)
    .order('next_due_date', { ascending: true, nullsFirst: false })
    .limit(250)

  if (status) query = query.in('status', status.split(',').map((item) => item.trim()).filter(Boolean))

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ due_items: data ?? [] })
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!WRITE_ROLES.has(ctx.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = dueItemSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 })
  }

  const supabase = createServerSupabase()
  const { data: aircraft } = await supabase
    .from('aircraft')
    .select('id')
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle()

  if (!aircraft) return NextResponse.json({ error: 'Aircraft not found' }, { status: 404 })

  const { data, error } = await supabase
    .from('aircraft_due_items')
    .insert({
      organization_id: ctx.organizationId,
      aircraft_id: params.id,
      ...parsed.data,
      created_by: ctx.user.id,
      ...buildClassificationPatch(parsed.data),
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await Promise.all([
    supabase.from('audit_logs').insert({
      organization_id: ctx.organizationId,
      user_id: ctx.user.id,
      action: 'aircraft.due_item_created',
      entity_type: 'aircraft_due_item',
      entity_id: data.id,
      metadata_json: {
        aircraft_id: params.id,
        title: data.title,
        status: data.status,
        source_type: data.source_type,
      },
    }),
    supabase.from('aircraft_timeline_events').insert({
      organization_id: ctx.organizationId,
      aircraft_id: params.id,
      module: 'due_list',
      action: 'due_item_created',
      source_record_type: 'aircraft_due_items',
      source_record_id: data.id,
      title: `Due item added: ${data.title}`,
      summary: data.description ?? null,
      actor_id: ctx.user.id,
      metadata: { status: data.status, source_type: data.source_type },
    }),
  ]).catch(() => null)

  return NextResponse.json({ due_item: data }, { status: 201 })
}
