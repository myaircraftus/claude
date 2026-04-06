import { createServiceSupabase } from '@/lib/supabase/server'
import { renderReportToPDF } from './pdfRenderer'

export async function generateTimelineReport(
  aircraftId: string,
  options: Record<string, unknown> = {}
): Promise<Buffer> {
  const supabase = createServiceSupabase()

  const [{ data: aircraft }, { data: status }, { data: events }] = await Promise.all([
    supabase.from('aircraft').select('*').eq('id', aircraftId).single(),
    supabase.from('aircraft_computed_status').select('*').eq('aircraft_id', aircraftId).single(),
    supabase
      .from('maintenance_events')
      .select('*')
      .eq('aircraft_id', aircraftId)
      .order('entry_date', { ascending: true }),
  ])

  const SIGNIFICANT_TYPES = [
    'annual_inspection', '100hr_inspection',
    'engine_overhaul', 'engine_replacement',
    'prop_overhaul', 'prop_replacement',
    'major_repair', 'major_alteration',
    'elt_inspection', 'transponder_test', 'pitot_static_test',
    'avionics_upgrade', 'stc_installation',
  ]

  const significantEvents = (events ?? []).filter((e: any) =>
    SIGNIFICANT_TYPES.includes(e.event_type)
  )

  const recentAll = [...(events ?? [])].reverse().slice(0, 30)

  const reportData = {
    reportType: 'Maintenance Timeline Report',
    generatedAt: new Date().toISOString(),
    aircraft: {
      tailNumber: aircraft?.tail_number,
      makeModel: `${aircraft?.make} ${aircraft?.model}`,
      year: aircraft?.year,
      serialNumber: aircraft?.serial_number,
      engineMakeModel: `${aircraft?.engine_make} ${aircraft?.engine_model}`,
    },
    status: {
      airframeTotalTime: status?.airframe_total_time,
      annualIsCurrent: status?.annual_is_current,
      healthScore: status?.health_score,
      adsOpen: status?.ads_open,
      transponderIsCurrent: status?.transponder_is_current,
    },
    findings: [],
    recentMaintenance: recentAll.map((e: any) => ({
      date: e.entry_date,
      type: e.event_type?.replace(/_/g, ' '),
      summary: e.work_summary ?? e.work_description?.substring(0, 100),
      mechanic: e.certifying_mechanic_name,
    })),
    majorEvents: {
      annualCount: (events ?? []).filter((e: any) => e.event_type === 'annual_inspection').length,
      engineOverhauls: significantEvents
        .filter((e: any) => ['engine_overhaul', 'engine_replacement'].includes(e.event_type))
        .map((e: any) => ({ date: e.entry_date, aircraftTime: e.aircraft_total_time, summary: e.work_summary })),
      propOverhauls: significantEvents
        .filter((e: any) => ['prop_overhaul', 'prop_replacement'].includes(e.event_type))
        .map((e: any) => ({ date: e.entry_date, aircraftTime: e.aircraft_total_time, summary: e.work_summary })),
      majorRepairs: significantEvents
        .filter((e: any) => ['major_repair', 'major_alteration'].includes(e.event_type))
        .map((e: any) => ({ date: e.entry_date, summary: e.work_summary, description: e.work_description?.substring(0, 150) })),
      damageIndicators: [],
    },
  }

  return renderReportToPDF(reportData, 'maintenance_timeline')
}
