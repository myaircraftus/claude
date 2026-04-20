import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { encryptIntegrationCredentials } from '@/lib/integrations/crypto'
import {
  buildIntegrationRedirectPath,
  getAccountingProviderLabel,
  getOAuthEnvConfig,
  parseIntegrationOAuthState,
  type AccountingOAuthProvider,
} from '@/lib/integrations/oauth'

const TEN_MINUTES_MS = 10 * 60 * 1000

function providerDocsUrl(provider: AccountingOAuthProvider) {
  return provider === 'quickbooks'
    ? 'https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/oauth-2.0'
    : 'https://www.freshbooks.com/api/authentication'
}

async function exchangeQuickBooksCode(code: string) {
  const config = getOAuthEnvConfig('quickbooks')
  const auth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')
  const response = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.redirectUri,
    }),
  })

  if (!response.ok) {
    throw new Error(`QuickBooks token exchange failed with ${response.status}`)
  }

  return response.json()
}

async function exchangeFreshBooksCode(code: string) {
  const config = getOAuthEnvConfig('freshbooks')
  const response = await fetch('https://api.freshbooks.com/auth/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
    }),
  })

  if (!response.ok) {
    throw new Error(`FreshBooks token exchange failed with ${response.status}`)
  }

  return response.json()
}

async function fetchFreshBooksIdentity(accessToken: string) {
  const response = await fetch('https://api.freshbooks.com/auth/api/v1/users/me', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Api-Version': 'alpha',
    },
  })

  if (!response.ok) {
    throw new Error(`FreshBooks identity lookup failed with ${response.status}`)
  }

  return response.json()
}

async function fetchQuickBooksCompanyName(realmId: string, accessToken: string) {
  const response = await fetch(
    `https://quickbooks.api.intuit.com/v3/company/${realmId}/companyinfo/${realmId}?minorversion=75`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    }
  )

  if (!response.ok) return null
  const payload = await response.json()
  return payload?.CompanyInfo?.CompanyName ?? null
}

export async function GET(req: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.myaircraft.us'
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const stateParam = url.searchParams.get('state')
  const oauthError = url.searchParams.get('error')

  if (!stateParam) {
    return NextResponse.redirect(
      `${appUrl}/integrations?integration_status=error&reason=missing_state`
    )
  }

  let state
  try {
    state = parseIntegrationOAuthState(stateParam)
  } catch {
    return NextResponse.redirect(
      `${appUrl}/integrations?integration_status=error&reason=invalid_state`
    )
  }

  const redirectPath = buildIntegrationRedirectPath(
    state.tenantSlug,
    state.provider,
    oauthError ? 'error' : 'connected',
    oauthError || undefined
  )

  if (Date.now() - state.timestamp > TEN_MINUTES_MS) {
    return NextResponse.redirect(
      `${appUrl}${buildIntegrationRedirectPath(state.tenantSlug, state.provider, 'error', 'oauth_state_expired')}`
    )
  }

  if (!code || oauthError) {
    return NextResponse.redirect(`${appUrl}${redirectPath}`)
  }

  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || user.id !== state.userId) {
    return NextResponse.redirect(
      `${appUrl}${buildIntegrationRedirectPath(state.tenantSlug, state.provider, 'error', 'auth_mismatch')}`
    )
  }

  try {
    const { data: membership } = await supabase
      .from('organization_memberships')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .eq('organization_id', state.orgId)
      .not('accepted_at', 'is', null)
      .single()

    if (!membership || !['owner', 'admin'].includes((membership as any).role)) {
      throw new Error('Admin role required to complete integration connection')
    }

    const { data: existingIntegration } = await supabase
      .from('integrations')
      .select('settings')
      .eq('organization_id', state.orgId)
      .eq('provider', state.provider)
      .maybeSingle()

    let encryptedTokens: ReturnType<typeof encryptIntegrationCredentials>
    let settings: Record<string, unknown>

    if (state.provider === 'quickbooks') {
      const realmId = url.searchParams.get('realmId')
      if (!realmId) {
        throw new Error('QuickBooks did not return a company ID')
      }

      const tokenPayload = await exchangeQuickBooksCode(code)
      const companyName = await fetchQuickBooksCompanyName(realmId, tokenPayload.access_token)

      encryptedTokens = encryptIntegrationCredentials({
        access_token: tokenPayload.access_token,
        refresh_token: tokenPayload.refresh_token,
        token_type: tokenPayload.token_type ?? 'Bearer',
        scope: tokenPayload.scope ?? null,
        expires_at: new Date(Date.now() + Number(tokenPayload.expires_in ?? 3600) * 1000).toISOString(),
        realm_id: realmId,
        company_name: companyName,
      })

      settings = {
        ...(((existingIntegration as any)?.settings ?? {}) as Record<string, unknown>),
        docs_url: providerDocsUrl('quickbooks'),
        sync_fields: ['Invoice number', 'Customer', 'Aircraft reference', 'Line items', 'Taxes', 'Totals'],
        oauth_mode: true,
        connected_company_name: companyName,
        realm_id: realmId,
      }
    } else {
      const tokenPayload = await exchangeFreshBooksCode(code)
      const identity = await fetchFreshBooksIdentity(tokenPayload.access_token)
      const memberships =
        identity?.response?.business_memberships ??
        identity?.business_memberships ??
        identity?.response?.businessMemberships ??
        []
      const primaryMembership =
        memberships.find((entry: any) => entry?.business?.account_id) ??
        memberships.find((entry: any) => entry?.business?.accountId) ??
        memberships[0]
      const business = primaryMembership?.business ?? primaryMembership
      const accountId = String(business?.account_id ?? business?.accountId ?? '').trim()
      if (!accountId) {
        throw new Error('FreshBooks did not return an account ID for the connected business')
      }

      encryptedTokens = encryptIntegrationCredentials({
        access_token: tokenPayload.access_token,
        refresh_token: tokenPayload.refresh_token,
        token_type: tokenPayload.token_type ?? 'Bearer',
        scope: tokenPayload.scope ?? null,
        expires_at: new Date(Date.now() + Number(tokenPayload.expires_in ?? 3600) * 1000).toISOString(),
        account_id: accountId,
        business_name: business?.name ?? null,
      })

      settings = {
        ...(((existingIntegration as any)?.settings ?? {}) as Record<string, unknown>),
        docs_url: providerDocsUrl('freshbooks'),
        sync_fields: ['Invoice number', 'Customer', 'Line items', 'Totals', 'Memo', 'Issue date'],
        oauth_mode: true,
        account_id: accountId,
        connected_business_name: business?.name ?? null,
      }
    }

    const { data: integrationRecord } = await supabase
      .from('integrations')
      .upsert(
        {
          organization_id: state.orgId,
          provider: state.provider,
          display_name: getAccountingProviderLabel(state.provider),
          status: 'connected',
          credentials_encrypted: encryptedTokens,
          settings,
          last_sync_status: 'connected',
          last_sync_error: null,
          created_by: user.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'organization_id,provider' }
      )
      .select('id')
      .single()

    await supabase.from('audit_logs').insert({
      organization_id: state.orgId,
      user_id: user.id,
      action: 'integration.connected',
      entity_type: 'integration',
      entity_id: integrationRecord?.id ?? null,
      metadata_json: {
        provider: state.provider,
        oauth_mode: true,
      },
    })

    return NextResponse.redirect(`${appUrl}${redirectPath}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'oauth_callback_failed'
    return NextResponse.redirect(
      `${appUrl}${buildIntegrationRedirectPath(state.tenantSlug, state.provider, 'error', message)}`
    )
  }
}
