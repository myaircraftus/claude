import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

const HANDLE_RE = /^[a-z0-9][a-z0-9-]{2,31}$/

const RESERVED = new Set([
  'admin', 'api', 'app', 'auth', 'login', 'logout', 'signup', 'onboarding',
  'settings', 'dashboard', 'aircraft', 'work-orders', 'invoices', 'estimates',
  'maintenance', 'logbook', 'squawks', 'documents', 'marketplace', 'reports',
  'reminders', 'chat', 'help', 'support', 'about', 'pricing', 'blog', 'legal',
  'privacy', 'terms', 'owner', 'mechanic', 'pilot', 'fleet', 'me', 'you',
  'myaircraft', 'root', 'system', 'staff', 'team', 'users', 'user', 'new',
  'scanner', 'ai', 'public', 'static', 'assets',
])

export async function GET(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const raw = (new URL(req.url)).searchParams.get('handle')
  if (!raw) return NextResponse.json({ available: false, reason: 'missing' })
  const handle = raw.trim().toLowerCase()

  if (!HANDLE_RE.test(handle)) {
    return NextResponse.json({
      available: false,
      reason: 'format',
      message: 'Handle must be 3-32 chars, start alphanumeric, only lowercase letters, numbers, or dashes.',
    })
  }
  if (RESERVED.has(handle)) {
    return NextResponse.json({ available: false, reason: 'reserved', message: 'This handle is reserved.' })
  }

  const { data: taken } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('handle', handle)
    .neq('id', user.id)
    .maybeSingle()

  if (taken) {
    return NextResponse.json({ available: false, reason: 'taken', message: 'Handle is already taken.' })
  }
  return NextResponse.json({ available: true, handle })
}
