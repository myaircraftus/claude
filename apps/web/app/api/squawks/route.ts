import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import {
  buildSquawkTaxonomyPatch,
  normalizeSquawkSeverity,
  normalizeSquawkStatus,
  writeSquawkAudit,
  writeSquawkTimeline,
} from '@/lib/squawks/workflow'

const SQUAWK_SELECT = `
  id, organization_id, aircraft_id, title, description, category, severity, status, source,
  source_metadata, owner_visible, owner_summary, internal_notes, current_route_type,
  assigned_work_order_id, linked_estimate_id, linked_task_id, linked_checklist_item_id,
  reported_at, resolved_at, verified_by_user_id, verified_at,
  closure_reason, closure_notes, duplicate_of_squawk_id,
  suggested_ata_code, suggested_jasc_code, confirmed_ata_code, confirmed_jasc_code,
  classification_source, classification_confidence, classification_status,
  created_at, updated_at,
  reporter:reported_by (id, full_name, email, avatar_url),
  aircraft:aircraft_id (id, tail_number, make, model),
  evidence:squawk_evidence (id, evidence_type, file_name, file_type, owner_visible, internal_only, created_at),
  ai_drafts:squawk_ai_drafts (id, status, confidence, suggested_title, suggested_severity, suggested_route, created_at)
`

function compactString(value: unknown) {
  const text = String(value ?? '').trim()
  return text.length > 0 ? text : null
}

function normalizeSource(value: unknown, fallback = 'manual') {
  const normalized = String(value ?? fallback).trim().toLowerCase().replace(/[\s-]+/g, '_')
  const allowed = new Set([
    'manual',
    'voice',
    'photo',
    'flight_schedule_pro',
    'mobile_app',
    'dictation',
    'photo_video',
    'file_upload',
    'paper_ocr',
    'owner_portal',
    'checklist_failure',
    'ai_intake',
    'document_upload',
    'aircraft_workspace',
    'global_queue',
    'work_order',
    'estimate',
  ])
  return allowed.has(normalized) ? normalized : fallback
}

export async function GET(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const orgId = ctx.organizationId

  const { searchParams } = new URL(req.url)
  const aircraftId = searchParams.get('aircraft_id')
  const status = searchParams.get('status')
  const severity = searchParams.get('severity')
  const q = searchParams.get('q')?.trim()
  const queue = searchParams.get('queue')
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '100', 10), 250)
  const offset = parseInt(searchParams.get('offset') ?? '0', 10)

  let query = supabase
    .from('squawks')
    .select(SQUAWK_SELECT, { count: 'exact' })
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (aircraftId) query = query.eq('aircraft_id', aircraftId)
  if (status && status !== 'all') {
    if (status === 'closed') {
      query = query.in('status', ['resolved', 'closed_duplicate', 'closed_not_reproducible', 'closed_owner_declined', 'archived'])
    } else if (status === 'awaiting_approval') {
      query = query.eq('status', 'awaiting_owner_approval')
    } else {
      query = query.eq('status', normalizeSquawkStatus(status))
    }
  }
  if (severity && severity !== 'all') query = query.eq('severity', normalizeSquawkSeverity(severity))
  if (queue === 'high_priority') query = query.in('severity', ['high', 'critical', 'grounding', 'urgent'])
  if (queue === 'deferred') query = query.eq('status', 'deferred')
  if (queue === 'ai_review') query = query.or('status.eq.needs_review,classification_status.eq.suggested')
  if (q) {
    const safeQ = q.replace(/[%_]/g, '\\$&')
    query = query.or(`title.ilike.%${safeQ}%,description.ilike.%${safeQ}%,category.ilike.%${safeQ}%`)
  }

  const { data, count, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ squawks: data ?? [], total: count ?? 0 })
}

export async function POST(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const user = ctx.user
  const orgId = ctx.organizationId

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const title = compactString((body as any).title ?? (body as any).ai_draft?.suggested_title)
  if (!(body as any).aircraft_id || !title) {
    return NextResponse.json({ error: 'aircraft_id and title are required before official squawk save' }, { status: 400 })
  }

  const { data: aircraft } = await supabase
    .from('aircraft')
    .select('id, tail_number, make, model')
    .eq('id', (body as any).aircraft_id)
    .eq('organization_id', orgId)
    .single()

  if (!aircraft) {
    return NextResponse.json({ error: 'Aircraft is required before official squawk save' }, { status: 400 })
  }

  const status = normalizeSquawkStatus((body as any).status ?? 'open')
  const humanVerified = Boolean((body as any).human_verified ?? (body as any).verified ?? status !== 'draft')

  const { data, error } = await supabase
    .from('squawks')
    .insert({
      organization_id: orgId,
      aircraft_id: (body as any).aircraft_id,
      reported_by: (body as any).reported_by_user_id ?? user.id,
      reported_by_user_id: (body as any).reported_by_user_id ?? user.id,
      created_by_user_id: user.id,
      title,
      description: compactString((body as any).description),
      category: compactString((body as any).category),
      severity: normalizeSquawkSeverity((body as any).severity),
      status,
      source: normalizeSource((body as any).source ?? (body as any).source_type),
      source_metadata: (body as any).source_metadata ?? {
        source_context: (body as any).source_context ?? 'squawks',
        transcript: compactString((body as any).transcript),
      },
      owner_visible: Boolean((body as any).owner_visible),
      owner_summary: compactString((body as any).owner_summary),
      internal_notes: compactString((body as any).internal_notes),
      verified_by_user_id: humanVerified ? user.id : null,
      verified_at: humanVerified ? new Date().toISOString() : null,
      reported_at: new Date().toISOString(),
      ...buildSquawkTaxonomyPatch(body as Record<string, unknown>),
    })
    .select(SQUAWK_SELECT)
    .single()

  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Failed to create squawk' }, { status: 500 })

  const evidence = Array.isArray((body as any).evidence) ? (body as any).evidence : []
  if (evidence.length > 0) {
    const rows = evidence.map((item: any) => ({
      organization_id: orgId,
      squawk_id: data.id,
      uploaded_by: user.id,
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
    await supabase.from('squawk_evidence').insert(rows)
  }

  const aiDraft = (body as any).ai_draft
  if (aiDraft && typeof aiDraft === 'object') {
    await supabase.from('squawk_ai_drafts').insert({
      organization_id: orgId,
      squawk_id: data.id,
      prompt: compactString(aiDraft.prompt ?? (body as any).prompt),
      transcript: compactString(aiDraft.transcript ?? (body as any).transcript),
      attachments: aiDraft.attachments ?? [],
      model_output_json: aiDraft.model_output_json ?? aiDraft,
      suggested_title: compactString(aiDraft.suggested_title ?? aiDraft.title),
      suggested_description: compactString(aiDraft.suggested_description ?? aiDraft.description),
      suggested_category: compactString(aiDraft.suggested_category ?? aiDraft.category),
      suggested_severity: compactString(aiDraft.suggested_severity ?? aiDraft.severity),
      suggested_route: compactString(aiDraft.suggested_route ?? aiDraft.route),
      confidence: typeof aiDraft.confidence === 'number' ? aiDraft.confidence : null,
      warnings: aiDraft.warnings ?? [],
      status: humanVerified ? 'accepted' : 'draft',
      created_by: user.id,
      accepted_by: humanVerified ? user.id : null,
      accepted_at: humanVerified ? new Date().toISOString() : null,
    })
  }

  if ((body as any).owner_visible || (body as any).owner_summary) {
    await supabase.from('squawk_owner_visibility').upsert({
      organization_id: orgId,
      squawk_id: data.id,
      owner_visible: Boolean((body as any).owner_visible),
      sanitized_title: title,
      sanitized_description: compactString((body as any).owner_summary ?? (body as any).description),
      visible_fields: (body as any).owner_visible_fields ?? ['title', 'description', 'status'],
      updated_by: user.id,
    }, { onConflict: 'squawk_id' })
  }

  await writeSquawkAudit(supabase, req, {
    organizationId: orgId,
    userId: user.id,
    action: humanVerified ? 'squawk.created.verified' : 'squawk.draft_created',
    squawkId: data.id,
    aircraftId: data.aircraft_id,
    metadata: {
      source: data.source,
      severity: data.severity,
      status: data.status,
      owner_visible: data.owner_visible,
    },
  })

  await writeSquawkTimeline(supabase, {
    organizationId: orgId,
    aircraftId: data.aircraft_id,
    actorId: user.id,
    action: humanVerified ? 'squawk.created.verified' : 'squawk.draft_created',
    squawkId: data.id,
    title: `Squawk created: ${data.title}`,
    summary: data.description,
    ownerVisible: data.owner_visible,
    metadata: { severity: data.severity, status: data.status },
  })

  return NextResponse.json(data, { status: 201 })
}

function normalizeEvidenceType(value: unknown) {
  const normalized = String(value ?? 'file').trim().toLowerCase().replace(/[\s-]+/g, '_')
  const allowed = new Set(['photo', 'video', 'voice', 'file', 'paper_ocr', 'owner_media', 'transcript'])
  return allowed.has(normalized) ? normalized : 'file'
}
