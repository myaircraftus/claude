import OpenAI from 'openai'
import { createServerSupabase } from '@/lib/supabase/server'
import { renderReportToPDF } from '@/lib/intelligence/reports/pdfRenderer'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function generateAircraftOverviewReport(
  aircraftId: string,
  options: Record<string, unknown> = {}
): Promise<Buffer> {
  const supabase = createServerSupabase()

  const [
    { data: aircraft },
    { data: status },
    { data: events },
    { data: findings },
  ] = await Promise.all([
    supabase.from('aircraft').select('*').eq('id', aircraftId).single(),
    supabase.from('aircraft_computed_status').select('*').eq('aircraft_id', aircraftId).single(),
    supabase.from('maintenance_events').select('*').eq('aircraft_id', aircraftId).order('entry_date', { ascending: false }).limit(20),
    supabase.from('record_findings').select('*').eq('aircraft_id', aircraftId).eq('is_resolved', false).order('severity'),
  ])

  // Build narrative summary with GPT-4o
  const narrativePrompt = `
You are writing an Aircraft Overview Report for ${aircraft?.make} ${aircraft?.model} (${aircraft?.tail_number}).
Aircraft data: Serial ${aircraft?.serial_number}, Engine: ${aircraft?.engine_make} ${aircraft?.engine_model}.
Current total time: ${status?.airframe_total_time ?? 'Unknown'}h.
Annual status: ${status?.annual_is_current ? 'Current' : 'OVERDUE'}, last annual: ${status?.last_annual_date ?? 'Unknown'}.
Engine time since overhaul: ${status?.engine_time_since_overhaul ?? 'Unknown'}h.
AD compliance: ${status?.ads_complied ?? 0} complied, ${status?.ads_open ?? 0} open, ${status?.ads_unknown ?? 0} unknown.
Recent maintenance summary: ${events?.slice(0, 5).map(e => `${e.entry_date}: ${e.event_type}`).join('; ')}.
Findings: ${findings?.length ?? 0} open issues (${findings?.filter(f => f.severity === 'critical').length ?? 0} critical).

Write a concise 2-3 paragraph executive summary of this aircraft's maintenance status.
Be factual. Note the overall health, key dates, and any significant concerns.
Write for an aircraft owner or buyer — not a mechanic.
`
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: narrativePrompt }],
    max_tokens: 500,
  })

  const narrative = completion.choices[0].message.content ?? ''

  // Assemble report data structure
  const reportData = {
    reportType: 'Aircraft Overview Report',
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
      annualIsCurrent: status?.annual_is_current,
      annualNextDue: status?.annual_next_due_date,
      engineTimeSinceOverhaul: status?.engine_time_since_overhaul,
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
    recentMaintenance: events?.slice(0, 10).map(e => ({
      date: e.entry_date,
      type: e.event_type,
      summary: e.work_summary,
      mechanic: e.certifying_mechanic_name,
    })),
  }

  return renderReportToPDF(reportData, 'aircraft_overview')
}
