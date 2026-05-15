import { createHash } from 'crypto'
import type { NextRequest } from 'next/server'
import {
  VALID_ENTRY_TYPES,
  VALID_LOGBOOK_TYPES,
  VALID_STATUSES,
  type EntryStatus,
  type EntryType,
  type LogbookType,
} from './constants'

export const TARGET_LOGBOOKS = new Set([
  'airframe',
  'engine',
  'propeller',
  'avionics',
  'appliance',
  'component',
])

const SIGNABLE_STATUSES = new Set(['draft', 'ready_for_review', 'ready_to_sign', 'final'])
const EDITABLE_STATUSES = new Set(['draft', 'ready_for_review', 'ready_to_sign', 'final', 'printed_unsigned'])

export function normalizeEntryType(value: unknown, fallback: EntryType = 'maintenance') {
  const normalized = String(value ?? fallback).trim().toLowerCase().replace(/[\s-]+/g, '_')
  return VALID_ENTRY_TYPES.includes(normalized as EntryType) ? (normalized as EntryType) : fallback
}

export function normalizeLogbookStatus(value: unknown, fallback: EntryStatus = 'draft') {
  const normalized = String(value ?? fallback).trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (normalized === 'ready') return 'ready_for_review'
  if (normalized === 'ready_to_review') return 'ready_for_review'
  if (normalized === 'void') return 'voided'
  return VALID_STATUSES.includes(normalized as EntryStatus) ? (normalized as EntryStatus) : fallback
}

export function normalizeLogbookType(value: unknown, fallback: LogbookType | null = null) {
  if (value == null || value === '') return fallback
  const normalized = String(value).trim().toLowerCase().replace(/[\s-]+/g, '_')
  const mapped = normalized === 'propeller' ? 'prop' : normalized
  return VALID_LOGBOOK_TYPES.includes(mapped as LogbookType) ? (mapped as LogbookType) : fallback
}

export function normalizeTargetLogbook(value: unknown, fallback = 'airframe') {
  const normalized = String(value ?? fallback).trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (normalized === 'prop') return 'propeller'
  if (TARGET_LOGBOOKS.has(normalized)) return normalized
  return fallback
}

export function canEditLogbookStatus(status: string | null | undefined) {
  return EDITABLE_STATUSES.has(String(status ?? 'draft'))
}

export function canSignLogbookStatus(status: string | null | undefined) {
  return SIGNABLE_STATUSES.has(String(status ?? 'draft'))
}

export function requestIp(req: NextRequest) {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null
}

export function buildLogbookHash(input: unknown) {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex')
}

export function labelize(value: string | null | undefined) {
  return String(value ?? '').replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase())
}

export function buildWorkOrderLogbookDraft(input: {
  workOrder?: Record<string, any> | null
  lines?: any[]
  checklist?: any[]
  targetLogbook?: string
  entryType?: string
}) {
  const workOrder = input.workOrder ?? {}
  const lines = input.lines ?? []
  const checklist = input.checklist ?? []
  const target = normalizeTargetLogbook(input.targetLogbook)
  const completedChecklist = checklist.filter(item => item.completed)
  const failedChecklist = checklist.filter(item => !item.completed && item.required)
  const laborLines = lines.filter(line => line.line_type === 'labor')
  const partLines = lines.filter(line => line.line_type === 'part')
  const corrective = workOrder.corrective_action || workOrder.findings || workOrder.customer_visible_notes
  const descriptionParts = [
    input.entryType === 'annual'
      ? 'I certify that this aircraft has been inspected in accordance with an annual inspection and was determined to be in airworthy condition.'
      : `Completed ${labelize(input.entryType ?? 'maintenance').toLowerCase()} record for the ${target} logbook.`,
  ]

  if (workOrder.work_order_number) {
    descriptionParts.push(`Work performed under ${workOrder.work_order_number}.`)
  }
  if (workOrder.complaint || workOrder.discrepancy) {
    descriptionParts.push(`Reported discrepancy: ${workOrder.complaint ?? workOrder.discrepancy}.`)
  }
  if (corrective) descriptionParts.push(String(corrective))
  if (laborLines.length) {
    descriptionParts.push(`Labor documented: ${laborLines.map(line => line.description).join('; ')}.`)
  }
  if (partLines.length) {
    descriptionParts.push(`Parts/materials used: ${partLines.map(line => `${line.description}${line.part_number ? ` (${line.part_number})` : ''}`).join('; ')}.`)
  }
  if (completedChecklist.length) {
    descriptionParts.push(`Checklist items completed: ${completedChecklist.slice(0, 8).map(item => item.item_label).join('; ')}.`)
  }
  if (failedChecklist.length) {
    descriptionParts.push(`Open/deferred checklist items require review before final signoff: ${failedChecklist.slice(0, 5).map(item => item.item_label).join('; ')}.`)
  }
  descriptionParts.push('All work documented here is limited to the scope performed and reviewed by the signer.')

  return descriptionParts.filter(Boolean).join('\n\n')
}

export function summarizeWorkOrderSource(input: {
  workOrder?: Record<string, any> | null
  lines?: any[]
  checklist?: any[]
}) {
  const lines = input.lines ?? []
  const checklist = input.checklist ?? []
  return {
    work_order_number: input.workOrder?.work_order_number ?? null,
    work_order_status: input.workOrder?.status ?? null,
    task_count: lines.length,
    labor_count: lines.filter(line => line.line_type === 'labor').length,
    part_count: lines.filter(line => line.line_type === 'part').length,
    checklist_count: checklist.length,
    completed_checklist_count: checklist.filter(item => item.completed).length,
    open_required_checklist_count: checklist.filter(item => item.required && !item.completed).length,
    parts: lines
      .filter(line => line.line_type === 'part')
      .map(line => ({
        id: line.id,
        description: line.description,
        part_number: line.part_number ?? null,
        quantity: line.quantity ?? 1,
      })),
  }
}

export async function writeLogbookAudit(
  supabase: any,
  req: NextRequest,
  input: {
    organizationId: string
    userId: string
    action: string
    entryId: string
    aircraftId?: string | null
    metadata?: Record<string, unknown>
  }
) {
  const metadata = {
    aircraft_id: input.aircraftId ?? null,
    ...(input.metadata ?? {}),
  }
  await supabase.from('audit_logs').insert({
    organization_id: input.organizationId,
    user_id: input.userId,
    action: input.action,
    entity_type: 'logbook_entry',
    entity_id: input.entryId,
    ip_address: requestIp(req),
    user_agent: req.headers.get('user-agent'),
    metadata_json: metadata,
  })
  await supabase.from('audit_events').insert({
    organization_id: input.organizationId,
    actor_id: input.userId,
    event_type: auditEventType(input.action),
    object_type: 'logbook_entry',
    object_id: input.entryId,
    object_description: input.action,
    metadata,
    ip_address: requestIp(req),
    user_agent: req.headers.get('user-agent'),
  })
}

export async function writeLogbookTimeline(
  supabase: any,
  input: {
    organizationId: string
    aircraftId?: string | null
    actorId?: string | null
    action: string
    entryId: string
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
    module: 'logbook',
    action: input.action,
    source_record_type: 'logbook_entry',
    source_record_id: input.entryId,
    title: input.title,
    summary: input.summary ?? null,
    owner_visible: Boolean(input.ownerVisible),
    actor_id: input.actorId ?? null,
    metadata: input.metadata ?? {},
  })
}

function auditEventType(action: string) {
  if (action.includes('sign')) return 'sign'
  if (action.includes('email')) return 'email'
  if (action.includes('share') || action.includes('publish')) return 'share'
  if (action.includes('print') || action.includes('export') || action.includes('pdf')) return 'export'
  if (action.includes('void') || action.includes('status') || action.includes('supersede')) return 'status_change'
  if (action.includes('delete')) return 'delete'
  if (action.includes('edit') || action.includes('update') || action.includes('revision')) return 'update'
  return 'create'
}
