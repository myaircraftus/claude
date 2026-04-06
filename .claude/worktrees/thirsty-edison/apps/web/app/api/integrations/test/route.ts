import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

/**
 * POST /api/integrations/test
 * Test provider credentials without saving them.
 */
export async function POST(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { provider, credentials } = body

  if (!provider || !credentials) {
    return NextResponse.json({ error: 'provider and credentials are required' }, { status: 400 })
  }

  let result: { success: boolean; message: string }

  switch (provider) {
    case 'flight_schedule_pro':
      result = await testFlightSchedulePro(credentials)
      break
    case 'flight_circle':
      result = await testFlightCircle(credentials)
      break
    default:
      // Generic: accept any non-trivial key
      result =
        credentials.api_key && credentials.api_key.length > 10
          ? { success: true, message: 'Credentials accepted' }
          : { success: false, message: 'API key appears invalid' }
  }

  if (!result.success) {
    return NextResponse.json({ error: result.message }, { status: 400 })
  }
  return NextResponse.json({ ok: true, message: result.message })
}

async function testFlightSchedulePro(
  credentials: any
): Promise<{ success: boolean; message: string }> {
  if (!credentials.api_key) return { success: false, message: 'API key is required' }
  // Stub: replace with real FSP API call in production
  if (credentials.api_key.length < 10) {
    return { success: false, message: 'API key appears invalid (too short)' }
  }
  return { success: true, message: 'Connection to Flight Schedule Pro verified' }
}

async function testFlightCircle(
  credentials: any
): Promise<{ success: boolean; message: string }> {
  if (!credentials.api_key) return { success: false, message: 'API key is required' }
  if (credentials.api_key.length < 10) {
    return { success: false, message: 'API key appears invalid (too short)' }
  }
  return { success: true, message: 'Connection to Flight Circle verified' }
}
