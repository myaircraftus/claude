import { createServerSupabase } from '@/lib/supabase/server'
import { generateAircraftOverviewReport } from './reports/aircraftOverview'
import { generateEngineReport } from './reports/engineReport'
import { generateInspectionReport } from './reports/inspectionReport'
import { generateTimelineReport } from './reports/timelineReport'
import { generateMissingRecordsReport } from './reports/missingRecordsReport'
import { generatePrebuyPacket } from './reports/prebuyPacket'
import { generateAnnualInspectionSummary } from './reports/annualInspectionSummary'
import { generateComplianceAdReport } from './reports/complianceAdReport'

export type ReportType =
  | 'aircraft_overview'
  | 'engine_prop_summary'
  | 'inspection_status'
  | 'maintenance_timeline'
  | 'missing_records'
  | 'prebuy_packet'
  | 'lender_packet'
  | 'insurer_packet'
  // new types matching REPORT_TYPES in prompts.ts
  | 'insurance_packet'
  | 'pre_buy_inspection'
  | 'annual_inspection_summary'
  | 'compliance_ad_report'

export async function generateReport(jobId: string): Promise<void> {
  const supabase = createServerSupabase()

  const { data: job } = await supabase
    .from('report_jobs')
    .select('*, aircraft:aircraft_id(*)')
    .eq('id', jobId)
    .single()

  if (!job) throw new Error(`Report job ${jobId} not found`)

  await supabase.from('report_jobs').update({
    status: 'generating',
    generation_started_at: new Date().toISOString(),
  }).eq('id', jobId)

  try {
    let pdfBuffer: Buffer

    switch (job.report_type as ReportType) {
      case 'aircraft_overview':
        pdfBuffer = await generateAircraftOverviewReport(job.aircraft_id, job.options)
        break
      case 'engine_prop_summary':
        pdfBuffer = await generateEngineReport(job.aircraft_id, job.options)
        break
      case 'inspection_status':
        pdfBuffer = await generateInspectionReport(job.aircraft_id, job.options)
        break
      case 'maintenance_timeline':
        pdfBuffer = await generateTimelineReport(job.aircraft_id, job.options)
        break
      case 'missing_records':
        pdfBuffer = await generateMissingRecordsReport(job.aircraft_id, job.options)
        break
      case 'prebuy_packet':
      case 'lender_packet':
      case 'insurer_packet':
        pdfBuffer = await generatePrebuyPacket(job.aircraft_id, job.report_type, job.options)
        break
      // New unified report types
      case 'insurance_packet':
        pdfBuffer = await generatePrebuyPacket(job.aircraft_id, 'insurer_packet', job.options)
        break
      case 'pre_buy_inspection':
        pdfBuffer = await generatePrebuyPacket(job.aircraft_id, 'prebuy_packet', job.options)
        break
      case 'annual_inspection_summary':
        pdfBuffer = await generateAnnualInspectionSummary(job.aircraft_id, job.options)
        break
      case 'compliance_ad_report':
        pdfBuffer = await generateComplianceAdReport(job.aircraft_id, job.options)
        break
      default:
        throw new Error(`Unknown report type: ${job.report_type}`)
    }

    // Store PDF
    const fileName = `reports/${job.aircraft_id}/${jobId}.pdf`
    const { error: uploadError } = await supabase.storage
      .from('aircraft-reports')
      .upload(fileName, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      })

    if (uploadError) throw uploadError

    // Create signed URL (valid 7 days)
    const { data: signedData } = await supabase.storage
      .from('aircraft-reports')
      .createSignedUrl(fileName, 60 * 60 * 24 * 7)
    const signedUrl = signedData?.signedUrl ?? null

    await (supabase as any).from('report_jobs').update({
      status: 'completed',
      storage_path: fileName,
      signed_url: signedUrl,
      signed_url_expires: new Date(Date.now() + 60 * 60 * 24 * 7 * 1000).toISOString(),
      file_size_bytes: pdfBuffer.length,
      generation_completed_at: new Date().toISOString(),
    }).eq('id', jobId)

  } catch (err: any) {
    await (supabase as any).from('report_jobs').update({
      status: 'failed',
      error_message: err?.message ?? 'Generation failed',
      generation_completed_at: new Date().toISOString(),
    }).eq('id', jobId)
    throw err
  }
}
