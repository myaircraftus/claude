import { createServiceSupabase } from '@/lib/supabase/server'
import { renderReportToPDF } from './pdfRenderer'

export async function generateMissingRecordsReport(
  aircraftId: string,
  options: Record<string, unknown> = {}
): Promise<Buffer> {
  const supabase = createServiceSupabase()

  const [
    { data: aircraft },
    { data: status },
    { data: latestRun },
  ] = await Promise.all([
    supabase.from('aircraft').select('*').eq('id', aircraftId).single(),
    supabase.from('aircraft_computed_status').select('*').eq('aircraft_id', aircraftId).single(),
    supabase
      .from('findings_runs')
      .select('*')
      .eq('aircraft_id', aircraftId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1)
      .single(),
  ])

  let findings: any[] = []
  if (latestRun) {
    const { data } = await supabase
      .from('record_findings')
      .select('*')
      .eq('findings_run_id', latestRun.id)
      .order('severity', { ascending: true })
    findings = data ?? []
  }

  const criticalFindings = findings.filter((f: any) => f.severity === 'critical')
  const warningFindings = findings.filter((f: any) => f.severity === 'warning')
  const infoFindings = findings.filter((f: any) => f.severity === 'info')

  const reportData = {
    reportType: 'Missing Records Report',
    generatedAt: new Date().toISOString(),
    aircraft: {
      tailNumber: aircraft?.tail_number,
      makeModel: `${aircraft?.make} ${aircraft?.model}`,
      year: aircraft?.year,
      serialNumber: aircraft?.serial_number,
      engineMakeModel: `${aircraft?.engine_make} ${aircraft?.engine_model}`,
    },
    narrative: latestRun
      ? `This report summarizes ${findings.length} finding(s) detected during the records analysis run completed on ${new Date(latestRun.completed_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}. ${criticalFindings.length} critical issue(s), ${warningFindings.length} warning(s), and ${infoFindings.length} informational finding(s) were identified.`
      : 'No completed detection run found. Run the detection engine from the Intelligence tab to generate findings.',
    status: {
      airframeTotalTime: status?.airframe_total_time,
      annualIsCurrent: status?.annual_is_current,
      healthScore: status?.health_score,
      adsOpen: status?.ads_open,
      transponderIsCurrent: status?.transponder_is_current,
    },
    findings: findings.map((f: any) => ({
      severity: f.severity,
      title: f.title,
      description: f.description,
      recommendation: f.recommendation,
    })),
  }

  return renderReportToPDF(reportData, 'missing_records')
}
