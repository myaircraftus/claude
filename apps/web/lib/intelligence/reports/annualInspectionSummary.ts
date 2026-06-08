// Migrated to the unified AI SDK layer (lib/ai/llm).
import { generateLlmText } from '@/lib/ai/llm'
import { createServerSupabase } from '@/lib/supabase/server'
import { renderReportToPDF } from './pdfRenderer'
import { systemPromptForType, userPromptForType } from './prompts'

export async function generateAnnualInspectionSummary(
  aircraftId: string,
  options: Record<string, unknown> = {}
): Promise<Buffer> {
  const supabase = createServerSupabase()

  const [
    { data: aircraft },
    { data: status },
    { data: findings },
    { data: annualEvents },
  ] = await Promise.all([
    supabase.from('aircraft').select('*').eq('id', aircraftId).single(),
    supabase.from('aircraft_computed_status').select('*').eq('aircraft_id', aircraftId).single(),
    supabase.from('record_findings').select('*').eq('aircraft_id', aircraftId).eq('is_resolved', false).order('severity'),
    supabase
      .from('maintenance_events')
      .select('*')
      .eq('aircraft_id', aircraftId)
      .eq('event_type', 'annual_inspection')
      .order('event_date', { ascending: false })
      .limit(5),
  ])

  const ctx = {
    tailNumber: aircraft?.tail_number ?? '',
    makeModel: `${aircraft?.make} ${aircraft?.model}`,
    year: aircraft?.year ?? null,
    serialNumber: aircraft?.serial_number ?? null,
    engineMakeModel: `${aircraft?.engine_make} ${aircraft?.engine_model}`,
    totalTime: status?.airframe_total_time ?? null,
    engineSmoh: status?.engine_time_since_overhaul ?? null,
    annualIsCurrent: status?.annual_is_current ?? null,
    lastAnnualDate: status?.last_annual_date ?? null,
    adsComplied: status?.ads_complied ?? 0,
    adsOpen: status?.ads_open ?? 0,
    adsUnknown: status?.ads_unknown ?? 0,
    openFindingsCount: findings?.length ?? 0,
    criticalFindingsCount: findings?.filter(f => f.severity === 'critical').length ?? 0,
    recentMaintenance: annualEvents?.map(e => ({ date: e.event_date, type: e.event_type, summary: e.description })) ?? [],
  }

  const { text: narrative } = await generateLlmText({
    model: 'gpt-4o',
    system: systemPromptForType('annual_inspection_summary'),
    prompt: userPromptForType('annual_inspection_summary', ctx),
    maxOutputTokens: 700,
  })

  const reportData = {
    reportType: 'Annual Inspection Summary',
    generatedAt: new Date().toISOString(),
    aircraft: {
      tailNumber: aircraft?.tail_number,
      makeModel: `${aircraft?.make} ${aircraft?.model}`,
      year: aircraft?.year,
      serialNumber: aircraft?.serial_number,
      engineMakeModel: `${aircraft?.engine_make} ${aircraft?.engine_model}`,
      engineSerial: aircraft?.engine_serial,
    },
    narrative,
    status: {
      airframeTotalTime: status?.airframe_total_time,
      engineTimeSinceOverhaul: status?.engine_time_since_overhaul,
      annualIsCurrent: status?.annual_is_current,
      annualNextDue: status?.annual_next_due_date,
      lastAnnualDate: status?.last_annual_date,
      eltIsCurrent: status?.elt_is_current,
      transponderIsCurrent: status?.transponder_is_current,
      adsOpen: status?.ads_open,
      adsComplied: status?.ads_complied,
      healthScore: status?.health_score,
    },
    findings: findings?.map(f => ({
      severity: f.severity,
      title: f.title,
      description: f.description,
      recommendation: f.recommendation,
    })),
    recentMaintenance: annualEvents?.slice(0, 5).map(e => ({
      date: e.event_date,
      type: e.event_type,
      summary: e.description,
      mechanic: e.mechanic_name,
    })),
  }

  return renderReportToPDF(reportData, 'annual_inspection_summary')
}
