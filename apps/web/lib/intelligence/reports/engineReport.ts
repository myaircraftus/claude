import { renderReportToPDF } from './pdfRenderer'
import { createServerSupabase } from '@/lib/supabase/server'

export async function generateEngineReport(
  aircraftId: string,
  options: Record<string, unknown> = {}
): Promise<Buffer> {
  // TODO: implement in batch 3
  const supabase = createServerSupabase()
  const { data: aircraft } = await supabase.from('aircraft').select('*').eq('id', aircraftId).single()
  const { data: status } = await supabase.from('aircraft_computed_status').select('*').eq('aircraft_id', aircraftId).single()

  return renderReportToPDF({
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
      engineTimeSinceOverhaul: status?.engine_time_since_overhaul,
      propTimeSinceOverhaul: status?.prop_time_since_overhaul,
    },
    findings: [],
    recentMaintenance: [],
  }, 'engine_prop_summary')
}
