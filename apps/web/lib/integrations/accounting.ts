import { createHash } from 'crypto'
import { decryptIntegrationCredentials, encryptIntegrationCredentials } from '@/lib/integrations/crypto'
import { getOAuthEnvConfig, type AccountingOAuthProvider } from '@/lib/integrations/oauth'

interface ProviderTokenBundle {
  access_token: string
  refresh_token: string
  expires_at?: string | null
  scope?: string | null
  token_type?: string | null
  realm_id?: string | null
  company_name?: string | null
  account_id?: string | null
  business_id?: string | null
  business_name?: string | null
}

export interface ExportableInvoice {
  id: string
  invoice_number: string
  status: string
  invoice_date: string
  due_date: string
  subtotal: number
  tax_amount: number
  total: number
  notes?: string | null
  customer?: {
    name?: string | null
    email?: string | null
    phone?: string | null
    company?: string | null
    billing_address?: string | null
  } | null
  aircraft?: {
    tail_number?: string | null
  } | null
  line_items?: Array<{
    description?: string | null
    quantity?: number | null
    unit_price?: number | null
    item_type?: string | null
  }>
}

function sanitizeDisplayName(value: string) {
  return value.replace(/[^\w\s\-&]/g, '').trim().slice(0, 90)
}

function uniqueName(base: string, suffix: string) {
  const sanitizedBase = sanitizeDisplayName(base) || 'MyAircraft Customer'
  return `${sanitizedBase} ${suffix}`.slice(0, 100)
}

function parseBillingAddress(address?: string | null) {
  if (!address) return null
  const lines = address
    .split(/\r?\n|,/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length === 0) return null

  return {
    Line1: lines[0],
    Line2: lines[1],
    City: lines[2],
    CountrySubDivisionCode: lines[3],
    PostalCode: lines[4],
  }
}

function buildInvoiceHash(invoice: ExportableInvoice) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        id: invoice.id,
        number: invoice.invoice_number,
        total: invoice.total,
        due: invoice.due_date,
        lines: (invoice.line_items ?? []).map((line) => ({
          description: line.description,
          quantity: line.quantity,
          unit_price: line.unit_price,
        })),
      })
    )
    .digest('hex')
}

export function getDecryptedProviderTokens(
  credentials: unknown
): ProviderTokenBundle | null {
  return decryptIntegrationCredentials<ProviderTokenBundle>(credentials)
}

async function refreshQuickBooksToken(tokens: ProviderTokenBundle): Promise<ProviderTokenBundle> {
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
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
    }),
  })

  if (!response.ok) {
    throw new Error(`QuickBooks token refresh failed with ${response.status}`)
  }

  const payload = await response.json()
  return {
    ...tokens,
    access_token: payload.access_token,
    refresh_token: payload.refresh_token ?? tokens.refresh_token,
    expires_at: new Date(Date.now() + Number(payload.expires_in ?? 3600) * 1000).toISOString(),
    scope: payload.scope ?? tokens.scope,
    token_type: payload.token_type ?? 'Bearer',
  }
}

async function refreshFreshBooksToken(tokens: ProviderTokenBundle): Promise<ProviderTokenBundle> {
  const config = getOAuthEnvConfig('freshbooks')
  const response = await fetch('https://api.freshbooks.com/auth/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
    }),
  })

  if (!response.ok) {
    throw new Error(`FreshBooks token refresh failed with ${response.status}`)
  }

  const payload = await response.json()
  return {
    ...tokens,
    access_token: payload.access_token,
    refresh_token: payload.refresh_token ?? tokens.refresh_token,
    expires_at: new Date(Date.now() + Number(payload.expires_in ?? 3600) * 1000).toISOString(),
    scope: payload.scope ?? tokens.scope,
    token_type: payload.token_type ?? 'Bearer',
  }
}

async function ensureValidTokens(
  provider: AccountingOAuthProvider,
  tokens: ProviderTokenBundle,
  integrationId: string,
  supabase: any
) {
  const expiresAt = tokens.expires_at ? new Date(tokens.expires_at).getTime() : null
  const needsRefresh = !tokens.access_token || !expiresAt || expiresAt - Date.now() < 120000

  if (!needsRefresh) {
    return tokens
  }

  const refreshed =
    provider === 'quickbooks'
      ? await refreshQuickBooksToken(tokens)
      : await refreshFreshBooksToken(tokens)

  await supabase
    .from('integrations')
    .update({
      credentials_encrypted: encryptIntegrationCredentials(refreshed),
      updated_at: new Date().toISOString(),
    })
    .eq('id', integrationId)

  return refreshed
}

async function quickBooksRequest<T>(
  realmId: string,
  path: string,
  method: 'GET' | 'POST',
  accessToken: string,
  body?: unknown
) {
  const response = await fetch(`https://quickbooks.api.intuit.com/v3/company/${realmId}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`QuickBooks API ${method} ${path} failed (${response.status}): ${text.slice(0, 240)}`)
  }

  return (await response.json()) as T
}

async function findQuickBooksCustomerId(
  realmId: string,
  accessToken: string,
  invoice: ExportableInvoice
) {
  const displayName =
    invoice.customer?.company ||
    invoice.customer?.name ||
    `Aircraft Customer ${invoice.aircraft?.tail_number ?? invoice.invoice_number}`
  const queryName = displayName.replace(/'/g, "\\'")
  const query = `select * from Customer where DisplayName = '${queryName}' maxresults 1`
  const result = await quickBooksRequest<any>(
    realmId,
    `/query?minorversion=75&query=${encodeURIComponent(query)}`,
    'GET',
    accessToken
  )
  const existing = result?.QueryResponse?.Customer?.[0]
  if (existing?.Id) return existing.Id as string

  const created = await quickBooksRequest<any>(realmId, '/customer?minorversion=75', 'POST', accessToken, {
    DisplayName: uniqueName(displayName, invoice.aircraft?.tail_number ? `(${invoice.aircraft.tail_number})` : ''),
    CompanyName: invoice.customer?.company ?? undefined,
    PrimaryEmailAddr: invoice.customer?.email ? { Address: invoice.customer.email } : undefined,
    PrimaryPhone: invoice.customer?.phone ? { FreeFormNumber: invoice.customer.phone } : undefined,
    BillAddr: parseBillingAddress(invoice.customer?.billing_address ?? null) ?? undefined,
  })

  return created?.Customer?.Id as string
}

async function findQuickBooksServiceItemId(realmId: string, accessToken: string) {
  const candidates = ['Aircraft Maintenance', 'Services', 'Service']

  for (const name of candidates) {
    const query = `select * from Item where Name = '${name.replace(/'/g, "\\'")}' maxresults 1`
    const result = await quickBooksRequest<any>(
      realmId,
      `/query?minorversion=75&query=${encodeURIComponent(query)}`,
      'GET',
      accessToken
    )
    const item = result?.QueryResponse?.Item?.[0]
    if (item?.Id) return item.Id as string
  }

  const serviceResult = await quickBooksRequest<any>(
    realmId,
    `/query?minorversion=75&query=${encodeURIComponent("select * from Item where Type = 'Service' maxresults 1")}`,
    'GET',
    accessToken
  )
  const serviceItem = serviceResult?.QueryResponse?.Item?.[0]
  if (serviceItem?.Id) return serviceItem.Id as string

  throw new Error(
    'QuickBooks has no service item available for invoice export. Create a service item such as "Aircraft Maintenance" and retry.'
  )
}

async function exportInvoiceToQuickBooks(
  realmId: string,
  accessToken: string,
  invoice: ExportableInvoice
) {
  const customerId = await findQuickBooksCustomerId(realmId, accessToken, invoice)
  const serviceItemId = await findQuickBooksServiceItemId(realmId, accessToken)

  const lineItems = (invoice.line_items ?? []).map((line) => {
    const quantity = Number(line.quantity ?? 1)
    const unitPrice = Number(line.unit_price ?? 0)
    return {
      Amount: Number((quantity * unitPrice).toFixed(2)),
      DetailType: 'SalesItemLineDetail',
      Description: line.description ?? 'Aircraft maintenance',
      SalesItemLineDetail: {
        ItemRef: {
          value: serviceItemId,
        },
        Qty: quantity,
        UnitPrice: unitPrice,
      },
    }
  })

  if (lineItems.length === 0) {
    lineItems.push({
      Amount: Number(invoice.total ?? 0),
      DetailType: 'SalesItemLineDetail',
      Description: invoice.notes || `Aircraft maintenance invoice ${invoice.invoice_number}`,
      SalesItemLineDetail: {
        ItemRef: {
          value: serviceItemId,
        },
        Qty: 1,
        UnitPrice: Number(invoice.total ?? 0),
      },
    })
  }

  const payload = {
    DocNumber: invoice.invoice_number,
    TxnDate: invoice.invoice_date,
    DueDate: invoice.due_date,
    CustomerRef: {
      value: customerId,
    },
    PrivateNote: [invoice.notes, invoice.aircraft?.tail_number ? `Aircraft: ${invoice.aircraft.tail_number}` : null]
      .filter(Boolean)
      .join(' • '),
    Line: lineItems,
  }

  const result = await quickBooksRequest<any>(realmId, '/invoice?minorversion=75', 'POST', accessToken, payload)
  return {
    providerInvoiceId: result?.Invoice?.Id as string | undefined,
    remoteNumber: result?.Invoice?.DocNumber as string | undefined,
  }
}

async function freshBooksRequest<T>(
  path: string,
  method: 'GET' | 'POST',
  accessToken: string,
  body?: unknown
) {
  const response = await fetch(`https://api.freshbooks.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'Api-Version': 'alpha',
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`FreshBooks API ${method} ${path} failed (${response.status}): ${text.slice(0, 240)}`)
  }

  return (await response.json()) as T
}

async function resolveFreshBooksAccount(tokens: ProviderTokenBundle) {
  if (tokens.account_id) {
    return {
      accountId: tokens.account_id,
      businessName: tokens.business_name ?? null,
    }
  }

  const result = await freshBooksRequest<any>('/auth/api/v1/users/me', 'GET', tokens.access_token)
  const memberships =
    result?.response?.business_memberships ??
    result?.business_memberships ??
    result?.response?.businessMemberships ??
    []

  const primary =
    memberships.find((membership: any) => membership?.business?.account_id) ??
    memberships.find((membership: any) => membership?.business?.accountId) ??
    memberships[0]

  const business = primary?.business ?? primary
  const accountId = String(business?.account_id ?? business?.accountId ?? '').trim()
  if (!accountId) {
    throw new Error('FreshBooks did not return an account ID for the connected business')
  }

  return {
    accountId,
    businessName: business?.name ?? null,
  }
}

async function findFreshBooksClientId(
  accountId: string,
  accessToken: string,
  invoice: ExportableInvoice
) {
  const searchTerm = invoice.customer?.email || invoice.customer?.name || invoice.customer?.company || ''
  if (searchTerm) {
    const result = await freshBooksRequest<any>(
      `/accounting/account/${accountId}/users/clients?search=${encodeURIComponent(searchTerm)}`,
      'GET',
      accessToken
    )
    const clients = result?.response?.result?.clients ?? result?.clients ?? []
    const matched = clients.find((client: any) => {
      return (
        (invoice.customer?.email && client?.email === invoice.customer.email) ||
        client?.organization === invoice.customer?.company ||
        client?.fname === invoice.customer?.name ||
        `${client?.fname ?? ''} ${client?.lname ?? ''}`.trim() === invoice.customer?.name
      )
    })
    if (matched?.id) return String(matched.id)
  }

  const nameParts = (invoice.customer?.name ?? '').trim().split(/\s+/)
  const fname = nameParts[0] || invoice.customer?.company || 'Aircraft'
  const lname = nameParts.slice(1).join(' ') || 'Customer'
  const created = await freshBooksRequest<any>(
    `/accounting/account/${accountId}/users/clients`,
    'POST',
    accessToken,
    {
      client: {
        fname,
        lname,
        organization: invoice.customer?.company ?? undefined,
        email: invoice.customer?.email ?? undefined,
        home_phone: invoice.customer?.phone ?? undefined,
      },
    }
  )
  return String(created?.response?.result?.client?.id)
}

async function exportInvoiceToFreshBooks(
  accountId: string,
  accessToken: string,
  invoice: ExportableInvoice
) {
  const clientId = await findFreshBooksClientId(accountId, accessToken, invoice)
  const createResult = await freshBooksRequest<any>(
    `/accounting/account/${accountId}/invoices/invoices`,
    'POST',
    accessToken,
    {
      invoice: {
        customerid: Number(clientId),
        create_date: invoice.invoice_date,
        due_offset_days: 0,
        lines: (invoice.line_items ?? []).map((line) => ({
          name: line.description ?? 'Aircraft maintenance',
          description: line.description ?? 'Aircraft maintenance',
          qty: Number(line.quantity ?? 1),
          unit_cost: {
            amount: Number(line.unit_price ?? 0).toFixed(2),
            code: 'USD',
          },
        })),
        notes: [invoice.notes, invoice.aircraft?.tail_number ? `Aircraft: ${invoice.aircraft.tail_number}` : null]
          .filter(Boolean)
          .join(' • '),
        invoice_number: invoice.invoice_number,
      },
    }
  )

  const createdInvoice = createResult?.response?.result?.invoice
  return {
    providerInvoiceId: createdInvoice?.id ? String(createdInvoice.id) : undefined,
    remoteNumber: createdInvoice?.invoice_number ? String(createdInvoice.invoice_number) : undefined,
  }
}

export async function exportAccountingInvoices(options: {
  provider: AccountingOAuthProvider
  integrationId: string
  credentials: unknown
  settings: Record<string, unknown> | null
  invoices: ExportableInvoice[]
  orgId: string
  supabase: any
}) {
  const { provider, integrationId, credentials, settings, invoices, orgId, supabase } = options
  const decrypted = getDecryptedProviderTokens(credentials)

  if (!decrypted?.refresh_token) {
    throw new Error(`${provider === 'quickbooks' ? 'QuickBooks' : 'FreshBooks'} OAuth tokens are missing or incomplete`)
  }

  const tokens = await ensureValidTokens(provider, decrypted, integrationId, supabase)
  let providerContext: { realmId?: string; accountId?: string; businessName?: string | null } = {}

  if (provider === 'quickbooks') {
    if (!tokens.realm_id) {
      throw new Error('QuickBooks connection is missing a realm/company ID')
    }
    providerContext.realmId = tokens.realm_id
  } else {
    const resolved = await resolveFreshBooksAccount(tokens)
    providerContext.accountId = resolved.accountId
    providerContext.businessName = resolved.businessName

    if (resolved.accountId !== tokens.account_id || resolved.businessName !== tokens.business_name) {
      const updatedTokens = {
        ...tokens,
        account_id: resolved.accountId,
        business_name: resolved.businessName,
      }
      await supabase
        .from('integrations')
        .update({
          credentials_encrypted: encryptIntegrationCredentials(updatedTokens),
          updated_at: new Date().toISOString(),
        })
        .eq('id', integrationId)
      Object.assign(tokens, updatedTokens)
    }
  }

  const { data: existingExports } = await supabase
    .from('invoice_exports')
    .select('invoice_id, provider_invoice_id, status')
    .eq('integration_id', integrationId)
    .eq('organization_id', orgId)

  const existingExportMap = new Map<string, { provider_invoice_id?: string | null; status?: string | null }>()
  for (const row of existingExports ?? []) {
    existingExportMap.set(row.invoice_id, row)
  }

  let exported = 0
  let skipped = 0
  const failures: string[] = []

  for (const invoice of invoices) {
    const existing = existingExportMap.get(invoice.id)
    const exportHash = buildInvoiceHash(invoice)

    if (existing?.provider_invoice_id) {
      skipped++
      continue
    }

    try {
      const result =
        provider === 'quickbooks'
          ? await exportInvoiceToQuickBooks(providerContext.realmId!, tokens.access_token, invoice)
          : await exportInvoiceToFreshBooks(providerContext.accountId!, tokens.access_token, invoice)

      await supabase
        .from('invoice_exports')
        .upsert(
          {
            organization_id: orgId,
            integration_id: integrationId,
            invoice_id: invoice.id,
            status: 'exported',
            provider_invoice_id: result.providerInvoiceId ?? null,
            error_message: null,
            exported_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'integration_id,invoice_id' }
        )

      exported++
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown export error'
      failures.push(`${invoice.invoice_number}: ${message}`)
      await supabase
        .from('invoice_exports')
        .upsert(
          {
            organization_id: orgId,
            integration_id: integrationId,
            invoice_id: invoice.id,
            status: 'failed',
            provider_invoice_id: null,
            error_message: message,
            exported_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'integration_id,invoice_id' }
        )
    }

    void exportHash
  }

  return {
    exported,
    skipped,
    failures,
    context: providerContext,
  }
}
