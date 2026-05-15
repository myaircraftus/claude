import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import { writeSquawkAudit, writeSquawkTimeline } from '@/lib/squawks/workflow'

function compactString(value: unknown) {
  const text = String(value ?? '').trim()
  return text.length > 0 ? text : null
}

function normalizeEvidenceType(value: unknown) {
  const normalized = String(value ?? 'file').trim().toLowerCase().replace(/[\s-]+/g, '_')
  const allowed = new Set(['photo', 'video', 'voice', 'file', 'paper_ocr', 'owner_media', 'transcript'])
  return allowed.has(normalized) ? normalized : 'file'
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('squawk_evidence')
    .select('*')
    .eq('organization_id', ctx.organizationId)
    .eq('squawk_id', params.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ evidence: data ?? [] })
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
    .select('id, aircraft_id, title, owner_visible')
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)
    .single()

  if (!squawk) return NextResponse.json({ error: 'Squawk not found' }, { status: 404 })

  const items = Array.isArray((body as any).evidence) ? (body as any).evidence : [body]
  const rows = items.map((item: any) => ({
    organization_id: ctx.organizationId,
    squawk_id: params.id,
    uploaded_by: ctx.user.id,
    evidence_type: normalizeEvidenceType(item.evidence_type ?? item.type),
    file_name: compactString(item.file_name ?? item.name),
    file_type: compactString(item.file_type ?? item.mime_type),
    storage_path: compactString(item.storage_path),
    public_url: compactString(item.public_url),
    transcript: compactString(item.transcript),
    ocr_text: compactString(item.ocr_text),
    internal_only: item.internal_only ?? !item.owner_visible,
    owner_visible: Boolean(item.owner_visible),
    metadata: item.metadata ?? {},
  }))

  const { data, error } = await supabase
    .from('squawk_evidence')
    .insert(rows)
    .select('*')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await writeSquawkAudit(supabase, req, {
    organizationId: ctx.organizationId,
    userId: ctx.user.id,
    action: 'squawk.evidence_added',
    squawkId: params.id,
    aircraftId: squawk.aircraft_id,
    metadata: { count: rows.length },
  })

  await writeSquawkTimeline(supabase, {
    organizationId: ctx.organizationId,
    aircraftId: squawk.aircraft_id,
    actorId: ctx.user.id,
    action: 'squawk.evidence_added',
    squawkId: params.id,
    title: `Evidence added to squawk: ${squawk.title}`,
    summary: `${rows.length} evidence item${rows.length === 1 ? '' : 's'} attached`,
    ownerVisible: Boolean(squawk.owner_visible),
  })

  return NextResponse.json({ evidence: data ?? [] }, { status: 201 })
}
