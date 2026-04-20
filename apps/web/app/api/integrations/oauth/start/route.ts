import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import {
  buildIntegrationOAuthAuthorizeUrl,
  buildIntegrationOAuthState,
  buildIntegrationRedirectPath,
  type AccountingOAuthProvider,
} from '@/lib/integrations/oauth'

function isSupportedProvider(provider: string | null): provider is AccountingOAuthProvider {
  return provider === 'quickbooks' || provider === 'freshbooks'
}

export async function GET(req: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.myaircraft.us'
  const providerParam = new URL(req.url).searchParams.get('provider')
  if (!isSupportedProvider(providerParam)) {
    return NextResponse.json({ error: 'Unsupported integration provider' }, { status: 400 })
  }

  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id, role, organizations(slug)')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()

  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!['owner', 'admin'].includes((membership as any).role)) {
    return NextResponse.json({ error: 'Admin role required to manage integrations' }, { status: 403 })
  }

  const organization = Array.isArray((membership as any).organizations)
    ? (membership as any).organizations[0]
    : (membership as any).organizations

  try {
    const state = buildIntegrationOAuthState({
      provider: providerParam,
      userId: user.id,
      orgId: (membership as any).organization_id,
      tenantSlug: organization?.slug ?? null,
      timestamp: Date.now(),
    })

    const authorizeUrl = buildIntegrationOAuthAuthorizeUrl(providerParam, state)
    return NextResponse.redirect(authorizeUrl)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Integration OAuth is not configured'
    const redirectPath = buildIntegrationRedirectPath(
      organization?.slug ?? null,
      providerParam,
      'error',
      message
    )
    return NextResponse.redirect(`${appUrl}${redirectPath}`)
  }
}
