import { createServiceSupabase } from '@/lib/supabase/server'
import { v4 as uuidv4 } from 'uuid'

export interface DetectionInput {
  aircraftId: string
  organizationId: string
  triggeredBy: string | null
  triggerSource?: string
}

type FindingRecord = {
  finding_type: string
  severity: 'critical' | 'warning' | 'info'
  title: string
  description: string
  recommendation?: string
  affected_date_start?: string
  affected_date_end?: string
  affected_component?: string
  source_event_ids?: string[]
  source_document_ids?: string[]
}

export async function detectMissingRecords(input: DetectionInput): Promise<string> {
  const supabase = createServiceSupabase()
  const runId = uuidv4()

  await supabase.from('findings_runs').insert({
    id: runId,
    aircraft_id: input.aircraftId,
    organization_id: input.organizationId,
    triggered_by: input.triggeredBy,
    trigger_source: input.triggerSource ?? 'manual',
    status: 'running',
  })

  try {
    const [eventsRes, docsRes, aircraftRes, adRes] = await Promise.all([
      supabase
        .from('maintenance_events')
        .select('*')
        .eq('aircraft_id', input.aircraftId)
        .order('entry_date', { ascending: true }),
      supabase
        .from('documents')
        .select('*')
        .eq('aircraft_id', input.aircraftId),
      supabase
        .from('aircraft')
        .select('*')
        .eq('id', input.aircraftId)
        .single(),
      supabase
        .from('aircraft_ad_applicability')
        .select('*')
        .eq('aircraft_id', input.aircraftId),
    ])

    const events = eventsRes.data ?? []
    const documents = docsRes.data ?? []
    const aircraft = aircraftRes.data
    const adRecords = adRes.data ?? []

    if (!aircraft) throw new Error('Could not load aircraft data')

    const findings: FindingRecord[] = []

    findings.push(...detectAnnualGaps(events))
    findings.push(...detectInspectionGaps(events))
    findings.push(...detectLogbookContinuityGaps(events))
    findings.push(...detectMissingEngineDocumentation(events, documents))
    findings.push(...detectMissingRequiredDocuments(documents))
    findings.push(...detectMissing337ForRepairs(events, documents))
    findings.push(...detectTimeDiscrepancies(events))
    findings.push(...detectAdComplianceGaps(adRecords, events))

    if (findings.length > 0) {
      await supabase.from('record_findings').insert(
        findings.map(f => ({
          ...f,
          aircraft_id: input.aircraftId,
          organization_id: input.organizationId,
          findings_run_id: runId,
        }))
      )
    }

    await supabase
      .from('findings_runs')
      .update({
        status: 'completed',
        findings_count: findings.length,
        critical_count: findings.filter(f => f.severity === 'critical').length,
        warning_count: findings.filter(f => f.severity === 'warning').length,
        info_count: findings.filter(f => f.severity === 'info').length,
        completed_at: new Date().toISOString(),
      })
      .eq('id', runId)
  } catch (err: any) {
    await supabase
      .from('findings_runs')
      .update({
        status: 'failed',
        error_message: err?.message ?? 'Unknown error',
        completed_at: new Date().toISOString(),
      })
      .eq('id', runId)
    throw err
  }

  return runId
}

// --- Detection Rules ---

function detectAnnualGaps(events: any[]): FindingRecord[] {
  const findings: FindingRecord[] = []
  const annuals = events
    .filter((e: any) => e.event_type === 'annual_inspection')
    .sort(
      (a: any, b: any) =>
        new Date(a.entry_date).getTime() - new Date(b.entry_date).getTime()
    )

  if (annuals.length === 0) {
    findings.push({
      finding_type: 'missing_annual_gap',
      severity: 'critical',
      title: 'No Annual Inspection Records Found',
      description:
        'No annual inspection entries were found in the digitized records for this aircraft. Annual inspections are required every 12 calendar months under 14 CFR 91.409.',
      recommendation:
        'Locate and upload all logbooks. If annual records are confirmed missing, consult an A&P/IA regarding regulatory status.',
      affected_component: 'airframe',
    })
    return findings
  }

  for (let i = 1; i < annuals.length; i++) {
    const prev = new Date(annuals[i - 1].entry_date)
    const curr = new Date(annuals[i].entry_date)
    const monthGap =
      (curr.getFullYear() - prev.getFullYear()) * 12 +
      (curr.getMonth() - prev.getMonth())

    if (monthGap > 14) {
      const gapYears = Math.round(monthGap / 12)
      findings.push({
        finding_type: 'missing_annual_gap',
        severity: monthGap > 24 ? 'critical' : 'warning',
        title: `Annual Inspection Gap: ${formatDateShort(prev)} to ${formatDateShort(curr)}`,
        description: `There is a ${gapYears}-year gap between the annual inspection dated ${formatDate(prev)} and the next annual dated ${formatDate(curr)}. 14 CFR 91.409 requires an annual inspection every 12 calendar months.`,
        recommendation:
          'Locate logbooks covering this period. If records are confirmed missing, document the gap and consult your IA.',
        affected_date_start: prev.toISOString().split('T')[0],
        affected_date_end: curr.toISOString().split('T')[0],
        affected_component: 'airframe',
        source_event_ids: [annuals[i - 1].id, annuals[i].id],
      })
    }
  }

  const lastAnnual = annuals[annuals.length - 1]
  const lastAnnualDate = new Date(lastAnnual.entry_date)
  const nextDue = new Date(lastAnnualDate)
  nextDue.setFullYear(nextDue.getFullYear() + 1)
  if (nextDue < new Date()) {
    findings.push({
      finding_type: 'missing_annual_gap',
      severity: 'critical',
      title: 'Annual Inspection Overdue',
      description: `The most recent annual inspection was performed on ${formatDate(lastAnnualDate)}. The next annual was due by ${formatDate(nextDue)}, which is ${daysBetween(nextDue, new Date())} days ago.`,
      recommendation:
        'Schedule an annual inspection with a licensed IA immediately. Aircraft may not be operated under 14 CFR Part 91.',
      affected_date_start: nextDue.toISOString().split('T')[0],
      affected_component: 'airframe',
      source_event_ids: [lastAnnual.id],
    })
  }

  return findings
}

function detectInspectionGaps(events: any[]): FindingRecord[] {
  const findings: FindingRecord[] = []

  const checks = [
    {
      eventType: 'elt_inspection',
      findingType: 'missing_elt_inspection',
      label: 'ELT Inspection',
      regulation: '14 CFR 91.207',
      intervalMonths: 24,
      severity: 'warning' as const,
    },
    {
      eventType: 'transponder_test',
      findingType: 'missing_transponder_test',
      label: 'Transponder Test',
      regulation: '14 CFR 91.413',
      intervalMonths: 24,
      severity: 'warning' as const,
    },
    {
      eventType: 'pitot_static_test',
      findingType: 'missing_pitot_static_test',
      label: 'Pitot-Static System Test',
      regulation: '14 CFR 91.411',
      intervalMonths: 24,
      severity: 'warning' as const,
    },
  ]

  for (const check of checks) {
    const inspections = events
      .filter((e: any) => e.event_type === check.eventType)
      .sort(
        (a: any, b: any) =>
          new Date(b.entry_date).getTime() - new Date(a.entry_date).getTime()
      )

    if (inspections.length === 0) {
      findings.push({
        finding_type: check.findingType,
        severity: check.severity,
        title: `No ${check.label} Records Found`,
        description: `No ${check.label} entries were found in the digitized records. ${check.regulation} requires this inspection every ${check.intervalMonths} calendar months.`,
        recommendation: `Check if records exist in undigitized logbooks. Ensure currency before IFR operations.`,
        affected_component: 'airframe',
      })
    } else {
      const last = inspections[0]
      const lastDate = new Date(last.entry_date)
      const nextDue = new Date(lastDate)
      nextDue.setMonth(nextDue.getMonth() + check.intervalMonths)
      if (nextDue < new Date()) {
        findings.push({
          finding_type: check.findingType,
          severity: check.severity,
          title: `${check.label} Overdue`,
          description: `Last ${check.label} was ${formatDate(lastDate)}. Next due: ${formatDate(nextDue)} (${daysBetween(nextDue, new Date())} days overdue). Required by ${check.regulation}.`,
          recommendation: `Schedule ${check.label} with a qualified shop.`,
          affected_date_start: nextDue.toISOString().split('T')[0],
          affected_component: 'airframe',
          source_event_ids: [last.id],
        })
      }
    }
  }

  return findings
}

function detectLogbookContinuityGaps(events: any[]): FindingRecord[] {
  const findings: FindingRecord[] = []

  const engineEvents = events
    .filter((e: any) =>
      ['engine_log', 'engine_oil_change', 'compression_check', 'annual_inspection'].includes(
        e.event_type
      )
    )
    .filter((e: any) => e.aircraft_total_time != null)
    .sort((a: any, b: any) => a.aircraft_total_time - b.aircraft_total_time)

  for (let i = 1; i < engineEvents.length; i++) {
    const timeDelta =
      engineEvents[i].aircraft_total_time - engineEvents[i - 1].aircraft_total_time
    if (timeDelta > 500) {
      findings.push({
        finding_type: 'missing_engine_log_continuity',
        severity: 'warning',
        title: `Engine Log Gap: ${engineEvents[i - 1].aircraft_total_time}h to ${engineEvents[i].aircraft_total_time}h`,
        description: `There is a gap of ${Math.round(timeDelta)} hours between logged engine entries. This may indicate missing logbook pages or an undigitized maintenance book covering this period.`,
        recommendation:
          'Verify that all engine logbooks have been scanned. If a gap exists in the physical records, note it in the aircraft file.',
        affected_component: 'engine',
        source_event_ids: [engineEvents[i - 1].id, engineEvents[i].id],
      })
    }
  }

  return findings
}

function detectMissingEngineDocumentation(events: any[], documents: any[]): FindingRecord[] {
  const findings: FindingRecord[] = []

  const overhauls = events.filter((e: any) =>
    ['engine_overhaul', 'engine_replacement'].includes(e.event_type)
  )

  const has8130 = documents.some((d: any) => d.doc_type === 'form_8130')
  const hasWorkOrder = documents.some((d: any) => d.doc_type === 'work_order')

  if (overhauls.length > 0 && !has8130 && !hasWorkOrder) {
    findings.push({
      finding_type: 'missing_overhaul_documentation',
      severity: 'warning',
      title: 'Engine Overhaul — Supporting Documentation Missing',
      description: `${overhauls.length} engine overhaul/replacement event(s) found in records, but no Form 8130-3 or shop work order documentation was found. Overhaul paperwork (8130, yellow tags, shop invoice) should accompany a factory or major overhaul.`,
      recommendation:
        'Obtain copies of the overhaul work order, 8130-3 certificate, and any yellow tags from the overhaul shop.',
      affected_component: 'engine',
      source_event_ids: overhauls.map((o: any) => o.id),
    })
  }

  return findings
}

function detectMissingRequiredDocuments(documents: any[]): FindingRecord[] {
  const findings: FindingRecord[] = []

  const required = [
    {
      type: 'registration',
      findingType: 'missing_registration',
      label: 'Aircraft Registration (FAA Form AC 8050-1)',
      regulation: '14 CFR 91.203(a)(1)',
      severity: 'critical' as const,
    },
    {
      type: 'airworthiness_cert',
      findingType: 'missing_airworthiness_cert',
      label: 'Airworthiness Certificate',
      regulation: '14 CFR 91.203(a)(1)',
      severity: 'critical' as const,
    },
    {
      type: 'weight_balance',
      findingType: 'missing_weight_balance',
      label: 'Current Weight and Balance',
      regulation: '14 CFR Part 23',
      severity: 'warning' as const,
    },
  ]

  for (const req of required) {
    const hasDoc = documents.some((d: any) => d.doc_type === req.type)
    if (!hasDoc) {
      findings.push({
        finding_type: req.findingType,
        severity: req.severity,
        title: `Missing: ${req.label}`,
        description: `No ${req.label} was found in the digitized aircraft records. This document is required to be carried aboard or on file per ${req.regulation}.`,
        recommendation: `Upload a copy of the ${req.label} to complete the aircraft record file.`,
        affected_component: 'airframe',
      })
    }
  }

  return findings
}

function detectMissing337ForRepairs(events: any[], documents: any[]): FindingRecord[] {
  const findings: FindingRecord[] = []

  const majorRepairEvents = events.filter(
    (e: any) => e.event_type === 'major_repair' || e.event_type === 'major_alteration'
  )
  const has337 = documents.some((d: any) => d.doc_type === 'form_337')

  if (majorRepairEvents.length > 0 && !has337) {
    findings.push({
      finding_type: 'missing_form_337',
      severity: 'critical',
      title: 'Major Repair/Alteration — No Form 337 Found',
      description: `${majorRepairEvents.length} major repair or alteration event(s) found in records, but no FAA Form 337 was found in the aircraft file. FAA Form 337 is required for all major repairs and alterations under 14 CFR Part 43.`,
      recommendation:
        'Locate the original Form 337 from the performing A&P/IA or the FAA Aircraft Certification Office. Submit a copy to the FAA and retain the original in the aircraft records.',
      affected_component: 'airframe',
      source_event_ids: majorRepairEvents.map((e: any) => e.id),
    })
  }

  return findings
}

function detectTimeDiscrepancies(events: any[]): FindingRecord[] {
  const findings: FindingRecord[] = []

  const timedEvents = events
    .filter((e: any) => e.aircraft_total_time != null)
    .sort(
      (a: any, b: any) =>
        new Date(a.entry_date).getTime() - new Date(b.entry_date).getTime()
    )

  for (let i = 1; i < timedEvents.length; i++) {
    const prev = timedEvents[i - 1]
    const curr = timedEvents[i]
    if (curr.aircraft_total_time < prev.aircraft_total_time) {
      findings.push({
        finding_type: 'time_regression',
        severity: 'warning',
        title: `Time Regression Detected: ${prev.aircraft_total_time}h → ${curr.aircraft_total_time}h`,
        description: `Entry dated ${formatDate(new Date(curr.entry_date))} shows aircraft total time of ${curr.aircraft_total_time}h, which is less than the prior entry dated ${formatDate(new Date(prev.entry_date))} showing ${prev.aircraft_total_time}h. Aircraft total time should never decrease.`,
        recommendation:
          'Review the original logbook pages for these entries. One of the times may be a transcription error.',
        affected_component: 'airframe',
        source_event_ids: [prev.id, curr.id],
      })
    }
  }

  return findings
}

function detectAdComplianceGaps(adRecords: any[], events: any[]): FindingRecord[] {
  const findings: FindingRecord[] = []

  const openAds = adRecords.filter((a: any) => a.compliance_status === 'open')
  const unknownAds = adRecords.filter((a: any) => a.compliance_status === 'unknown')

  if (openAds.length > 0) {
    findings.push({
      finding_type: 'missing_ad_compliance_record',
      severity: 'critical',
      title: `${openAds.length} Open Airworthiness Directive(s)`,
      description: `${openAds.length} applicable Airworthiness Directive(s) are marked as open (not complied with): ${openAds.map((a: any) => a.ad_number).join(', ')}. Aircraft may not be operated with open ADs.`,
      recommendation: 'Review each open AD with a licensed A&P/IA and comply as required.',
      affected_component: 'airframe',
    })
  }

  if (unknownAds.length > 0) {
    findings.push({
      finding_type: 'missing_ad_compliance_record',
      severity: 'warning',
      title: `${unknownAds.length} AD(s) With Unknown Compliance Status`,
      description: `${unknownAds.length} applicable AD(s) do not have a verified compliance record in the aircraft file: ${unknownAds.map((a: any) => a.ad_number).join(', ')}.`,
      recommendation:
        'Search the logbooks for compliance entries for each AD. If no record exists, consult an A&P/IA.',
      affected_component: 'airframe',
    })
  }

  return findings
}

// --- Helpers ---
function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}
function formatDateShort(d: Date): string {
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short' })
}
function daysBetween(a: Date, b: Date): number {
  return Math.floor(Math.abs(b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24))
}
