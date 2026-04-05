import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { detectMissingRecords } from '@/lib/intelligence/detectMissingRecords'

export const maxDuration = 30

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

  // Get latest findings run for this aircraft
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
    .order('severity', { ascending: true }) // critical first

  return NextResponse.json({ findings, run: latestRun })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { finding_id, action, note } = await req.json()
  if (!finding_id || !action) return NextResponse.json({ error: 'finding_id and action required' }, { status: 400 })

  if (action === 'resolve') {
    await supabase.from('record_findings').update({
      is_resolved: true,
      resolved_at: new Date().toISOString(),
      resolved_by: user.id,
      resolution_note: note ?? null,
    }).eq('id', finding_id)
  } else if (action === 'acknowledge') {
    await supabase.from('record_findings').update({
      is_acknowledged: true,
      acknowledged_at: new Date().toISOString(),
      acknowledged_by: user.id,
      acknowledge_note: note ?? null,
    }).eq('id', finding_id)
  } else {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
