import { withTenantPrefix } from '@/lib/auth/tenant-routing'

export type AccountingOAuthProvider = 'quickbooks' | 'freshbooks'

interface OAuthEnvConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
}

export interface IntegrationOAuthState {
  provider: AccountingOAuthProvider
  userId: string
  orgId: string
  tenantSlug: string | null
  timestamp: number
}

function getRequiredEnv(name: string) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is required for integration OAuth`)
  }
  return value
}

export function getOAuthEnvConfig(provider: AccountingOAuthProvider): OAuthEnvConfig {
  switch (provider) {
    case 'quickbooks':
      return {
        clientId: getRequiredEnv('QUICKBOOKS_CLIENT_ID'),
        clientSecret: getRequiredEnv('QUICKBOOKS_CLIENT_SECRET'),
        redirectUri: getRequiredEnv('QUICKBOOKS_REDIRECT_URI'),
      }
    case 'freshbooks':
      return {
        clientId: getRequiredEnv('FRESHBOOKS_CLIENT_ID'),
        clientSecret: getRequiredEnv('FRESHBOOKS_CLIENT_SECRET'),
        redirectUri: getRequiredEnv('FRESHBOOKS_REDIRECT_URI'),
      }
  }
}

export function getAccountingProviderLabel(provider: AccountingOAuthProvider): string {
  return provider === 'quickbooks' ? 'QuickBooks' : 'FreshBooks'
}

export function getAccountingProviderScopes(provider: AccountingOAuthProvider): string[] {
  if (provider === 'quickbooks') {
    return ['com.intuit.quickbooks.accounting']
  }

  return [
    'user:profile:read',
    'user:clients:read',
    'user:clients:write',
    'user:invoices:read',
    'user:invoices:write',
  ]
}

export function buildIntegrationOAuthState(payload: IntegrationOAuthState): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url')
}

export function parseIntegrationOAuthState(state: string): IntegrationOAuthState {
  return JSON.parse(Buffer.from(state, 'base64url').toString('utf-8')) as IntegrationOAuthState
}

export function buildIntegrationOAuthAuthorizeUrl(
  provider: AccountingOAuthProvider,
  state: string
) {
  const config = getOAuthEnvConfig(provider)
  const params = new URLSearchParams()
  params.set('client_id', config.clientId)
  params.set('redirect_uri', config.redirectUri)
  params.set('response_type', 'code')
  params.set('state', state)

  if (provider === 'quickbooks') {
    params.set('scope', getAccountingProviderScopes(provider).join(' '))
    return `https://appcenter.intuit.com/connect/oauth2?${params.toString()}`
  }

  params.set('scope', getAccountingProviderScopes(provider).join(' '))
  return `https://auth.freshbooks.com/service/auth/oauth/authorize?${params.toString()}`
}

export function buildIntegrationRedirectPath(
  tenantSlug: string | null,
  provider: AccountingOAuthProvider,
  status: 'connected' | 'error',
  reason?: string
) {
  const pathname = withTenantPrefix('/integrations', tenantSlug)
  const params = new URLSearchParams({
    provider,
    integration_status: status,
  })
  if (reason) params.set('reason', reason)
  return `${pathname}?${params.toString()}`
}
