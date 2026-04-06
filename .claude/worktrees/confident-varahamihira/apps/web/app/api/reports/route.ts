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

  // Paid report types require is_paid to be set (via Stripe webhook)
  const PAID_TYPES = ['prebuy_packet', 'lender_packet', 'insurer_packet']
  if (PAID_TYPES.includes(report_type)) {
    const isPaid = body.is_paid === true
    if (!isPaid) {
      return NextResponse.json(
        { error: 'This report type requires payment. Use /api/billing/report-checkout to purchase.' },
        { status: 402 }
      )
    }
  }

  const { data: aircraft } = await supabase
    .from('aircraft')
    .select('id, organization_id')
    .eq('id', aircraft_id)
    .single()

  if (!aircraft) return NextResponse.json({ error: 'Aircraft not found' }, { status: 404 })

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

  // Fire-and-forget generation
  generateReport(job.id).catch(err => {
    console.error(`[reports] Generation failed for job ${job.id}:`, err)
  })

  return NextResponse.json({ job_id: job.id, status: 'queued' })
}

export async function GET(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const aircraftId = searchParams.get('aircraft_id')

  let query = supabase
    .from('report_jobs')
    .select('*')
    .order('created_at', { ascending: false })

  if (aircraftId) query = query.eq('aircraft_id', aircraftId)

  const { data: jobs } = await query
  return NextResponse.json({ jobs: jobs ?? [] })
}
