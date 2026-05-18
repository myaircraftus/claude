import { renderReportToPDF } from './pdfRenderer'
import { createServerSupabase } from '@/lib/supabase/server'

export async function generateTimelineReport(
  aircraftId: string,
  options: Record<string, unknown> = {}
): Promise<Buffer> {
  // TODO: implement in batch 3
  const supabase = createServerSupabase()
  const { data: aircraft } = await supabase.from('aircraft').select('*').eq('id', aircraftId).single()
  const { data: events } = await supabase
    .from('maintenance_events')
    .select('*')
    .eq('aircraft_id', aircraftId)
    .order('event_date', { ascending: false })
    .limit(50)

  return renderReportToPDF({
    reportType: 'Maintenance Timeline',
    generatedAt: new Date().toISOString(),
    aircraft: {
      tailNumber: aircraft?.tail_number,
      makeModel: `${aircraft?.make} ${aircraft?.model}`,
      year: aircraft?.year,
      serialNumber: aircraft?.serial_number,
      engineMakeModel: `${aircraft?.engine_make} ${aircraft?.engine_model}`,
      engineSerial: aircraft?.engine_serial,
    },
    status: {},
    findings: [],
    recentMaintenance: events?.map(e => ({
      date: e.event_date,
      type: e.event_type,
      summary: e.description,
      mechanic: e.mechanic_name,
    })) ?? [],
  }, 'maintenance_timeline')
}
