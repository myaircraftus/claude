import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

/**
 * Lightweight read-only Google Drive integration status, used by the
 * Settings → Integrations tile. Real OAuth start lives at /api/gdrive/auth
 * and the token-exchange callback at /api/gdrive/callback. This endpoint
 * just reports whether a connection exists for the current org.
 */
export async function GET() {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()
  if (!membership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: connection } = await supabase
    .from('gdrive_connections')
    .select('id, google_email, created_at, is_active')
    .eq('organization_id', (membership as any).organization_id)
    .eq('is_active', true)
    .maybeSingle()

  return NextResponse.json({
    connected: Boolean(connection),
    email: connection?.google_email ?? null,
    connectedAt: connection?.created_at ?? null,
  })
}

export async function DELETE() {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
    .from('gdrive_connections')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('organization_id', (membership as any).organization_id)
    .eq('is_active', true)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
