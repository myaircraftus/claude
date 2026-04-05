import { renderReportToPDF } from './pdfRenderer'
import { createServerSupabase } from '@/lib/supabase/server'

export async function generateMissingRecordsReport(
  aircraftId: string,
  options: Record<string, unknown> = {}
): Promise<Buffer> {
  // TODO: implement in batch 3
  const supabase = createServerSupabase()
  const { data: aircraft } = await supabase.from('aircraft').select('*').eq('id', aircraftId).single()

  // Get latest findings run
  const { data: latestRun } = await supabase
    .from('findings_runs')
    .select('*')
    .eq('aircraft_id', aircraftId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  const { data: findings } = latestRun
    ? await supabase
        .from('record_findings')
        .select('*')
        .eq('findings_run_id', latestRun.id)
        .eq('is_resolved', false)
        .order('severity')
    : { data: [] }

  return renderReportToPDF({
    reportType: 'Missing Records Report',
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
    findings: findings?.map(f => ({
      severity: f.severity,
      title: f.title,
      description: f.description,
      recommendation: f.recommendation,
    })) ?? [],
    recentMaintenance: [],
  }, 'missing_records')
}
