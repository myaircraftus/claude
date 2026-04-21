import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { generateReport } from '@/lib/intelligence/generateReport'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { aircraft_id, options } = body
  const report_type = body.report_type ?? 'aircraft_overview'

  const VALID_REPORT_TYPES = [
    'aircraft_overview',
    'insurance_packet',
    'pre_buy_inspection',
    'annual_inspection_summary',
    'compliance_ad_report',
    // legacy types
    'engine_prop_summary',
    'inspection_status',
    'maintenance_timeline',
    'missing_records',
    'prebuy_packet',
    'lender_packet',
    'insurer_packet',
  ] as const

  if (!aircraft_id) {
    return NextResponse.json({ error: 'aircraft_id required' }, { status: 400 })
  }

  if (!VALID_REPORT_TYPES.includes(report_type)) {
    return NextResponse.json(
      { error: `Invalid report_type. Must be one of: ${VALID_REPORT_TYPES.join(', ')}` },
      { status: 400 }
    )
  }

  // Verify access
  const { data: aircraft } = await supabase
    .from('aircraft')
    .select('id, organization_id')
    .eq('id', aircraft_id)
    .single()

  if (!aircraft) return NextResponse.json({ error: 'Aircraft not found' }, { status: 404 })

  // Create the job
  const { data: job } = await supabase
    .from('report_jobs')
    .insert({
      aircraft_id,
      organization_id: aircraft.organization_id,
      requested_by: user.id,
      report_type,
      options: options ?? {},
      status: 'queued',
    })
    .select()
    .single()

  if (!job) return NextResponse.json({ error: 'Failed to create job' }, { status: 500 })

  // Trigger generation (fire-and-forget — do not await in the request handler)
  // In production, use a Supabase Edge Function or background job queue
  // For now, use waitUntil pattern with Vercel
  generateReport(job.id).catch(err => {
    console.error(`Report generation failed for job ${job.id}:`, err)
  })

  return NextResponse.json({ job_id: job.id, status: 'queued' })
}

export async function GET(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const aircraftId = searchParams.get('aircraft_id')

  const query = supabase
    .from('report_jobs')
    .select('*')
    .order('created_at', { ascending: false })

  if (aircraftId) query.eq('aircraft_id', aircraftId)

  const { data: jobs } = await query
  return NextResponse.json({ jobs })
}
