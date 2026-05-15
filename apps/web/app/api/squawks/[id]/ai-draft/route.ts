import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import { writeSquawkAudit } from '@/lib/squawks/workflow'

function compactString(value: unknown) {
  const text = String(value ?? '').trim()
  return text.length > 0 ? text : null
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('squawk_ai_drafts')
    .select('*')
    .eq('organization_id', ctx.organizationId)
    .eq('squawk_id', params.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ drafts: data ?? [] })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { data: squawk } = await supabase
    .from('squawks')
    .select('id, aircraft_id')
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)
    .single()

  if (!squawk) return NextResponse.json({ error: 'Squawk not found' }, { status: 404 })

  const { data, error } = await supabase
    .from('squawk_ai_drafts')
    .insert({
      organization_id: ctx.organizationId,
      squawk_id: params.id,
      prompt: compactString((body as any).prompt),
      transcript: compactString((body as any).transcript),
      attachments: (body as any).attachments ?? [],
      model_output_json: (body as any).model_output_json ?? body,
      suggested_title: compactString((body as any).suggested_title ?? (body as any).title),
      suggested_description: compactString((body as any).suggested_description ?? (body as any).description),
      suggested_category: compactString((body as any).suggested_category ?? (body as any).category),
      suggested_severity: compactString((body as any).suggested_severity ?? (body as any).severity),
      suggested_route: compactString((body as any).suggested_route ?? (body as any).route),
      confidence: typeof (body as any).confidence === 'number' ? (body as any).confidence : null,
      warnings: (body as any).warnings ?? [],
      status: (body as any).status ?? 'draft',
      created_by: ctx.user.id,
    })
    .select('*')
    .single()

  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Failed to store AI draft' }, { status: 500 })

  await writeSquawkAudit(supabase, req, {
    organizationId: ctx.organizationId,
    userId: ctx.user.id,
    action: 'squawk.ai_draft_generated',
    squawkId: params.id,
    aircraftId: squawk.aircraft_id,
    metadata: {
      confidence: data.confidence,
      suggested_severity: data.suggested_severity,
      suggested_route: data.suggested_route,
    },
  })

  return NextResponse.json(data, { status: 201 })
}
