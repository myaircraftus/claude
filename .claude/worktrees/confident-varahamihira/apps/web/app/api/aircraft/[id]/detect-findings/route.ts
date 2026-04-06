import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { detectMissingRecords } from '@/lib/intelligence/detectMissingRecords'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: aircraft } = await supabase
    .from('aircraft')
    .select('id, organization_id')
    .eq('id', params.id)
    .single()

  if (!aircraft) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const runId = await detectMissingRecords({
    aircraftId: aircraft.id,
    organizationId: aircraft.organization_id,
    triggeredBy: user.id,
    triggerSource: 'manual',
  })

  return NextResponse.json({ run_id: runId })
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: latestRun } = await supabase
    .from('findings_runs')
    .select('*')
    .eq('aircraft_id', params.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!latestRun) return NextResponse.json({ findings: [], run: null })

  const { data: findings } = await supabase
    .from('record_findings')
    .select('*')
    .eq('findings_run_id', latestRun.id)
    .eq('is_resolved', false)
    .order('severity', { ascending: true })

  return NextResponse.json({ findings, run: latestRun })
}
