import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { upsertCanonicalRecordVersion, type CanonicalVersionLineageInput } from '@/lib/ocr/canonical-records'
import {
  buildClassificationStorageFieldsBySelection,
  getDocumentClassificationProfileBySelection,
} from '@/lib/documents/classification'
import {
  isDocumentDetailId,
  isDocumentGroupId,
} from '@/lib/documents/taxonomy'

type CorrectedFields = Record<string, string | null>
type ClassificationOverrides = {
  document_group_id?: string | null
  document_detail_id?: string | null
  document_subtype?: string | null
  truth_role?: string | null
  parser_strategy?: string | null
  evidence_state?: string | null
  reminder_relevance?: boolean | null
  ad_relevance?: boolean | null
  inspection_relevance?: boolean | null
}
type SegmentEvidenceState =
  | 'canonical_candidate'
  | 'informational_only'
  | 'non_canonical_evidence'
  | 'review_required'
  | 'ignore'

function parseNumeric(value: unknown) {
  if (value == null || value === '') return null
  const parsed = Number.parseFloat(String(value))
  return Number.isFinite(parsed) ? parsed : null
}

function asStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter(Boolean)
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
  }

  return []
}

// Map canonicalized event_type → maintenance_entry_drafts.entry_type
// (kept loose; drafts table is free-form; from-draft re-maps to logbook entry_type)
function draftEntryTypeFromEvent(eventType: string | null | undefined): string {
  if (!eventType) return 'maintenance'
  const t = eventType.toLowerCase()
  if (t.includes('annual')) return 'annual'
  if (t.includes('100') && t.includes('hour')) return '100hr'
  if (t.includes('100hr')) return '100hr'
  if (t.includes('ad')) return 'ad_compliance'
  if (t.includes('oil')) return 'oil_change'
  if (t.includes('repair')) return 'repair'
  if (t.includes('overhaul')) return 'overhaul'
  if (t.includes('alteration')) return 'repair'
  return 'maintenance'
}

function draftLogbookType(raw: string | null | undefined): string | null {
  if (!raw) return null
  const t = raw.toLowerCase()
  if (t === 'airframe' || t === 'airframe_log') return 'airframe'
  if (t === 'engine' || t === 'engine_log') return 'engine'
  if (t === 'prop' || t === 'prop_log') return 'prop'
  if (t === 'avionics') return 'avionics'
  return null
}

function normalizeTruthState(raw: string | null | undefined) {
  if (raw === 'informational_only') return 'informational_only' as const
  if (raw === 'non_canonical_evidence') return 'non_canonical_evidence' as const
  if (raw === 'ignore') return 'ignore' as const
  if (raw === 'review_required') return 'review_required' as const
  return 'canonical' as const
}

function normalizeEvidenceState(raw: unknown): SegmentEvidenceState {
  switch (raw) {
    case 'informational_only':
    case 'non_canonical_evidence':
    case 'review_required':
    case 'ignore':
      return raw
    default:
      return 'canonical_candidate'
  }
}

function buildClassificationPatch(
  overrides: ClassificationOverrides | null | undefined,
  fallbackDocType: string
) {
  if (!overrides) return null

  const groupId = isDocumentGroupId(overrides.document_group_id)
    ? overrides.document_group_id
    : null
  const detailId = isDocumentDetailId(overrides.document_detail_id)
    ? overrides.document_detail_id
    : null

  if (!groupId || !detailId) {
    throw new Error('Invalid document classification selection')
  }

  const profile = getDocumentClassificationProfileBySelection(
    groupId,
    detailId,
    fallbackDocType as any
  )

  if (!profile) {
    throw new Error('Unable to resolve document classification profile')
  }

  const storageFields = buildClassificationStorageFieldsBySelection(
    groupId,
    detailId,
    fallbackDocType as any
  )

  if (!storageFields) {
    throw new Error('Unable to build classification storage fields')
  }

  const evidenceState = normalizeEvidenceState(overrides.evidence_state)

  return {
    ...storageFields,
    doc_type: profile.docType,
    document_group_id: profile.groupId,
    document_detail_id: profile.detailId,
    document_subtype:
      typeof overrides.document_subtype === 'string' && overrides.document_subtype.trim().length > 0
        ? overrides.document_subtype.trim()
        : null,
    truth_role:
      typeof overrides.truth_role === 'string' && overrides.truth_role.trim().length > 0
        ? overrides.truth_role.trim()
        : storageFields.truth_role,
    parser_strategy:
      typeof overrides.parser_strategy === 'string' && overrides.parser_strategy.trim().length > 0
        ? overrides.parser_strategy.trim()
        : storageFields.parser_strategy,
    reminder_relevance:
      typeof overrides.reminder_relevance === 'boolean'
        ? overrides.reminder_relevance
        : storageFields.reminder_relevance,
    ad_relevance:
      typeof overrides.ad_relevance === 'boolean'
        ? overrides.ad_relevance
        : storageFields.ad_relevance,
    inspection_relevance:
      typeof overrides.inspection_relevance === 'boolean'
        ? overrides.inspection_relevance
        : storageFields.inspection_relevance,
    evidence_state: evidenceState,
    canonical_candidate: evidenceState === 'canonical_candidate',
  }
}

function buildDiffSummary(previous: Record<string, unknown> | null, next: Record<string, unknown>) {
  const previousSnapshot = previous ?? {}
  const changed_fields = Object.entries(next)
    .filter(([key, value]) => {
      const previousValue = previousSnapshot[key]
      return JSON.stringify(previousValue ?? null) !== JSON.stringify(value ?? null)
    })
    .map(([key, value]) => ({
      field: key,
      previous: previousSnapshot[key] ?? null,
      next: value ?? null,
    }))

  return {
    changed_fields,
    changed_count: changed_fields.length,
  }
}

function buildLearningQueuePayloads(args: {
  fieldName: string
  originalValue: string | null
  correctedValue: string | null
  documentFamily: string | null
  pageFamily: string | null
}) {
  return [
    {
      queue_type: 'prompt_rule_improvement',
      payload_json: {
        field_name: args.fieldName,
        original_value: args.originalValue,
        corrected_value: args.correctedValue,
        document_family: args.documentFamily,
        page_family: args.pageFamily,
      },
    },
    {
      queue_type: 'benchmark_promotion',
      payload_json: {
        field_name: args.fieldName,
        corrected_value: args.correctedValue,
        document_family: args.documentFamily,
        page_family: args.pageFamily,
      },
    },
    {
      queue_type: 'failure_pattern_analysis',
      payload_json: {
        field_name: args.fieldName,
        original_value: args.originalValue,
        corrected_value: args.correctedValue,
      },
    },
  ]
}

async function resolveTargetSegment(args: {
  supabase: ReturnType<typeof createServiceSupabase>
  pageId?: string | null
  segmentId?: string | null
  segmentGroupKey?: string | null
}) {
  if (args.segmentId) {
    const { data: segment } = await args.supabase
      .from('ocr_entry_segments')
      .select('*')
      .eq('id', args.segmentId)
      .single()
    return segment
  }

  if (args.segmentGroupKey) {
    const { data: segments } = await args.supabase
      .from('ocr_entry_segments')
      .select('*')
      .eq('segment_group_key', args.segmentGroupKey)
      .order('page_number', { ascending: true })
      .order('segment_index', { ascending: true })

    if (segments && segments.length > 0) {
      return segments[0]
    }
  }

  if (!args.pageId) return null

  const { data: segments } = await args.supabase
    .from('ocr_entry_segments')
    .select('*')
    .eq('ocr_page_job_id', args.pageId)
    .order('canonical_candidate', { ascending: false })
    .order('confidence', { ascending: false })
    .order('segment_index', { ascending: true })

  if (segments && segments.length > 0) {
    return segments[0]
  }

  return null
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const {
    page_id,
    segment_id,
    segment_group_id,
    corrected_fields,
    review_queue_item_id,
    classification_overrides,
  } = body as {
    page_id?: string
    segment_id?: string
    segment_group_id?: string
    corrected_fields?: CorrectedFields
    review_queue_item_id?: string
    classification_overrides?: ClassificationOverrides
  }

  if (!page_id && !segment_id && !segment_group_id) {
    return NextResponse.json(
      { error: 'page_id, segment_id, or segment_group_id required' },
      { status: 400 }
    )
  }

  const service = createServiceSupabase()

  const targetSegment = await resolveTargetSegment({
    supabase: service,
    pageId: page_id ?? null,
    segmentId: segment_id ?? null,
    segmentGroupKey: segment_group_id ?? null,
  })

  const resolvedPageId = targetSegment?.ocr_page_job_id ?? page_id ?? null
  if (!resolvedPageId) {
    return NextResponse.json({ error: 'Could not resolve target page' }, { status: 400 })
  }

  const { data: page } = await supabase
    .from('ocr_page_jobs')
    .select(`*, document:document_id(id, title, doc_type, record_family, organization_id, aircraft_id)`)
    .eq('id', resolvedPageId)
    .single()

  if (!page) return NextResponse.json({ error: 'Page not found' }, { status: 404 })

  const doc = (page as any).document
  const orgId: string = doc?.organization_id
  const aircraftId: string | null = doc?.aircraft_id ?? null
  const documentId: string | null = doc?.id ?? null
  const segmentGroupKey: string | null =
    targetSegment?.segment_group_key ?? segment_group_id ?? null
  let classificationPatch: ReturnType<typeof buildClassificationPatch> = null
  try {
    classificationPatch = buildClassificationPatch(
      classification_overrides,
      doc?.doc_type ?? 'miscellaneous'
    )
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Invalid document classification selection'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  if (!orgId) return NextResponse.json({ error: 'Cannot determine org' }, { status: 400 })

  if (classificationPatch && documentId) {
    await service
      .from('documents')
      .update({
        doc_type: classificationPatch.doc_type,
        document_group_id: classificationPatch.document_group_id,
        document_detail_id: classificationPatch.document_detail_id,
        document_subtype: classificationPatch.document_subtype,
        record_family: classificationPatch.record_family,
        document_class: classificationPatch.document_class,
        truth_role: classificationPatch.truth_role,
        parser_strategy: classificationPatch.parser_strategy,
        review_priority: classificationPatch.review_priority,
        canonical_eligibility: classificationPatch.canonical_eligibility,
        reminder_relevance: classificationPatch.reminder_relevance,
        ad_relevance: classificationPatch.ad_relevance,
        inspection_relevance: classificationPatch.inspection_relevance,
        completeness_relevance: classificationPatch.completeness_relevance,
        intelligence_tags: classificationPatch.intelligence_tags,
      })
      .eq('id', documentId)
  }

  if (classificationPatch && targetSegment?.id) {
    await service
      .from('ocr_entry_segments')
      .update({
        document_group_id: classificationPatch.document_group_id,
        document_detail_id: classificationPatch.document_detail_id,
        document_subtype: classificationPatch.document_subtype,
        record_family: classificationPatch.record_family,
        document_class: classificationPatch.document_class,
        truth_role: classificationPatch.truth_role,
        parser_strategy: classificationPatch.parser_strategy,
        review_priority: classificationPatch.review_priority,
        canonical_eligibility: classificationPatch.canonical_eligibility,
        reminder_relevance: classificationPatch.reminder_relevance,
        ad_relevance: classificationPatch.ad_relevance,
        inspection_relevance: classificationPatch.inspection_relevance,
        completeness_relevance: classificationPatch.completeness_relevance,
        intelligence_tags: classificationPatch.intelligence_tags,
        evidence_state: classificationPatch.evidence_state,
        canonical_candidate: classificationPatch.canonical_candidate,
        reviewer_id: user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', targetSegment.id)
  }

  const { data: existingEvent } = await service
    .from('maintenance_events')
    .select('*')
    .or(
      targetSegment?.id
        ? `source_segment_id.eq.${targetSegment.id},source_segment_group_key.eq.${segmentGroupKey ?? ''}`
        : `source_page_id.eq.${resolvedPageId}`
    )
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: event } = await service
    .from('ocr_extracted_events')
    .select('*')
    .eq(targetSegment?.id ? 'ocr_entry_segment_id' : 'ocr_page_job_id', targetSegment?.id ?? resolvedPageId)
    .maybeSingle()

  const { data: candidateRows } = targetSegment?.id
    ? await service
        .from('ocr_segment_field_candidates')
        .select('*')
        .eq('segment_id', targetSegment.id)
    : await service
        .from('extracted_field_candidates')
        .select('*')
        .eq('page_id', resolvedPageId)

  const base = event ?? {}
  const merged = { ...base, ...(corrected_fields ?? {}) }

  const adRefs = corrected_fields?.ad_reference
    ? asStringArray(corrected_fields.ad_reference)
    : asStringArray(base.ad_references)

  const eventType =
    corrected_fields?.event_type ??
    base.event_type ??
    base.logbook_type ??
    'maintenance'

  const recordConfidence =
    (page as any).arbitration_confidence ?? (page as any).ocr_confidence ?? null

  const truthState = normalizeTruthState(
    classificationPatch?.evidence_state ?? targetSegment?.evidence_state
  )
  const sourceKind =
    corrected_fields && Object.keys(corrected_fields).length > 0
      ? 'human_reviewed_correction'
      : 'approved_canonical_record'

  const snapshot = {
    event_type: eventType,
    event_date: merged.event_date ?? null,
    description: merged.work_description ?? merged.description ?? null,
    mechanic_name: merged.mechanic_name ?? null,
    mechanic_cert: merged.mechanic_cert_number ?? merged.mechanic_cert ?? null,
    ia_cert_number: merged.ia_number ?? merged.ia_cert_number ?? null,
    airframe_tt: parseNumeric(merged.airframe_tt),
    tach_time: parseNumeric(merged.tach_time),
    tsmoh: parseNumeric(merged.tsmoh),
    ata_chapter: merged.ata_chapter ?? null,
    part_numbers: base.part_numbers ?? null,
    ad_reference: adRefs.length > 0 ? adRefs[0] : null,
    far_references: base.far_references ?? null,
    return_to_service: base.return_to_service ?? false,
    raw_text: base.raw_text ?? page.ocr_raw_text ?? targetSegment?.text_content ?? null,
  }

  const diffSummary = buildDiffSummary(
    existingEvent
      ? {
          event_type: existingEvent.event_type,
          event_date: existingEvent.event_date,
          description: existingEvent.description,
          mechanic_name: existingEvent.mechanic_name,
          mechanic_cert: existingEvent.mechanic_cert,
          ia_cert_number: existingEvent.ia_cert_number,
          airframe_tt: existingEvent.airframe_tt,
          tach_time: existingEvent.tach_time,
          tsmoh: existingEvent.tsmoh,
          ata_chapter: existingEvent.ata_chapter,
          part_numbers: existingEvent.part_numbers,
          ad_reference: existingEvent.ad_reference,
          far_references: existingEvent.far_references,
          return_to_service: existingEvent.return_to_service,
          raw_text: existingEvent.raw_text,
        }
      : null,
    snapshot
  )

  let maintenanceEventId = existingEvent?.id as string | null

  if (!maintenanceEventId) {
    const { data: newEvent, error: insertError } = await service
      .from('maintenance_events')
      .insert({
        organization_id: orgId,
        aircraft_id: aircraftId,
        document_id: documentId,
        source_page: page.page_number,
        source_page_id: resolvedPageId,
        source_segment_id: targetSegment?.id ?? null,
        source_segment_group_key: segmentGroupKey,
        event_date: snapshot.event_date,
        event_type: snapshot.event_type,
        description: snapshot.description,
        mechanic_name: snapshot.mechanic_name,
        mechanic_cert: snapshot.mechanic_cert,
        ia_cert_number: snapshot.ia_cert_number,
        airframe_tt: snapshot.airframe_tt,
        tach_time: snapshot.tach_time,
        tsmoh: snapshot.tsmoh,
        ata_chapter: snapshot.ata_chapter,
        part_numbers: snapshot.part_numbers,
        ad_reference: snapshot.ad_reference,
        far_references: snapshot.far_references,
        return_to_service: snapshot.return_to_service,
        raw_text: snapshot.raw_text,
        confidence: recordConfidence,
        record_confidence: recordConfidence,
        is_verified: truthState === 'canonical',
        canonicalization_status:
          truthState === 'canonical'
            ? 'canonical'
            : truthState === 'ignore'
            ? 'rejected'
            : 'draft',
        truth_state: truthState,
      })
      .select('id')
      .single()

    if (insertError || !newEvent) {
      console.error('[canonicalize] insert error:', insertError)
      return NextResponse.json({ error: 'Failed to create canonical record' }, { status: 500 })
    }

    maintenanceEventId = newEvent.id
  } else {
    const { error: updateError } = await service
      .from('maintenance_events')
      .update({
        source_page: page.page_number,
        source_page_id: resolvedPageId,
        source_segment_id: targetSegment?.id ?? null,
        source_segment_group_key: segmentGroupKey,
        event_date: snapshot.event_date,
        event_type: snapshot.event_type,
        description: snapshot.description,
        mechanic_name: snapshot.mechanic_name,
        mechanic_cert: snapshot.mechanic_cert,
        ia_cert_number: snapshot.ia_cert_number,
        airframe_tt: snapshot.airframe_tt,
        tach_time: snapshot.tach_time,
        tsmoh: snapshot.tsmoh,
        ata_chapter: snapshot.ata_chapter,
        part_numbers: snapshot.part_numbers,
        ad_reference: snapshot.ad_reference,
        far_references: snapshot.far_references,
        return_to_service: snapshot.return_to_service,
        raw_text: snapshot.raw_text,
        confidence: recordConfidence,
        record_confidence: recordConfidence,
        is_verified: truthState === 'canonical',
        canonicalization_status:
          truthState === 'canonical'
            ? 'canonical'
            : truthState === 'ignore'
            ? 'rejected'
            : 'draft',
        truth_state: truthState,
        updated_at: new Date().toISOString(),
      })
      .eq('id', maintenanceEventId)

    if (updateError) {
      console.error('[canonicalize] update error:', updateError)
      return NextResponse.json({ error: 'Failed to update canonical record' }, { status: 500 })
    }
  }

  if (!maintenanceEventId) {
    return NextResponse.json({ error: 'Failed to resolve canonical record target' }, { status: 500 })
  }

  const lineage: CanonicalVersionLineageInput[] = [
    {
      fieldName: 'event_type',
      chosenValue: snapshot.event_type,
      sourcePageId: resolvedPageId,
      sourceSegmentId: targetSegment?.id ?? null,
      sourceEngine: targetSegment?.source_engine ?? base.source_engine ?? 'primary_ocr',
      sourceKind,
      precedenceRank: sourceKind === 'human_reviewed_correction' ? 1 : 2,
      validatorStatus: 'valid',
      reviewerOverride: Boolean(corrected_fields?.event_type),
      candidateValues: (candidateRows ?? []).filter((row: any) => row.field_name === 'event_type'),
    },
    {
      fieldName: 'event_date',
      chosenValue: snapshot.event_date ? String(snapshot.event_date) : null,
      sourcePageId: resolvedPageId,
      sourceSegmentId: targetSegment?.id ?? null,
      sourceEngine: targetSegment?.source_engine ?? base.source_engine ?? 'primary_ocr',
      sourceKind: corrected_fields?.event_date ? 'human_reviewed_correction' : sourceKind,
      precedenceRank: corrected_fields?.event_date ? 1 : 2,
      validatorStatus: snapshot.event_date ? 'valid' : 'suspicious',
      reviewerOverride: Boolean(corrected_fields?.event_date),
      candidateValues: (candidateRows ?? []).filter((row: any) => row.field_name === 'entry_date'),
    },
    {
      fieldName: 'tach_time',
      chosenValue: snapshot.tach_time != null ? String(snapshot.tach_time) : null,
      sourcePageId: resolvedPageId,
      sourceSegmentId: targetSegment?.id ?? null,
      sourceEngine: targetSegment?.source_engine ?? base.source_engine ?? 'primary_ocr',
      sourceKind: corrected_fields?.tach_time ? 'human_reviewed_correction' : sourceKind,
      precedenceRank: corrected_fields?.tach_time ? 1 : 2,
      validatorStatus: snapshot.tach_time != null ? 'valid' : 'suspicious',
      reviewerOverride: Boolean(corrected_fields?.tach_time),
      candidateValues: (candidateRows ?? []).filter((row: any) => row.field_name === 'tach_time'),
    },
    {
      fieldName: 'description',
      chosenValue: snapshot.description,
      sourcePageId: resolvedPageId,
      sourceSegmentId: targetSegment?.id ?? null,
      sourceEngine: targetSegment?.source_engine ?? base.source_engine ?? 'primary_ocr',
      sourceKind: corrected_fields?.work_description ? 'human_reviewed_correction' : sourceKind,
      precedenceRank: corrected_fields?.work_description ? 1 : 2,
      validatorStatus: snapshot.description ? 'valid' : 'suspicious',
      reviewerOverride: Boolean(corrected_fields?.work_description),
      candidateValues: (candidateRows ?? []).filter((row: any) => row.field_name === 'work_description'),
    },
    {
      fieldName: 'mechanic_name',
      chosenValue: snapshot.mechanic_name,
      sourcePageId: resolvedPageId,
      sourceSegmentId: targetSegment?.id ?? null,
      sourceEngine: targetSegment?.source_engine ?? base.source_engine ?? 'primary_ocr',
      sourceKind: corrected_fields?.mechanic_name ? 'human_reviewed_correction' : sourceKind,
      precedenceRank: corrected_fields?.mechanic_name ? 1 : 2,
      validatorStatus: snapshot.mechanic_name ? 'valid' : 'suspicious',
      reviewerOverride: Boolean(corrected_fields?.mechanic_name),
      candidateValues: (candidateRows ?? []).filter((row: any) => row.field_name === 'mechanic_name'),
    },
    {
      fieldName: 'mechanic_cert_number',
      chosenValue: snapshot.mechanic_cert,
      sourcePageId: resolvedPageId,
      sourceSegmentId: targetSegment?.id ?? null,
      sourceEngine: targetSegment?.source_engine ?? base.source_engine ?? 'primary_ocr',
      sourceKind: corrected_fields?.mechanic_cert_number ? 'human_reviewed_correction' : sourceKind,
      precedenceRank: corrected_fields?.mechanic_cert_number ? 1 : 2,
      validatorStatus: snapshot.mechanic_cert ? 'valid' : 'suspicious',
      reviewerOverride: Boolean(corrected_fields?.mechanic_cert_number),
      candidateValues: (candidateRows ?? []).filter((row: any) => row.field_name === 'mechanic_cert_number'),
    },
    {
      fieldName: 'ad_reference',
      chosenValue: snapshot.ad_reference,
      sourcePageId: resolvedPageId,
      sourceSegmentId: targetSegment?.id ?? null,
      sourceEngine: targetSegment?.source_engine ?? base.source_engine ?? 'primary_ocr',
      sourceKind: corrected_fields?.ad_reference ? 'human_reviewed_correction' : sourceKind,
      precedenceRank: corrected_fields?.ad_reference ? 1 : 2,
      validatorStatus: snapshot.ad_reference ? 'valid' : 'unvalidated',
      reviewerOverride: Boolean(corrected_fields?.ad_reference),
      candidateValues: (candidateRows ?? []).filter((row: any) => row.field_name === 'ad_reference'),
    },
  ]

  const version = await upsertCanonicalRecordVersion({
    supabase: service,
    maintenanceEventId,
    organizationId: orgId,
    aircraftId,
    documentId,
    sourcePageId: resolvedPageId,
    sourceSegmentId: targetSegment?.id ?? null,
    sourceSegmentGroupKey: segmentGroupKey,
    sourceKind,
    truthState,
    precedenceRule: sourceKind === 'human_reviewed_correction' ? 'human_reviewed_correction' : 'approved_segment_canonicalization',
    precedenceRank: sourceKind === 'human_reviewed_correction' ? 1 : 2,
    arbitrationStatus: (page as any).arbitration_status ?? null,
    arbitrationConfidence: recordConfidence,
    validatorSummary: {
      page_confidence: (page as any).ocr_confidence ?? null,
      segment_evidence_state: classificationPatch?.evidence_state ?? targetSegment?.evidence_state ?? null,
    },
    candidateSnapshot: {
      extracted_event_id: event?.id ?? null,
      candidate_rows: candidateRows ?? [],
    },
    fieldSnapshot: snapshot,
    diffSummary,
    changeReason:
      corrected_fields && Object.keys(corrected_fields).length > 0
        ? 'reviewer_correction'
        : 'segment_canonicalization',
    createdBy: user.id,
    createdFromReviewQueueItemId: review_queue_item_id ?? null,
    lineage,
  })

  if (event?.id) {
    await service
      .from('ocr_extracted_events')
      .update({
        review_status: truthState === 'canonical' ? 'approved' : 'needs_review',
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        linked_maintenance_event_id: maintenanceEventId,
      })
      .eq('id', event.id)
  }

  // Create a maintenance_entry_drafts row for each newly-approved event so the
  // reviewer can finalize it to a logbook_entry via /api/logbook-entries/from-draft.
  // Idempotent: skip if a draft already points at this source event.
  if (event?.id && aircraftId && truthState === 'canonical' && snapshot.event_date && snapshot.description) {
    const { data: existingDraft } = await service
      .from('maintenance_entry_drafts')
      .select('id')
      .eq('organization_id', orgId)
      .contains('structured_fields', { source_event_id: event.id })
      .maybeSingle()

    if (!existingDraft) {
      const { error: draftErr } = await service
        .from('maintenance_entry_drafts')
        .insert({
          organization_id: orgId,
          aircraft_id: aircraftId,
          created_by: user.id,
          entry_type: draftEntryTypeFromEvent(snapshot.event_type),
          logbook_type: draftLogbookType(base.logbook_type),
          ai_generated_text: snapshot.description,
          status: 'pending',
          structured_fields: {
            source_event_id: event.id,
            source_page_id: resolvedPageId,
            source_segment_id: targetSegment?.id ?? null,
            source_maintenance_event_id: maintenanceEventId,
            entry_type: snapshot.event_type,
            logbook_type: base.logbook_type ?? null,
            date: snapshot.event_date,
            tach_time: snapshot.tach_time,
            airframe_tt: snapshot.airframe_tt,
            tsmoh: snapshot.tsmoh,
            ata_chapter: snapshot.ata_chapter,
            part_numbers: snapshot.part_numbers ?? [],
            parts_used: snapshot.part_numbers ?? [],
            ad_references: adRefs,
            far_references: base.far_references ?? [],
            manual_references: base.manual_references ?? [],
            mechanic_name: snapshot.mechanic_name,
            mechanic_cert_number: snapshot.mechanic_cert,
            cert_number: snapshot.mechanic_cert,
            ia_number: snapshot.ia_cert_number,
          },
        })

      if (draftErr) {
        console.error('[canonicalize] draft create failed:', draftErr.message)
      }
    }
  }

  await service.from('maintenance_entry_evidence').insert({
    maintenance_event_id: maintenanceEventId,
    page_id: resolvedPageId,
    segment_id: targetSegment?.id ?? null,
    segment_group_key: segmentGroupKey,
    document_id: documentId,
    snippet: targetSegment?.excerpt_text ?? page.ocr_raw_text?.slice(0, 500) ?? null,
    bounding_box:
      Array.isArray(targetSegment?.bounding_regions) && targetSegment.bounding_regions.length > 0
        ? targetSegment.bounding_regions[0]
        : null,
    source_engine: targetSegment?.source_engine ?? 'primary_ocr',
    confidence: recordConfidence,
    evidence_state: truthState,
  })

  await service
    .from('ocr_page_jobs')
    .update({
      extraction_status: truthState === 'canonical' ? 'approved' : 'needs_review',
      updated_at: new Date().toISOString(),
    })
    .eq('id', resolvedPageId)

  if (targetSegment?.id) {
    await service
      .from('ocr_entry_segments')
      .update({
        document_group_id: classificationPatch?.document_group_id ?? targetSegment.document_group_id ?? null,
        document_detail_id: classificationPatch?.document_detail_id ?? targetSegment.document_detail_id ?? null,
        document_subtype: classificationPatch?.document_subtype ?? targetSegment.document_subtype ?? null,
        record_family: classificationPatch?.record_family ?? targetSegment.record_family ?? null,
        document_class: classificationPatch?.document_class ?? targetSegment.document_class ?? null,
        truth_role: classificationPatch?.truth_role ?? targetSegment.truth_role ?? null,
        parser_strategy: classificationPatch?.parser_strategy ?? targetSegment.parser_strategy ?? null,
        review_priority: classificationPatch?.review_priority ?? targetSegment.review_priority ?? null,
        canonical_eligibility: classificationPatch?.canonical_eligibility ?? targetSegment.canonical_eligibility ?? false,
        reminder_relevance: classificationPatch?.reminder_relevance ?? targetSegment.reminder_relevance ?? false,
        ad_relevance: classificationPatch?.ad_relevance ?? targetSegment.ad_relevance ?? false,
        inspection_relevance: classificationPatch?.inspection_relevance ?? targetSegment.inspection_relevance ?? false,
        completeness_relevance: classificationPatch?.completeness_relevance ?? targetSegment.completeness_relevance ?? true,
        intelligence_tags: classificationPatch?.intelligence_tags ?? targetSegment.intelligence_tags ?? [],
        evidence_state:
          truthState === 'canonical'
            ? 'canonical_candidate'
            : truthState,
        updated_at: new Date().toISOString(),
      })
      .eq('id', targetSegment.id)
  }

  const correctionEventsToInsert =
    corrected_fields && Object.keys(corrected_fields).length > 0
      ? Object.entries(corrected_fields)
          .filter(([_, correctedValue]) => correctedValue !== undefined)
          .map(([fieldName, correctedValue]) => ({
            organization_id: orgId,
            aircraft_id: aircraftId,
            document_id: documentId,
            maintenance_event_id: maintenanceEventId,
            canonical_record_version_id: version.id,
            review_queue_item_id: review_queue_item_id ?? null,
            source_page_id: resolvedPageId,
            source_segment_id: targetSegment?.id ?? null,
            source_segment_group_key: segmentGroupKey,
            field_name: fieldName,
            original_value:
              fieldName === 'work_description'
                ? (base.work_description ?? base.description ?? null)
                : (base[fieldName] ?? null),
            corrected_value: correctedValue,
            correction_reason: 'reviewer_override',
            reviewer_id: user.id,
            page_family: (page as any).page_classification ?? null,
            document_family: classificationPatch?.record_family ?? doc?.record_family ?? classificationPatch?.doc_type ?? doc?.doc_type ?? null,
            source_model_provider: targetSegment?.source_engine ?? 'primary_ocr',
            source_confidence: recordConfidence,
            correction_metadata: {
              previous_snapshot: existingEvent ?? null,
              next_snapshot: snapshot,
            },
          }))
      : []

  let firstCorrectionEventId: string | null = null
  if (correctionEventsToInsert.length > 0) {
    const { data: insertedCorrections } = await service
      .from('correction_events')
      .insert(correctionEventsToInsert)
      .select('id, field_name, original_value, corrected_value')

    firstCorrectionEventId = insertedCorrections?.[0]?.id ?? null

    if (insertedCorrections && insertedCorrections.length > 0) {
      const learningQueueRows = insertedCorrections
        .map((correction: { id: string; field_name: string; original_value: string | null; corrected_value: string | null }) =>
          buildLearningQueuePayloads({
            fieldName: correction.field_name,
            originalValue: correction.original_value,
            correctedValue: correction.corrected_value,
            documentFamily: classificationPatch?.record_family ?? doc?.record_family ?? classificationPatch?.doc_type ?? doc?.doc_type ?? null,
            pageFamily: (page as any).page_classification ?? null,
          }).map((entry) => ({
            organization_id: orgId,
            source_correction_event_id: correction.id,
            queue_type: entry.queue_type,
            status: 'pending',
            payload_json: entry.payload_json,
          }))
        )
        .flat()

      if (learningQueueRows.length > 0) {
        await service.from('learning_queue_items').insert(learningQueueRows)
      }
    }
  }

  if (review_queue_item_id) {
    await service
      .from('review_queue_items')
      .update({
        status: 'resolved',
        resolved_by: user.id,
        resolved_at: new Date().toISOString(),
        resolution_notes:
          corrected_fields && Object.keys(corrected_fields).length > 0
            ? 'Canonicalized with reviewer corrections'
            : 'Canonicalized by reviewer',
        correction_event_id: firstCorrectionEventId,
      })
      .eq('id', review_queue_item_id)
  } else {
    await service
      .from('review_queue_items')
      .update({
        status: 'resolved',
        resolved_by: user.id,
        resolved_at: new Date().toISOString(),
        resolution_notes: 'Canonicalized by reviewer',
        correction_event_id: firstCorrectionEventId,
      })
      .eq('ocr_page_job_id', resolvedPageId)
      .eq('status', 'pending')
  }

  if (aircraftId && snapshot.ad_reference) {
    await service
      .from('aircraft_ad_applicability')
      .update({
        evidence_document_id: documentId,
        evidence_page: page.page_number,
        evidence_segment_id: targetSegment?.id ?? null,
        canonical_record_version_id: version.id,
        evidence_state: truthState,
        precedence_decision: sourceKind,
        compliance_source: truthState === 'canonical' ? 'canonical_evidence' : 'review_required',
        updated_at: new Date().toISOString(),
      })
      .eq('aircraft_id', aircraftId)
      .eq('ad_number', snapshot.ad_reference)
  }

  return NextResponse.json({
    maintenance_event_id: maintenanceEventId,
    canonical_record_version_id: version.id,
    created: !existingEvent,
    truth_state: truthState,
    segment_id: targetSegment?.id ?? null,
    segment_group_key: segmentGroupKey,
  })
}
