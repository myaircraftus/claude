import OpenAI from 'openai'
import { createServerSupabase } from '@/lib/supabase/server'
import { renderReportToPDF } from './pdfRenderer'

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

export type PacketAudience = 'prebuy_packet' | 'lender_packet' | 'insurer_packet'

export async function generatePrebuyPacket(
  aircraftId: string,
  audience: PacketAudience,
  options: Record<string, unknown> = {}
): Promise<Buffer> {
  const supabase = createServerSupabase()

  const [
    { data: aircraft },
    { data: status },
    { data: events },
    { data: findings },
    { data: adRecords },
    { data: documents },
  ] = await Promise.all([
    supabase.from('aircraft').select('*').eq('id', aircraftId).single(),
    supabase.from('aircraft_computed_status').select('*').eq('aircraft_id', aircraftId).single(),
    supabase.from('maintenance_events').select('*').eq('aircraft_id', aircraftId).order('entry_date', { ascending: true }),
    supabase.from('record_findings').select('*').eq('aircraft_id', aircraftId).eq('is_resolved', false).order('severity'),
    supabase.from('aircraft_ad_applicability').select('*').eq('aircraft_id', aircraftId),
    supabase.from('documents').select('id, document_type, title').eq('aircraft_id', aircraftId),
  ])

  // Identify major events
  const majorRepairs = events?.filter(e => ['major_repair', 'major_alteration'].includes(e.event_type)) ?? []
  const engineOverhauls = events?.filter(e => ['engine_overhaul', 'engine_replacement'].includes(e.event_type)) ?? []
  const propOverhauls = events?.filter(e => ['prop_overhaul', 'prop_replacement'].includes(e.event_type)) ?? []
  const annuals = events?.filter(e => e.event_type === 'annual_inspection') ?? []

  // Detect damage history indicators (major repairs to primary structure)
  const damageIndicators = majorRepairs.filter(e => {
    const desc = (e.work_description ?? '').toLowerCase()
    return desc.includes('damage') || desc.includes('bent') || desc.includes('fire') ||
           desc.includes('ground loop') || desc.includes('prop strike') || desc.includes('gear collapse')
  })

  // Build audience-specific executive summary
  const audienceContext: Record<PacketAudience, string> = {
    prebuy_packet: 'You are preparing a prebuy inspection summary for an aircraft buyer. Focus on airworthiness risks, value-affecting issues, and what a buyer should know.',
    lender_packet: 'You are preparing a collateral assessment for an aircraft lender. Focus on document completeness, compliance status, and factors affecting the aircraft as loan security.',
    insurer_packet: 'You are preparing an underwriting summary for an aviation insurance company. Focus on maintenance history, accident/incident indicators, compliance status, and risk factors.',
  }

  const executiveSummaryPrompt = `
${audienceContext[audience]}

Aircraft: ${aircraft?.make} ${aircraft?.model} (${aircraft?.tail_number}), S/N ${aircraft?.serial_number}, Year ${aircraft?.year}
Engine: ${aircraft?.engine_make} ${aircraft?.engine_model}
Total Time: ${status?.airframe_total_time ?? 'Unknown'}h
Engine SMOH: ${status?.engine_time_since_overhaul ?? 'Unknown'}h
Annual Status: ${status?.annual_is_current ? 'Current' : 'OVERDUE'}, last ${status?.last_annual_date}
AD Status: ${status?.ads_complied} complied, ${status?.ads_open} open, ${status?.ads_unknown} unknown
Major Repairs: ${majorRepairs.length}
Damage Indicators: ${damageIndicators.length}
Open Findings: ${findings?.length ?? 0} (${findings?.filter(f => f.severity === 'critical').length ?? 0} critical)

Write a concise 3-4 paragraph executive summary for this aircraft. Be specific, accurate, and clear about any risks or concerns.
Flag the most important issues in the first paragraph.
`

  const completion = await getOpenAI().chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: executiveSummaryPrompt }],
    max_tokens: 600,
  })
  const executiveSummary = completion.choices[0].message.content ?? ''

  // Risk rating
  const criticalCount = findings?.filter(f => f.severity === 'critical').length ?? 0
  const warningCount = findings?.filter(f => f.severity === 'warning').length ?? 0
  const openAdCount = status?.ads_open ?? 0
  const damageCount = damageIndicators.length

  let riskRating: 'Low' | 'Medium' | 'High' | 'Critical'
  let riskColor: string
  if (criticalCount > 2 || openAdCount > 0 || damageCount > 1) {
    riskRating = 'High'; riskColor = '#dc2626'
  } else if (criticalCount > 0 || warningCount > 3 || damageCount > 0) {
    riskRating = 'Medium'; riskColor = '#d97706'
  } else {
    riskRating = 'Low'; riskColor = '#16a34a'
  }

  const reportData = {
    reportType: audience === 'prebuy_packet' ? 'Prebuy Summary Packet'
      : audience === 'lender_packet' ? 'Lender Collateral Summary'
      : 'Insurance Underwriting Summary',
    generatedAt: new Date().toISOString(),
    audience,
    aircraft: {
      tailNumber: aircraft?.tail_number,
      makeModel: `${aircraft?.make} ${aircraft?.model}`,
      year: aircraft?.year,
      serialNumber: aircraft?.serial_number,
      engineMakeModel: `${aircraft?.engine_make} ${aircraft?.engine_model}`,
      engineSerial: aircraft?.engine_serial,
    },
    executiveSummary,
    riskRating,
    riskColor,
    status: {
      airframeTotalTime: status?.airframe_total_time,
      engineTimeSinceOverhaul: status?.engine_time_since_overhaul,
      propTimeSinceOverhaul: status?.prop_time_since_overhaul,
      annualIsCurrent: status?.annual_is_current,
      annualNextDue: status?.annual_next_due_date,
      lastAnnualDate: status?.last_annual_date,
      eltIsCurrent: status?.elt_is_current,
      transponderIsCurrent: status?.transponder_is_current,
      pitotStaticIsCurrent: status?.pitot_static_is_current,
      adsComplied: status?.ads_complied,
      adsOpen: status?.ads_open,
      adsUnknown: status?.ads_unknown,
      hasRegistration: status?.has_registration,
      hasAirworthinessCert: status?.has_airworthiness_cert,
      hasWeightBalance: status?.has_weight_balance,
      healthScore: status?.health_score,
    },
    majorEvents: {
      annualCount: annuals.length,
      lastAnnual: annuals[annuals.length - 1],
      engineOverhauls: engineOverhauls.map(e => ({
        date: e.entry_date,
        aircraftTime: e.aircraft_total_time,
        summary: e.work_summary,
      })),
      propOverhauls: propOverhauls.map(e => ({
        date: e.entry_date,
        summary: e.work_summary,
      })),
      majorRepairs: majorRepairs.map(e => ({
        date: e.entry_date,
        summary: e.work_summary,
        description: e.work_description,
      })),
      damageIndicators: damageIndicators.map(e => ({
        date: e.entry_date,
        summary: e.work_summary,
        description: e.work_description,
      })),
    },
    findings: findings?.map(f => ({
      severity: f.severity,
      title: f.title,
      description: f.description,
      recommendation: f.recommendation,
    })),
    adSummary: {
      total: adRecords?.length ?? 0,
      complied: status?.ads_complied ?? 0,
      open: status?.ads_open ?? 0,
      unknown: status?.ads_unknown ?? 0,
      openAds: adRecords?.filter(a => a.compliance_status === 'open').map(a => a.ad_number),
    },
    documentChecklist: {
      hasRegistration: status?.has_registration,
      hasAirworthinessCert: status?.has_airworthiness_cert,
      hasWeightBalance: status?.has_weight_balance,
      hasForm337s: documents?.some(d => d.document_type === 'form_337'),
      hasEngineLogbooks: documents?.some(d => d.document_type === 'engine_log'),
      hasAirframeLogbooks: documents?.some(d => d.document_type === 'airframe_log'),
      hasPropLogbooks: documents?.some(d => d.document_type === 'prop_log'),
    },
  }

  return renderReportToPDF(reportData, 'prebuy_packet')
}
