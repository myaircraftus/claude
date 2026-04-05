import { renderReportToPDF } from './pdfRenderer'
import { createServerSupabase } from '@/lib/supabase/server'

export async function generateInspectionReport(
  aircraftId: string,
  options: Record<string, unknown> = {}
): Promise<Buffer> {
  // TODO: implement in batch 3
  const supabase = createServerSupabase()
  const { data: aircraft } = await supabase.from('aircraft').select('*').eq('id', aircraftId).single()
  const { data: status } = await supabase.from('aircraft_computed_status').select('*').eq('aircraft_id', aircraftId).single()

  return renderReportToPDF({
    reportType: 'Inspection Status Report',
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
      annualIsCurrent: status?.annual_is_current,
      annualNextDue: status?.annual_next_due_date,
      eltIsCurrent: status?.elt_is_current,
      transponderIsCurrent: status?.transponder_is_current,
    },
    findings: [],
    recentMaintenance: [],
  }, 'inspection_status')
}
