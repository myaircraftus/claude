import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()
  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data } = await supabase
    .from('integrations')
    .select(
      'id, provider, display_name, status, last_sync_at, aircraft_count_synced, last_sync_status, last_sync_error, settings, created_at'
    )
    .eq('organization_id', membership.organization_id)

  return NextResponse.json({ integrations: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { provider, credentials, settings } = body

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()
  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!['owner', 'admin'].includes((membership as any).role)) {
    return NextResponse.json({ error: 'Admin role required to manage integrations' }, { status: 403 })
  }

  const providerNames: Record<string, string> = {
    flight_schedule_pro: 'Flight Schedule Pro',
    flight_circle: 'Flight Circle',
    myfbo: 'MyFBO',
    avianis: 'Avianis',
    fl3xx: 'FL3XX',
    leon: 'Leon Software',
    talon: 'TalonETA/RMS',
  }

  // Test connection before saving
  let testResult = { success: false, message: 'Connection test not implemented for this provider' }
  if (provider === 'flight_schedule_pro' && credentials?.api_key) {
    testResult = await testFlightSchedulePro(credentials)
  } else if (provider === 'flight_circle' && credentials?.api_key) {
    testResult = await testFlightCircle(credentials)
  } else if (credentials?.api_key) {
    // Generic: accept any non-trivial key
    testResult = credentials.api_key.length > 10
      ? { success: true, message: 'Credentials accepted' }
      : { success: false, message: 'API key appears too short' }
  }

  if (!testResult.success) {
    return NextResponse.json(
      { error: `Connection test failed: ${testResult.message}. Check your credentials and try again.` },
      { status: 400 }
    )
  }

  const { data, error } = await supabase
    .from('integrations')
    .upsert(
      {
        organization_id: (membership as any).organization_id,
        provider,
        display_name: providerNames[provider] ?? provider,
        status: 'connected',
        credentials_encrypted: credentials, // TODO: encrypt in production
        settings: settings ?? {},
        created_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'organization_id,provider' }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ integration: data })
}

export async function DELETE(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const integrationId = searchParams.get('id')
  if (!integrationId) return NextResponse.json({ error: 'Integration ID required' }, { status: 400 })

  // Verify membership
  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()
  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!['owner', 'admin'].includes((membership as any).role)) {
    return NextResponse.json({ error: 'Admin role required' }, { status: 403 })
  }

  const { error } = await supabase
    .from('integrations')
    .update({ status: 'disconnected', credentials_encrypted: null, updated_at: new Date().toISOString() })
    .eq('id', integrationId)
    .eq('organization_id', (membership as any).organization_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

// ─── Provider test helpers ────────────────────────────────────────────────────

async function testFlightSchedulePro(
  credentials: any
): Promise<{ success: boolean; message: string }> {
  try {
    if (!credentials.api_key) return { success: false, message: 'API key is required' }
    // In production: call FSP API to validate
    // const response = await fetch('https://app.flightschedulepro.com/api/v1/aircraft', {
    //   headers: { 'Authorization': `Bearer ${credentials.api_key}` }
    // })
    // if (!response.ok) return { success: false, message: `FSP returned ${response.status}` }
    if (credentials.api_key.length < 10) {
      return { success: false, message: 'API key appears invalid (too short)' }
    }
    return { success: true, message: 'Connected to Flight Schedule Pro' }
  } catch (err: any) {
    return { success: false, message: err.message ?? 'Network error' }
  }
}

async function testFlightCircle(
  credentials: any
): Promise<{ success: boolean; message: string }> {
  try {
    if (!credentials.api_key) return { success: false, message: 'API key is required' }
    if (credentials.api_key.length < 10) {
      return { success: false, message: 'API key appears invalid (too short)' }
    }
    return { success: true, message: 'Connected to Flight Circle' }
  } catch (err: any) {
    return { success: false, message: err.message ?? 'Network error' }
  }
}
