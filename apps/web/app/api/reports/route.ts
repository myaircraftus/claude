import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { generateReport } from '@/lib/intelligence/generateReport'

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { aircraft_id, report_type, options } = body

  if (!aircraft_id || !report_type) {
    return NextResponse.json({ error: 'aircraft_id and report_type required' }, { status: 400 })
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
