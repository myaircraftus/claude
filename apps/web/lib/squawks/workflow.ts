import type { NextRequest } from 'next/server'
import { buildClassificationPatch, normalizeAtaCode, normalizeJascCode } from '@/lib/taxonomy/format'

export const SQUAWK_CLOSURE_STATUSES = new Set([
  'resolved',
  'closed_duplicate',
  'closed_not_reproducible',
  'closed_owner_declined',
  'archived',
])

export function normalizeSquawkSeverity(value: unknown, fallback = 'normal') {
  const normalized = String(value ?? fallback).trim().toLowerCase().replace(/\s+/g, '_')
  const map: Record<string, string> = {
    low: 'low',
    minor: 'minor',
    medium: 'medium',
    normal: 'normal',
    high: 'high',
    urgent: 'urgent',
    critical: 'critical',
    grounding: 'grounding',
    grounded: 'grounding',
    cosmetic: 'cosmetic',
    needs_review: 'needs_review',
  }
  return map[normalized] ?? fallback
}

export function normalizeSquawkStatus(value: unknown, fallback = 'open') {
  const normalized = String(value ?? fallback).trim().toLowerCase().replace(/[\s-]+/g, '_')
  const map: Record<string, string> = {
    draft: 'draft',
    open: 'open',
    acknowledged: 'acknowledged',
    needs_review: 'needs_review',
    high_priority: 'high_priority',
    routed_to_estimate: 'routed_to_estimate',
    awaiting_owner_approval: 'awaiting_owner_approval',
    added_to_work_order: 'added_to_work_order',
    in_work_order: 'in_work_order',
    in_progress: 'in_progress',
    waiting_for_parts: 'waiting_for_parts',
    deferred: 'deferred',
    resolved: 'resolved',
    closed_duplicate: 'closed_duplicate',
    duplicate: 'closed_duplicate',
    closed_not_reproducible: 'closed_not_reproducible',
    not_reproducible: 'closed_not_reproducible',
    closed_owner_declined: 'closed_owner_declined',
    owner_declined: 'closed_owner_declined',
    archived: 'archived',
  }
  return map[normalized] ?? fallback
}

export function statusForRoute(routeType: string, fallback = 'open') {
  switch (routeType) {
    case 'existing_work_order':
    case 'new_work_order':
      return 'added_to_work_order'
    case 'estimate':
      return 'routed_to_estimate'
    case 'owner_approval':
      return 'awaiting_owner_approval'
    case 'defer':
      return 'deferred'
    case 'duplicate':
      return 'closed_duplicate'
    case 'close':
    case 'no_action':
      return 'resolved'
    default:
      return fallback
  }
}

export function resolutionTypeForStatus(status: string, reason?: string | null) {
  if (status === 'deferred') return 'deferred'
  if (status === 'closed_duplicate') return 'duplicate'
  if (status === 'closed_not_reproducible') return 'not_reproducible'
  if (status === 'closed_owner_declined') return 'owner_declined'
  if (status === 'archived') return 'entered_in_error'
  if (String(reason ?? '').toLowerCase().includes('no action')) return 'no_action_required'
  return 'resolved_by_work_order'
}

export function buildSquawkTaxonomyPatch(body: Record<string, unknown>) {
  const confirmedInput: Record<string, unknown> = { ...body }
  if ('ata_code' in body && !('confirmed_ata_code' in body)) confirmedInput.confirmed_ata_code = body.ata_code
  if ('jasc_code' in body && !('confirmed_jasc_code' in body)) confirmedInput.confirmed_jasc_code = body.jasc_code

  const patch = buildClassificationPatch(confirmedInput, {
    ataKey: 'confirmed_ata_code',
    jascKey: 'confirmed_jasc_code',
  })

  const hasSuggestedAta = Object.prototype.hasOwnProperty.call(body, 'suggested_ata_code')
  const hasSuggestedJasc = Object.prototype.hasOwnProperty.call(body, 'suggested_jasc_code')
  if (hasSuggestedAta || hasSuggestedJasc) {
    const suggestedJasc = hasSuggestedJasc ? normalizeJascCode(body.suggested_jasc_code) : null
    const suggestedAta = hasSuggestedAta
      ? normalizeAtaCode(body.suggested_ata_code)
      : suggestedJasc
        ? suggestedJasc.slice(0, 2)
        : null

    patch.suggested_ata_code = suggestedAta
    if (hasSuggestedJasc) patch.suggested_jasc_code = suggestedJasc
    if (!Object.prototype.hasOwnProperty.call(patch, 'classification_source') && (suggestedAta || suggestedJasc)) {
      patch.classification_source = 'suggested'
    }
    if (!Object.prototype.hasOwnProperty.call(patch, 'classification_confidence') && (suggestedAta || suggestedJasc)) {
      patch.classification_confidence = 'low'
    }
    if (!Object.prototype.hasOwnProperty.call(patch, 'classification_status') && (suggestedAta || suggestedJasc)) {
      patch.classification_status = 'suggested'
    }
  }

  return patch
}

function requestIp(req: NextRequest) {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || req.headers.get('x-real-ip') || null
}

export async function writeSquawkAudit(
  supabase: any,
  req: NextRequest,
  input: {
    organizationId: string
    userId: string
    action: string
    squawkId: string
    aircraftId?: string | null
    metadata?: Record<string, unknown>
  }
) {
  await supabase.from('audit_logs').insert({
    organization_id: input.organizationId,
    user_id: input.userId,
    action: input.action,
    entity_type: 'squawk',
    entity_id: input.squawkId,
    ip_address: requestIp(req),
    user_agent: req.headers.get('user-agent'),
    metadata_json: {
      aircraft_id: input.aircraftId ?? null,
      ...(input.metadata ?? {}),
    },
  })
}

export async function writeSquawkTimeline(
  supabase: any,
  input: {
    organizationId: string
    aircraftId?: string | null
    actorId?: string | null
    action: string
    squawkId: string
    title: string
    summary?: string | null
    ownerVisible?: boolean
    metadata?: Record<string, unknown>
  }
) {
  if (!input.aircraftId) return
  await supabase.from('aircraft_timeline_events').insert({
    organization_id: input.organizationId,
    aircraft_id: input.aircraftId,
    module: 'squawks',
    action: input.action,
    source_record_type: 'squawk',
    source_record_id: input.squawkId,
    title: input.title,
    summary: input.summary ?? null,
    owner_visible: Boolean(input.ownerVisible),
    actor_id: input.actorId ?? null,
    metadata: input.metadata ?? {},
  })
}
