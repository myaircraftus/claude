/**
 * GET /api/integrations/qbo/callback  (Spec 3.3 + 5.7 stub layer)
 *
 * Intuit OAuth2 redirect target. Exchanges the auth code for tokens,
 * upserts qbo_sync_state for the org, then redirects to /org/integrations/qbo.
 *
 * State is base64url JSON {org, n} — verified to belong to the auth user
 * via organization_memberships. Mock client tolerates any state and
 * returns canned tokens.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { getQboClient } from '@/lib/integrations/qbo-client'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const realmId = url.searchParams.get('realmId')
  if (!code || !state) {
    return NextResponse.redirect(new URL('/org/integrations/qbo?error=missing_code', req.url))
  }

  let parsed: { org?: string } = {}
  try { parsed = JSON.parse(Buffer.from(state, 'base64url').toString('utf8')) } catch {}
  if (!parsed.org) return NextResponse.redirect(new URL('/org/integrations/qbo?error=bad_state', req.url))

  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', req.url))

  // Verify the user actually owns/admins the target org before storing tokens.
  const { data: membership } = await supabase
    .from('organization_memberships').select('organization_id, role')
    .eq('user_id', user.id).eq('organization_id', parsed.org)
    .not('accepted_at', 'is', null).single()
  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return NextResponse.redirect(new URL('/org/integrations/qbo?error=unauthorized', req.url))
  }

  const redirect_uri = `${url.origin}/api/integrations/qbo/callback`
  let tokens
  try {
    tokens = await getQboClient().exchangeAuthCode({ code, redirect_uri })
  } catch (e) {
    console.warn('[qbo/callback] token exchange failed:', e)
    return NextResponse.redirect(new URL('/org/integrations/qbo?error=token_exchange_failed', req.url))
  }

  // Upsert sync state. realmId from the query string takes precedence
  // over the mock client's canned realm_id since real Intuit puts it
  // in the redirect.
  const service = createServiceSupabase()
  await service.from('qbo_sync_state').upsert({
    organization_id: parsed.org,
    realm_id: realmId ?? tokens.realm_id,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    connected_at: new Date().toISOString(),
    disconnected_at: null,
    last_error: null,
  }, { onConflict: 'organization_id' })

  return NextResponse.redirect(new URL('/org/integrations/qbo?connected=1', req.url))
}
