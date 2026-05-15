import type { NextRequest } from 'next/server'

export const ESTIMATE_STATUSES = new Set([
  'draft',
  'internal_review',
  'ready_to_send',
  'sent',
  'viewed',
  'owner_question',
  'awaiting_approval',
  'awaiting_deposit',
  'approved',
  'deposit_paid',
  'rejected',
  'declined',
  'expired',
  'superseded',
  'converted',
  'converted_to_work_order',
  'archived',
])

export function normalizeEstimateStatus(value: unknown, fallback = 'draft') {
  const normalized = String(value ?? fallback).trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (normalized === 'owner_approved') return 'approved'
  if (normalized === 'owner_declined') return 'declined'
  if (ESTIMATE_STATUSES.has(normalized)) return normalized
  return fallback
}

export function normalizeEstimateLineType(value: unknown) {
  const normalized = String(value ?? 'service').trim().toLowerCase().replace(/[\s-]+/g, '_')
  const allowed = new Set(['labor', 'part', 'outside_service', 'service', 'supply', 'tax', 'fee', 'discount'])
  return allowed.has(normalized) ? normalized : 'service'
}

export function statusRequiresAircraft(status: string) {
  return !['draft', 'internal_review'].includes(status)
}

export function statusRequiresOwner(status: string) {
  return ['ready_to_send', 'sent', 'viewed', 'owner_question', 'awaiting_approval', 'awaiting_deposit', 'approved', 'deposit_paid', 'converted', 'converted_to_work_order'].includes(status)
}

function requestIp(req: NextRequest) {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null
}

export async function writeEstimateAudit(
  supabase: any,
  req: NextRequest,
  input: {
    organizationId: string
    userId: string
    action: string
    estimateId: string
    aircraftId?: string | null
    metadata?: Record<string, unknown>
  }
) {
  await supabase.from('audit_logs').insert({
    organization_id: input.organizationId,
    user_id: input.userId,
    action: input.action,
    entity_type: 'estimate',
    entity_id: input.estimateId,
    ip_address: requestIp(req),
    user_agent: req.headers.get('user-agent'),
    metadata_json: {
      aircraft_id: input.aircraftId ?? null,
      ...(input.metadata ?? {}),
    },
  })
}

export async function writeEstimateTimeline(
  supabase: any,
  input: {
    organizationId: string
    aircraftId?: string | null
    actorId?: string | null
    action: string
    estimateId: string
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
    module: 'estimates',
    action: input.action,
    source_record_type: 'estimate',
    source_record_id: input.estimateId,
    title: input.title,
    summary: input.summary ?? null,
    owner_visible: Boolean(input.ownerVisible),
    actor_id: input.actorId ?? null,
    metadata: input.metadata ?? {},
  })
}
