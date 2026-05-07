/**
 * GET /api/integrations/qbo/connect  (Spec 3.3 + 5.7 stub layer)
 *
 * Builds the Intuit OAuth authorize URL and redirects the user there.
 * Owner/admin only. Mock client returns a redirect URL that points
 * straight back to /api/integrations/qbo/callback with a fake auth code.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { getQboClient } from '@/lib/integrations/qbo-client'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_memberships').select('organization_id, role')
    .eq('user_id', user.id).not('accepted_at', 'is', null).single()
  if (!membership) return NextResponse.json({ error: 'No org' }, { status: 403 })
  if (!['owner', 'admin'].includes(membership.role)) {
    return NextResponse.json({ error: 'Owner/admin only' }, { status: 403 })
  }

  const origin = req.headers.get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? ''
  const redirect_uri = `${origin}/api/integrations/qbo/callback`
  // State payload encodes the org so the callback can attribute the tokens.
  const state = Buffer.from(JSON.stringify({ org: membership.organization_id, n: Math.random().toString(36).slice(2, 10) })).toString('base64url')
  const authorizeUrl = getQboClient().buildAuthorizeUrl({ state, redirect_uri })
  return NextResponse.redirect(authorizeUrl)
}
