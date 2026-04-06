import { createServiceSupabase } from '@/lib/supabase/server'
import { renderReportToPDF } from './pdfRenderer'

export async function generateEngineReport(
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
      .in('event_type', [
        'engine_overhaul', 'engine_replacement', 'engine_oil_change',
        'compression_check', 'prop_overhaul', 'prop_replacement',
        'annual_inspection',
      ])
      .order('entry_date', { ascending: false }),
  ])

  const engineOverhauls = events?.filter((e: any) =>
    ['engine_overhaul', 'engine_replacement'].includes(e.event_type)
  ) ?? []
  const propOverhauls = events?.filter((e: any) =>
    ['prop_overhaul', 'prop_replacement'].includes(e.event_type)
  ) ?? []
  const oilChanges = events?.filter((e: any) => e.event_type === 'engine_oil_change') ?? []
  const compressionChecks = events?.filter((e: any) => e.event_type === 'compression_check') ?? []

  const reportData = {
    reportType: 'Engine & Propeller Summary',
    generatedAt: new Date().toISOString(),
    aircraft: {
      tailNumber: aircraft?.tail_number,
      makeModel: `${aircraft?.make} ${aircraft?.model}`,
      year: aircraft?.year,
      serialNumber: aircraft?.serial_number,
      engineMakeModel: `${aircraft?.engine_make} ${aircraft?.engine_model}`,
      engineSerial: aircraft?.engine_serial,
    },
    status: {
      airframeTotalTime: status?.airframe_total_time,
      engineTimeSinceOverhaul: status?.engine_time_since_overhaul,
      engineLastOverhaulDate: status?.engine_last_overhaul_date,
      engineLastOverhaulShop: status?.engine_last_overhaul_shop,
      engineTboHours: status?.engine_tbo_hours,
      engineHoursToTbo: status?.engine_hours_to_tbo,
      propTimeSinceOverhaul: status?.prop_time_since_overhaul,
      propLastOverhaulDate: status?.prop_last_overhaul_date,
      healthScore: status?.health_score,
    },
    majorEvents: {
      engineOverhauls: engineOverhauls.map((e: any) => ({
        date: e.entry_date,
        aircraftTime: e.aircraft_total_time,
        summary: e.work_summary ?? e.work_description?.substring(0, 120),
      })),
      propOverhauls: propOverhauls.map((e: any) => ({
        date: e.entry_date,
        aircraftTime: e.aircraft_total_time,
        summary: e.work_summary ?? e.work_description?.substring(0, 120),
      })),
      annualCount: events?.filter((e: any) => e.event_type === 'annual_inspection').length ?? 0,
    },
    recentMaintenance: [
      ...oilChanges.slice(0, 5).map((e: any) => ({
        date: e.entry_date,
        type: 'Oil Change',
        summary: e.work_summary ?? '',
        mechanic: e.certifying_mechanic_name,
      })),
      ...compressionChecks.slice(0, 3).map((e: any) => ({
        date: e.entry_date,
        type: 'Compression Check',
        summary: e.work_summary ?? '',
        mechanic: e.certifying_mechanic_name,
      })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
  }

  return renderReportToPDF(reportData, 'engine_prop_summary')
}
