import { createServiceSupabase } from '@/lib/supabase/server'
import { generateAircraftOverviewReport } from './reports/aircraftOverview'
import { generateEngineReport } from './reports/engineReport'
import { generateInspectionReport } from './reports/inspectionReport'
import { generateTimelineReport } from './reports/timelineReport'
import { generateMissingRecordsReport } from './reports/missingRecordsReport'
import { generatePrebuyPacket } from './reports/prebuyPacket'

export type ReportType =
  | 'aircraft_overview'
  | 'engine_prop_summary'
  | 'inspection_status'
  | 'maintenance_timeline'
  | 'missing_records'
  | 'prebuy_packet'
  | 'lender_packet'
  | 'insurer_packet'

export async function generateReport(jobId: string): Promise<void> {
  const supabase = createServiceSupabase()

  const { data: job } = await supabase
    .from('report_jobs')
    .select('*')
    .eq('id', jobId)
    .single()

  if (!job) throw new Error(`Report job ${jobId} not found`)

  await supabase
    .from('report_jobs')
    .update({
      status: 'generating',
      generation_started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId)

  try {
    let pdfBuffer: Buffer

    switch (job.report_type as ReportType) {
      case 'aircraft_overview':
        pdfBuffer = await generateAircraftOverviewReport(job.aircraft_id, job.options ?? {})
        break
      case 'engine_prop_summary':
        pdfBuffer = await generateEngineReport(job.aircraft_id, job.options ?? {})
        break
      case 'inspection_status':
        pdfBuffer = await generateInspectionReport(job.aircraft_id, job.options ?? {})
        break
      case 'maintenance_timeline':
        pdfBuffer = await generateTimelineReport(job.aircraft_id, job.options ?? {})
        break
      case 'missing_records':
        pdfBuffer = await generateMissingRecordsReport(job.aircraft_id, job.options ?? {})
        break
      case 'prebuy_packet':
      case 'lender_packet':
      case 'insurer_packet':
        pdfBuffer = await generatePrebuyPacket(job.aircraft_id, job.report_type, job.options ?? {})
        break
      default:
        throw new Error(`Unknown report type: ${job.report_type}`)
    }

    // Store PDF in Supabase Storage
    const fileName = `reports/${job.aircraft_id}/${jobId}.pdf`
    const { error: uploadError } = await supabase.storage
      .from('aircraft-reports')
      .upload(fileName, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      })

    if (uploadError) throw uploadError

    // Generate signed URL valid for 7 days
    const { data: urlData } = await supabase.storage
      .from('aircraft-reports')
      .createSignedUrl(fileName, 60 * 60 * 24 * 7)

    await supabase
      .from('report_jobs')
      .update({
        status: 'completed',
        storage_path: fileName,
        signed_url: urlData?.signedUrl ?? null,
        signed_url_expires: new Date(Date.now() + 60 * 60 * 24 * 7 * 1000).toISOString(),
        file_size_bytes: pdfBuffer.length,
        generation_completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId)
  } catch (err: any) {
    await supabase
      .from('report_jobs')
      .update({
        status: 'failed',
        error_message: err?.message ?? 'Generation failed',
        generation_completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId)
    throw err
  }
}
