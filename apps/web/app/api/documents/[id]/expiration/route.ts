/**
 * PATCH /api/documents/[id]/expiration  (Spec 2.6.2)
 *
 * Per-document expiration update path.
 *
 * - Whitelist of expiration-only fields (target_persona, expiration_category,
 *   has_expiration, expiration_date, effective_date, reminder_offsets,
 *   issued_by, document_number, renewal_tracking_id).
 * - Recomputes expiration_status server-side from the merged row.
 * - Idempotent re-enqueue of reminder_schedules: deletes any existing rows
 *   for entity_kind='documents' AND entity_id=<doc>, then inserts fresh
 *   rows. This is what makes "edit the date and re-save" work without
 *   piling up duplicate reminders.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import {
  enqueueReminderSchedules,
  recomputeExpirationStatus,
} from '@/lib/documents/expiration'
import type {
  Document,
  ExpirationPersona,
  ReminderOffsetSpec,
} from '@/types'

export const dynamic = 'force-dynamic'

interface RouteContext {
  params: { id: string }
}

const PERSONAS = new Set<ExpirationPersona>(['owner', 'mechanic', 'shop'])
const ALLOWED_ROLES = new Set(['owner', 'admin', 'mechanic'])

function isYmd(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
}

function sanitizeOffsets(input: unknown): ReminderOffsetSpec[] {
  if (!Array.isArray(input)) return []
  const out: ReminderOffsetSpec[] = []
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue
    const o = raw as { offset_days?: unknown; channels?: unknown }
    if (typeof o.offset_days !== 'number' || !Number.isFinite(o.offset_days)) continue
    const channels = Array.isArray(o.channels)
      ? o.channels.filter((c): c is string => typeof c === 'string')
      : undefined
    out.push({ offset_days: Math.trunc(o.offset_days), channels })
  }
  return out
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { id } = params

  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()
  if (!membership) return NextResponse.json({ error: 'No organization' }, { status: 403 })
  if (!ALLOWED_ROLES.has(membership.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const { data: existingRaw } = await supabase
    .from('documents')
    .select('*')
    .eq('id', id)
    .eq('organization_id', membership.organization_id)
    .single()

  if (!existingRaw) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  const existing = existingRaw as Document

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if ('target_persona' in body) {
    const v = body.target_persona
    if (v === null) {
      patch.target_persona = null
    } else if (typeof v === 'string' && PERSONAS.has(v as ExpirationPersona)) {
      patch.target_persona = v
    } else {
      return NextResponse.json({ error: 'invalid target_persona' }, { status: 400 })
    }
  }

  if ('expiration_category' in body) {
    const v = body.expiration_category
    patch.expiration_category =
      typeof v === 'string' && v.trim() !== '' ? v.trim() : null
  }

  if ('has_expiration' in body) {
    patch.has_expiration = Boolean(body.has_expiration)
  }

  if ('expiration_date' in body) {
    const v = body.expiration_date
    if (v === null) {
      patch.expiration_date = null
    } else if (isYmd(v)) {
      patch.expiration_date = v
    } else {
      return NextResponse.json({ error: 'expiration_date must be YYYY-MM-DD' }, { status: 400 })
    }
  }

  if ('effective_date' in body) {
    const v = body.effective_date
    if (v === null) {
      patch.effective_date = null
    } else if (isYmd(v)) {
      patch.effective_date = v
    } else {
      return NextResponse.json({ error: 'effective_date must be YYYY-MM-DD' }, { status: 400 })
    }
  }

  let nextOffsets: ReminderOffsetSpec[] | undefined
  if ('reminder_offsets' in body) {
    nextOffsets = sanitizeOffsets(body.reminder_offsets)
    patch.reminder_offsets = nextOffsets
  }

  if ('issued_by' in body) {
    const v = body.issued_by
    patch.issued_by = typeof v === 'string' && v.trim() !== '' ? v.trim() : null
  }

  if ('document_number' in body) {
    const v = body.document_number
    patch.document_number = typeof v === 'string' && v.trim() !== '' ? v.trim() : null
  }

  if ('renewal_tracking_id' in body) {
    const v = body.renewal_tracking_id
    patch.renewal_tracking_id =
      typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v) ? v : null
  }

  // Compute the merged row that the DB will end up with, so we can derive
  // expiration_status and decide whether to re-enqueue reminders.
  const merged = {
    has_expiration:
      'has_expiration' in patch
        ? Boolean(patch.has_expiration)
        : Boolean(existing.has_expiration),
    expiration_date:
      'expiration_date' in patch
        ? (patch.expiration_date as string | null)
        : existing.expiration_date ?? null,
    reminder_offsets: nextOffsets ?? existing.reminder_offsets ?? [],
  }

  patch.expiration_status = recomputeExpirationStatus(merged, new Date()) ?? null

  const { data: updated, error: updateError } = await supabase
    .from('documents')
    .update(patch)
    .eq('id', id)
    .eq('organization_id', membership.organization_id)
    .select('*')
    .single()

  if (updateError || !updated) {
    console.error('[documents/expiration PATCH] update error:', updateError)
    return NextResponse.json({ error: updateError?.message ?? 'Update failed' }, { status: 500 })
  }

  // Idempotent re-enqueue. Use the service client because reminder_schedules
  // RLS scopes writes to user_id=auth.uid() and we want to insert fan-out
  // rows with user_id=NULL.
  const service = createServiceSupabase()
  const { error: deleteError } = await service
    .from('reminder_schedules')
    .delete()
    .eq('organization_id', membership.organization_id)
    .eq('entity_kind', 'documents')
    .eq('entity_id', id)
  if (deleteError) {
    console.error('[documents/expiration PATCH] delete reminders error:', deleteError)
  }

  let inserted = 0
  const doc = updated as Document
  if (
    doc.has_expiration &&
    doc.expiration_date &&
    Array.isArray(doc.reminder_offsets) &&
    doc.reminder_offsets.length > 0
  ) {
    const result = await enqueueReminderSchedules(service, {
      organizationId: membership.organization_id,
      documentId: doc.id,
      title: doc.title ?? 'Expiring document',
      expirationDateIso: doc.expiration_date,
      offsets: doc.reminder_offsets,
      link: `/documents/${doc.id}`,
    })
    inserted = result.inserted
  }

  return NextResponse.json({ document: doc, reminders_enqueued: inserted })
}
