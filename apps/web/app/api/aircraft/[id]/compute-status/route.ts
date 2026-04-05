import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { computeAircraftStatus } from '@/lib/intelligence/computeAircraftStatus'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify user has access to this aircraft
  const { data: aircraft } = await supabase
    .from('aircraft')
    .select('id, organization_id')
    .eq('id', params.id)
    .single()

  if (!aircraft) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await computeAircraftStatus({
    aircraftId: aircraft.id,
    organizationId: aircraft.organization_id,
  })

  const { data: status } = await supabase
    .from('aircraft_computed_status')
    .select('*')
    .eq('aircraft_id', params.id)
    .single()

  return NextResponse.json({ status })
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: status } = await supabase
    .from('aircraft_computed_status')
    .select('*')
    .eq('aircraft_id', params.id)
    .single()

  return NextResponse.json({ status })
}
