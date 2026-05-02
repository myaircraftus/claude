/**
 * /api/notifications/preferences (Spec 0.4)
 *
 * GET → list every preference row for the current user × active org. Rows
 *       not present mean "channel default" (see CHANNEL_DEFAULTS in
 *       lib/notifications/dispatch.ts).
 *
 * PUT → upsert a single (category, channel) preference. Body:
 *       { category: string, channel: 'in-app'|'email'|'push'|'sms', enabled: boolean }.
 *
 * Bulk operations are intentionally not exposed — the UI flips one toggle
 * at a time so each PUT is small and reversible.
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'

const VALID_CHANNELS = new Set(['in-app', 'email', 'push', 'sms'])

export async function GET(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('notification_preferences')
    .select('*')
    .eq('user_id', ctx.user.id)
    .eq('organization_id', ctx.organizationId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ preferences: data ?? [] })
}

export async function PUT(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { category?: string; channel?: string; enabled?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body.category || typeof body.category !== 'string') {
    return NextResponse.json({ error: 'category required' }, { status: 400 })
  }
  if (!body.channel || !VALID_CHANNELS.has(body.channel)) {
    return NextResponse.json(
      { error: 'channel must be in-app|email|push|sms' },
      { status: 400 },
    )
  }
  if (typeof body.enabled !== 'boolean') {
    return NextResponse.json({ error: 'enabled (boolean) required' }, { status: 400 })
  }

  const supabase = createServerSupabase()
  const { error } = await supabase
    .from('notification_preferences')
    .upsert(
      {
        user_id: ctx.user.id,
        organization_id: ctx.organizationId,
        category: body.category,
        channel: body.channel,
        enabled: body.enabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,organization_id,category,channel' },
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
