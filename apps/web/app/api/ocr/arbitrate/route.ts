import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'

// ─── Deterministic Aviation Validators ────────────────────────────────────────

const AD_PATTERN = /^\d{4}-\d{2}-\d{2,3}$/
const PART_NUMBER_PATTERN = /^[A-Z0-9]{2,20}(-[A-Z0-9]{1,10})*$/i
const AP_CERT_PATTERN = /^\d{7}$/
const IA_CERT_PATTERN = /^\d{7}$/
const TACH_REASONABLE_MAX = 99999
const TACH_REASONABLE_MIN = 0

type ValidationResult = {
  status: 'valid' | 'invalid' | 'suspicious'
  notes: string | null
}

function validateDate(value: string | null | undefined, aircraftYear?: number): ValidationResult {
  if (!value) return { status: 'suspicious', notes: 'Date is missing' }
  const d = new Date(value)
  if (isNaN(d.getTime())) return { status: 'invalid', notes: `Cannot parse date: ${value}` }
  const now = new Date()
  if (d > now) return { status: 'invalid', notes: 'Date is in the future' }
  if (aircraftYear && d.getFullYear() < aircraftYear - 2)
    return { status: 'suspicious', notes: `Date ${d.getFullYear()} predates aircraft year ${aircraftYear}` }
  if (d.getFullYear() < 1950)
    return { status: 'invalid', notes: 'Date before 1950 is implausible' }
  return { status: 'valid', notes: null }
}

function validateTach(value: string | null | undefined, lastKnownTach?: number): ValidationResult {
  if (!value) return { status: 'suspicious', notes: 'Tach/TT missing' }
  const n = parseFloat(value)
  if (isNaN(n)) return { status: 'invalid', notes: `Cannot parse tach: ${value}` }
  if (n < TACH_REASONABLE_MIN || n > TACH_REASONABLE_MAX)
    return { status: 'invalid', notes: `Tach ${n} outside plausible range` }
  if (lastKnownTach !== undefined && n < lastKnownTach - 10)
    return { status: 'suspicious', notes: `Tach ${n} is lower than last known ${lastKnownTach}` }
  return { status: 'valid', notes: null }
}

function validateAdReference(value: string | null | undefined): ValidationResult {
  if (!value) return { status: 'valid', notes: null } // optional field
  const refs = value.split(',').map((s) => s.trim()).filter(Boolean)
  for (const ref of refs) {
    if (!AD_PATTERN.test(ref)) {
      return { status: 'suspicious', notes: `AD reference "${ref}" does not match YYYY-NN-NN pattern` }
    }
  }
  return { status: 'valid', notes: null }
}

function validateCertNumber(value: string | null | undefined, type: 'ap' | 'ia'): ValidationResult {
  if (!value) return { status: 'suspicious', notes: `${type.toUpperCase()} certificate number missing` }
  const pattern = type === 'ap' ? AP_CERT_PATTERN : IA_CERT_PATTERN
  if (!pattern.test(value.replace(/\D/g, '')))
    return { status: 'suspicious', notes: `${type.toUpperCase()} cert "${value}" does not match 7-digit format` }
  return { status: 'valid', notes: null }
}

function detectInspectionType(description: string | null | undefined): string | null {
  if (!description) return null
  const d = description.toLowerCase()
  if (/annual\s+inspection|annual\s+airworthiness/i.test(d)) return 'annual'
  if (/100.?hour|100\s*hr/i.test(d)) return '100hr'
  if (/progressive\s+inspection/i.test(d)) return 'progressive'
  if (/return.{0,10}service|approved.{0,10}return/i.test(d)) return 'rts'
  return null
}

// ─── Field comparison ─────────────────────────────────────────────────────────

type Candidate = {
  engine: string
  value: string | null
  confidence: number
}

function compareFieldCandidates(candidates: Candidate[]): {
  agreementScore: number
  proposed: string | null
  proposedEngine: string
  isConflict: boolean
  conflictReason: string | null
  severity: 'low' | 'medium' | 'high' | 'critical'
} {
  const withValues = candidates.filter((c) => c.value !== null && c.value !== '')

  if (withValues.length === 0) {
    return {
      agreementScore: 0,
      proposed: null,
      proposedEngine: 'none',
      isConflict: false,
      conflictReason: null,
      severity: 'low',
    }
  }

  if (withValues.length === 1) {
    return {
      agreementScore: withValues[0].confidence,
      proposed: withValues[0].value,
      proposedEngine: withValues[0].engine,
      isConflict: false,
      conflictReason: null,
      severity: 'low',
    }
  }

  // Normalise values for comparison
  const normalise = (v: string) => v.trim().toLowerCase().replace(/\s+/g, ' ')
  const groups = new Map<string, Candidate[]>()
  for (const c of withValues) {
    const k = normalise(c.value!)
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push(c)
  }

  if (groups.size === 1) {
    // Full agreement
    const best = withValues.reduce((a, b) => (a.confidence > b.confidence ? a : b))
    return {
      agreementScore: 1.0,
      proposed: best.value,
      proposedEngine: best.engine,
      isConflict: false,
      conflictReason: null,
      severity: 'low',
    }
  }

  // Disagreement — pick highest-confidence candidate
  const best = withValues.reduce((a, b) => (a.confidence > b.confidence ? a : b))
  const agreementScore = best.confidence * (1 / groups.size)

  let severity: 'low' | 'medium' | 'high' | 'critical' = 'medium'
  if (groups.size > 2 || agreementScore < 0.3) severity = 'high'

  return {
    agreementScore,
    proposed: best.value,
    proposedEngine: best.engine,
    isConflict: true,
    conflictReason: 'engine_disagreement',
    severity,
  }
}

// ─── POST /api/ocr/arbitrate ──────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { page_id } = body as { page_id: string }
  if (!page_id) return NextResponse.json({ error: 'page_id required' }, { status: 400 })

  const service = createServiceSupabase()

  // Load page + org membership check
  const { data: page } = await supabase
    .from('ocr_page_jobs')
    .select('*, document:document_id(aircraft_id, organization_id)')
    .eq('id', page_id)
    .single()

  if (!page) return NextResponse.json({ error: 'Page not found' }, { status: 404 })

  const orgId = (page as any).document?.organization_id
  if (!orgId) return NextResponse.json({ error: 'Could not determine org' }, { status: 400 })

  // Load all extraction runs for this page
  const { data: runs } = await service
    .from('extraction_runs')
    .select('*')
    .eq('page_id', page_id)

  // Load all field candidates
  const { data: rawCandidates } = await service
    .from('extracted_field_candidates')
    .select('*')
    .eq('page_id', page_id)

  // Load aircraft for timeline context
  const aircraftId = (page as any).document?.aircraft_id
  let aircraftYear: number | undefined
  let lastKnownTach: number | undefined
  if (aircraftId) {
    const { data: ac } = await service
      .from('aircraft')
      .select('year, tach_time')
      .eq('id', aircraftId)
      .single()
    if (ac) {
      aircraftYear = ac.year ?? undefined
      lastKnownTach = ac.tach_time ?? undefined
    }
  }

  // Group candidates by field
  const CRITICAL_FIELDS = ['entry_date', 'tach_time', 'ad_reference', 'return_to_service']
  const candidatesByField = new Map<string, Candidate[]>()

  if (rawCandidates) {
    for (const c of rawCandidates) {
      if (!candidatesByField.has(c.field_name)) candidatesByField.set(c.field_name, [])
      candidatesByField.get(c.field_name)!.push({
        engine: c.source_engine,
        value: c.candidate_value,
        confidence: c.raw_confidence ?? 0.5,
      })
    }
  }

  // If no field candidates yet, try to build them from the raw ocr_page_job extraction
  if (candidatesByField.size === 0 && page.ocr_raw_text) {
    // Single-engine fallback: use existing ocr_extracted_events data
    const { data: event } = await service
      .from('ocr_extracted_events')
      .select('*')
      .eq('ocr_page_job_id', page_id)
      .maybeSingle()

    if (event) {
      const conf = page.ocr_confidence ?? 0.7
      const engine = 'primary_ocr'
      const fieldMap: Record<string, string | null> = {
        entry_date: event.event_date,
        tach_time: event.tach_time?.toString() ?? null,
        work_description: event.work_description,
        mechanic_name: event.mechanic_name,
        mechanic_cert_number: event.mechanic_cert_number,
        ad_reference: Array.isArray(event.ad_references)
          ? (event.ad_references as string[]).join(', ')
          : null,
      }
      for (const [field, value] of Object.entries(fieldMap)) {
        candidatesByField.set(field, [{ engine, value, confidence: conf }])
      }
    }
  }

  // ── Run per-field validation + comparison ─────────────────────────────────

  const fieldResults: Record<string, {
    proposed: string | null
    agreementScore: number
    isConflict: boolean
    conflictReason: string | null
    severity: 'low' | 'medium' | 'high' | 'critical'
    validationStatus: 'valid' | 'invalid' | 'suspicious'
    validationNotes: string | null
  }> = {}

  let totalConfidence = 0
  let fieldCount = 0
  const validatorWarnings: string[] = []
  const conflictsToInsert: any[] = []

  for (const [fieldName, candidates] of candidatesByField.entries()) {
    const comparison = compareFieldCandidates(candidates)
    const proposed = comparison.proposed

    // Run validator for the field
    let validation: ValidationResult = { status: 'valid', notes: null }
    if (fieldName === 'entry_date') {
      validation = validateDate(proposed, aircraftYear)
    } else if (fieldName === 'tach_time') {
      validation = validateTach(proposed, lastKnownTach)
    } else if (fieldName === 'ad_reference') {
      validation = validateAdReference(proposed)
    } else if (fieldName === 'mechanic_cert_number') {
      validation = validateCertNumber(proposed, 'ap')
    } else if (fieldName === 'ia_cert_number') {
      validation = validateCertNumber(proposed, 'ia')
    }

    if (validation.notes) validatorWarnings.push(`[${fieldName}] ${validation.notes}`)

    // Compliance-critical fields use stricter confidence weighting
    const criticalMultiplier = CRITICAL_FIELDS.includes(fieldName) ? 1.5 : 1.0
    const fieldConf =
      (comparison.agreementScore * 0.7 +
        (validation.status === 'valid' ? 0.3 : validation.status === 'suspicious' ? 0.1 : 0) ) *
      criticalMultiplier

    totalConfidence += fieldConf
    fieldCount++

    fieldResults[fieldName] = {
      proposed,
      agreementScore: comparison.agreementScore,
      isConflict: comparison.isConflict,
      conflictReason: comparison.conflictReason,
      severity: comparison.severity,
      validationStatus: validation.status,
      validationNotes: validation.notes,
    }

    // Queue conflict record
    if (comparison.isConflict) {
      conflictsToInsert.push({
        page_id,
        field_name: fieldName,
        candidate_values: candidates.map((c) => ({
          engine: c.engine,
          value: c.value,
          confidence: c.confidence,
        })),
        conflict_reason: comparison.conflictReason,
        severity: comparison.severity,
        resolution_status: 'pending',
      })
    }
  }

  // ── Detect inspection type from description ───────────────────────────────

  const description = fieldResults['work_description']?.proposed
  const detectedType = detectInspectionType(description)
  const pageClassification = page.page_classification

  // ── Calculate overall confidence + make decision ──────────────────────────

  const pageConf = page.ocr_confidence ?? 0.7
  const fieldAvg = fieldCount > 0 ? totalConfidence / fieldCount : pageConf
  const overallConfidence = Math.min(1.0, (pageConf * 0.4 + fieldAvg * 0.6))

  let arbitrationStatus: 'auto_accept' | 'accept_with_caution' | 'review_required' | 'reject'

  const hasCriticalConflict = conflictsToInsert.some(
    (c) => c.severity === 'critical' || (c.severity === 'high' && CRITICAL_FIELDS.includes(c.field_name))
  )
  const hasCriticalValidationFailure = validatorWarnings.some(
    (w) => w.includes('[entry_date]') || w.includes('[tach_time]') || w.includes('[ad_reference]')
  )

  if (hasCriticalConflict || hasCriticalValidationFailure || overallConfidence < 0.5) {
    arbitrationStatus = 'reject'
  } else if (overallConfidence < 0.7 || conflictsToInsert.length > 0) {
    arbitrationStatus = 'review_required'
  } else if (overallConfidence < 0.9) {
    arbitrationStatus = 'accept_with_caution'
  } else {
    arbitrationStatus = 'auto_accept'
  }

  const reasoning = {
    overall_confidence: overallConfidence,
    page_confidence: pageConf,
    field_avg_confidence: fieldAvg,
    field_count: fieldCount,
    conflict_count: conflictsToInsert.length,
    validator_warnings: validatorWarnings,
    detected_inspection_type: detectedType,
    page_classification: pageClassification,
    field_results: fieldResults,
  }

  // ── Persist: update page, insert conflicts ────────────────────────────────

  await service
    .from('ocr_page_jobs')
    .update({
      arbitration_status: arbitrationStatus,
      arbitration_confidence: overallConfidence,
      arbitration_reasoning: reasoning,
      extraction_status:
        arbitrationStatus === 'auto_accept' || arbitrationStatus === 'accept_with_caution'
          ? 'approved'
          : arbitrationStatus === 'review_required'
          ? 'needs_review'
          : 'rejected',
      needs_human_review: arbitrationStatus === 'review_required' || arbitrationStatus === 'reject',
      updated_at: new Date().toISOString(),
    })
    .eq('id', page_id)

  // Insert conflict records (replace previous)
  if (conflictsToInsert.length > 0) {
    await service.from('field_conflicts').delete().eq('page_id', page_id)
    await service.from('field_conflicts').insert(conflictsToInsert)
  }

  // Create/update review queue item if needed
  if (arbitrationStatus === 'review_required' || arbitrationStatus === 'reject') {
    const { data: existing } = await service
      .from('review_queue_items')
      .select('id')
      .eq('ocr_page_job_id', page_id)
      .eq('status', 'pending')
      .maybeSingle()

    if (!existing) {
      const { data: pageJob } = await service
        .from('ocr_page_jobs')
        .select('document_id, aircraft_id')
        .eq('id', page_id)
        .single()

      if (pageJob) {
        await service.from('review_queue_items').insert({
          organization_id: orgId,
          aircraft_id: pageJob.aircraft_id,
          ocr_page_job_id: page_id,
          queue_type: 'ocr_page',
          priority: arbitrationStatus === 'reject' ? 'high' : 'normal',
          reason: validatorWarnings.length > 0
            ? validatorWarnings.slice(0, 3).join('; ')
            : `${conflictsToInsert.length} field conflict(s)`,
          status: 'pending',
        })
      }
    }
  }

  return NextResponse.json({
    arbitration_status: arbitrationStatus,
    confidence: overallConfidence,
    conflicts: conflictsToInsert.length,
    validator_warnings: validatorWarnings,
    field_results: fieldResults,
    detected_inspection_type: detectedType,
  })
}
