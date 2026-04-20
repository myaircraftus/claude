import { createServiceSupabase } from '@/lib/supabase/server'
import { fieldSpecificPrecedenceRule } from '@/lib/ocr/precedence'

type ServiceClient = ReturnType<typeof createServiceSupabase>

export interface CanonicalVersionLineageInput {
  fieldName: string
  chosenValue: string | null
  chosenNormalizedValue?: string | null
  sourcePageId?: string | null
  sourceSegmentId?: string | null
  sourceEngine?: string | null
  sourceKind: string
  precedenceRank: number
  precedenceRule?: string
  validatorStatus?: 'valid' | 'invalid' | 'suspicious' | 'unvalidated' | null
  validatorNotes?: string | null
  reviewerOverride?: boolean
  humanReviewRequired?: boolean
  candidateValues?: Array<Record<string, unknown>>
}

export async function upsertCanonicalRecordVersion(args: {
  supabase: ServiceClient
  maintenanceEventId: string
  organizationId: string
  aircraftId?: string | null
  documentId?: string | null
  sourcePageId?: string | null
  sourceSegmentId?: string | null
  sourceSegmentGroupKey?: string | null
  sourceKind: string
  truthState: 'canonical' | 'informational_only' | 'review_required' | 'ignore' | 'non_canonical_evidence'
  precedenceRule?: string | null
  precedenceRank?: number | null
  arbitrationStatus?: string | null
  arbitrationConfidence?: number | null
  validatorSummary?: Record<string, unknown>
  candidateSnapshot?: Record<string, unknown>
  fieldSnapshot: Record<string, unknown>
  diffSummary?: Record<string, unknown>
  changeReason?: string | null
  createdBy?: string | null
  createdFromReviewQueueItemId?: string | null
  lineage: CanonicalVersionLineageInput[]
}) {
  const { data: previousCurrent } = await args.supabase
    .from('canonical_record_versions')
    .select('id, version_number, field_snapshot')
    .eq('maintenance_event_id', args.maintenanceEventId)
    .eq('is_current', true)
    .maybeSingle()

  const nextVersionNumber = ((previousCurrent?.version_number as number | null) ?? 0) + 1

  if (previousCurrent?.id) {
    await args.supabase
      .from('canonical_record_versions')
      .update({ is_current: false })
      .eq('id', previousCurrent.id)
  }

  const { data: insertedVersion, error } = await args.supabase
    .from('canonical_record_versions')
    .insert({
      maintenance_event_id: args.maintenanceEventId,
      organization_id: args.organizationId,
      aircraft_id: args.aircraftId ?? null,
      document_id: args.documentId ?? null,
      source_page_id: args.sourcePageId ?? null,
      source_segment_id: args.sourceSegmentId ?? null,
      source_segment_group_key: args.sourceSegmentGroupKey ?? null,
      version_number: nextVersionNumber,
      is_current: true,
      source_kind: args.sourceKind,
      truth_state: args.truthState,
      precedence_rule: args.precedenceRule ?? null,
      precedence_rank: args.precedenceRank ?? null,
      arbitration_status: args.arbitrationStatus ?? null,
      arbitration_confidence: args.arbitrationConfidence ?? null,
      validator_summary: args.validatorSummary ?? {},
      candidate_snapshot: args.candidateSnapshot ?? {},
      field_snapshot: args.fieldSnapshot,
      diff_summary_json: args.diffSummary ?? {},
      change_reason: args.changeReason ?? null,
      created_by: args.createdBy ?? null,
      created_from_review_queue_item_id: args.createdFromReviewQueueItemId ?? null,
      supersedes_version_id: previousCurrent?.id ?? null,
    })
    .select('id, version_number')
    .single()

  if (error || !insertedVersion) {
    throw new Error(`Failed to create canonical record version: ${error?.message ?? 'unknown error'}`)
  }

  if (args.lineage.length > 0) {
    await args.supabase.from('canonical_field_lineage').insert(
      args.lineage.map((lineage) => ({
        canonical_record_version_id: insertedVersion.id,
        maintenance_event_id: args.maintenanceEventId,
        organization_id: args.organizationId,
        field_name: lineage.fieldName,
        chosen_value: lineage.chosenValue,
        chosen_normalized_value: lineage.chosenNormalizedValue ?? lineage.chosenValue,
        source_page_id: lineage.sourcePageId ?? null,
        source_segment_id: lineage.sourceSegmentId ?? null,
        source_engine: lineage.sourceEngine ?? null,
        source_kind: lineage.sourceKind,
        precedence_rank: lineage.precedenceRank,
        precedence_rule: lineage.precedenceRule ?? fieldSpecificPrecedenceRule(lineage.fieldName),
        validator_status: lineage.validatorStatus ?? 'unvalidated',
        validator_notes: lineage.validatorNotes ?? null,
        reviewer_override: lineage.reviewerOverride ?? false,
        human_review_required: lineage.humanReviewRequired ?? false,
        candidate_values: lineage.candidateValues ?? [],
        model_version: process.env.OPENAI_OCR_MODEL ?? process.env.OPENAI_CHAT_MODEL ?? null,
        prompt_version: process.env.OPENAI_PROMPT_VERSION ?? 'ocr-v1',
        rule_version: process.env.OPENAI_RULE_VERSION ?? 'aviation-grade-v1',
      }))
    )
  }

  await args.supabase
    .from('maintenance_events')
    .update({
      current_version_number: insertedVersion.version_number,
      current_canonical_version_id: insertedVersion.id,
      truth_state: args.truthState,
    })
    .eq('id', args.maintenanceEventId)

  return insertedVersion
}
