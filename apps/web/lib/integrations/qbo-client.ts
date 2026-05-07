/**
 * QuickBooks Online client adapter (Spec 3.3 + 5.7 — stub layer).
 *
 * Single import surface for QBO integration. Auto-detects mock vs real:
 *
 *   QBO_USE_MOCK=true          → mock
 *   QBO_CLIENT_ID + QBO_CLIENT_SECRET set → real Intuit OAuth + API
 *   neither set                → mock (safe default)
 *
 * Mock responses match Intuit QBO API v3 shape so swapping is a single
 * env-var flip + credential drop. Sandbox vs production is controlled
 * by QBO_ENV ('sandbox' | 'production', default sandbox).
 */

export interface QboClient {
  /** Build the OAuth start URL for the connect flow. */
  buildAuthorizeUrl(args: { state: string; redirect_uri: string; scope?: string }): string

  /** Exchange the auth code for tokens after callback. */
  exchangeAuthCode(args: { code: string; redirect_uri: string }): Promise<QboTokens>

  /** Refresh expired access tokens. */
  refreshTokens(args: { refresh_token: string }): Promise<QboTokens>

  /** Push a local invoice to QBO (3.3). Returns the QBO invoice id. */
  pushInvoice(args: { realm_id: string; access_token: string; invoice: QboInvoiceInput }): Promise<{ qbo_invoice_id: string; sync_token: string }>

  /** Pull recently-modified payments from QBO since a cursor (5.7). */
  listRecentPayments(args: { realm_id: string; access_token: string; since: string }): Promise<QboPayment[]>

  /** Verify + parse a QBO webhook payload. */
  parseWebhookEvent(args: { payload: string; signature: string | null }): Promise<QboWebhookEvent>
}

export interface QboTokens {
  realm_id: string
  access_token: string
  refresh_token: string
  /** Seconds until access_token expires. */
  expires_in: number
  /** Seconds until refresh_token expires (typically much longer). */
  x_refresh_token_expires_in: number
}

export interface QboInvoiceInput {
  /** Local invoice id — used for traceability + dedupe via metadata. */
  local_invoice_id: string
  customer_ref: string                // QBO Customer.Id
  amount_cents: number
  currency: string
  /** Line items per QBO ItemBasedExpenseLineDetail / SalesItemLineDetail. */
  lines: Array<{ description: string; amount_cents: number; quantity?: number }>
  due_date?: string                    // YYYY-MM-DD
}

export interface QboPayment {
  /** Intuit payment id. */
  id: string
  customer_ref: string
  /** Total payment amount, currency-major. */
  total_amount: number
  txn_date: string                    // YYYY-MM-DD
  /** When the payment was created in QBO (used as the recon cursor). */
  meta_create_time: string
  /** Lines reference invoice ids if the payment was applied to specific invoices. */
  applied_to_invoice_ids: string[]
}

export interface QboWebhookEvent {
  event_notifications: Array<{
    realm_id: string
    data_change_event: {
      entities: Array<{ name: string; id: string; operation: 'Create' | 'Update' | 'Delete'; last_updated: string }>
    }
  }>
}

export function isQboMock(): boolean {
  if (process.env.QBO_USE_MOCK === 'true') return true
  if (!process.env.QBO_CLIENT_ID || !process.env.QBO_CLIENT_SECRET) return true
  return false
}

let cached: QboClient | null = null

export function getQboClient(): QboClient {
  if (cached) return cached
  cached = isQboMock() ? buildMockClient() : buildRealClient()
  return cached
}

/* ─── Mock ──────────────────────────────────────────────────────────────── */

function buildMockClient(): QboClient {
  return {
    buildAuthorizeUrl(args) {
      // Mock returns the redirect_uri directly with a fake auth code so
      // the operator can click "Connect QBO" and complete the flow without
      // real Intuit credentials.
      const u = new URL(args.redirect_uri)
      u.searchParams.set('code', `mock_code_${Math.random().toString(36).slice(2, 12)}`)
      u.searchParams.set('state', args.state)
      u.searchParams.set('realmId', '4620816365363428614')
      return u.toString()
    },
    async exchangeAuthCode(_args) {
      return {
        realm_id: '4620816365363428614',
        access_token: `mock_access_${Math.random().toString(36).slice(2, 14)}`,
        refresh_token: `mock_refresh_${Math.random().toString(36).slice(2, 14)}`,
        expires_in: 3600,
        x_refresh_token_expires_in: 8726400,
      }
    },
    async refreshTokens(_args) {
      return {
        realm_id: '4620816365363428614',
        access_token: `mock_access_${Math.random().toString(36).slice(2, 14)}`,
        refresh_token: `mock_refresh_${Math.random().toString(36).slice(2, 14)}`,
        expires_in: 3600,
        x_refresh_token_expires_in: 8726400,
      }
    },
    async pushInvoice(_args) {
      return {
        qbo_invoice_id: `mock_inv_${Math.random().toString(36).slice(2, 12)}`,
        sync_token: '0',
      }
    },
    async listRecentPayments(args) {
      // Mock returns one payment matching a hypothetical local invoice
      // by amount. Real recon flow keys on amount + date — caller does
      // the matching, so the mock just returns deterministic data.
      const sinceMs = Date.parse(args.since)
      return [{
        id: `mock_pay_${Math.random().toString(36).slice(2, 12)}`,
        customer_ref: '12',
        total_amount: 145.00,
        txn_date: new Date(sinceMs + 86400_000).toISOString().slice(0, 10),
        meta_create_time: new Date(sinceMs + 86400_000).toISOString(),
        applied_to_invoice_ids: [`mock_inv_${Math.random().toString(36).slice(2, 12)}`],
      }]
    },
    async parseWebhookEvent(args) {
      // Mock — caller posts JSON. No HMAC check on mock path.
      return JSON.parse(args.payload) as QboWebhookEvent
    },
  }
}

/* ─── Real Intuit OAuth + QBO API (lazy-loaded) ─────────────────────────── */

function buildRealClient(): QboClient {
  // Implementation deliberately stubbed — drops in when QBO_CLIENT_ID +
  // QBO_CLIENT_SECRET arrive. The OAuth flow uses the standard Intuit
  // OAuth 2.0 endpoints (sandbox-quickbooks.api.intuit.com vs
  // quickbooks.api.intuit.com per QBO_ENV). Keeping the surface area
  // concrete so wiring real Intuit is mechanical.
  const env = process.env.QBO_ENV === 'production' ? 'production' : 'sandbox'
  const apiBase = env === 'production'
    ? 'https://quickbooks.api.intuit.com/v3'
    : 'https://sandbox-quickbooks.api.intuit.com/v3'

  return {
    buildAuthorizeUrl(args) {
      const u = new URL('https://appcenter.intuit.com/connect/oauth2')
      u.searchParams.set('client_id', process.env.QBO_CLIENT_ID!)
      u.searchParams.set('redirect_uri', args.redirect_uri)
      u.searchParams.set('response_type', 'code')
      u.searchParams.set('scope', args.scope ?? 'com.intuit.quickbooks.accounting')
      u.searchParams.set('state', args.state)
      return u.toString()
    },
    async exchangeAuthCode(args) {
      const res = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          accept: 'application/json',
          authorization: `Basic ${Buffer.from(`${process.env.QBO_CLIENT_ID}:${process.env.QBO_CLIENT_SECRET}`).toString('base64')}`,
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: args.code,
          redirect_uri: args.redirect_uri,
        }),
      })
      if (!res.ok) throw new Error(`QBO token exchange failed: ${res.status}`)
      const j = await res.json() as { access_token: string; refresh_token: string; expires_in: number; x_refresh_token_expires_in: number; realmId?: string }
      return {
        realm_id: j.realmId ?? '',
        access_token: j.access_token,
        refresh_token: j.refresh_token,
        expires_in: j.expires_in,
        x_refresh_token_expires_in: j.x_refresh_token_expires_in,
      }
    },
    async refreshTokens(args) {
      const res = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          accept: 'application/json',
          authorization: `Basic ${Buffer.from(`${process.env.QBO_CLIENT_ID}:${process.env.QBO_CLIENT_SECRET}`).toString('base64')}`,
        },
        body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: args.refresh_token }),
      })
      if (!res.ok) throw new Error(`QBO refresh failed: ${res.status}`)
      const j = await res.json() as { access_token: string; refresh_token: string; expires_in: number; x_refresh_token_expires_in: number }
      return { realm_id: '', access_token: j.access_token, refresh_token: j.refresh_token, expires_in: j.expires_in, x_refresh_token_expires_in: j.x_refresh_token_expires_in }
    },
    async pushInvoice(args) {
      const url = `${apiBase}/company/${args.realm_id}/invoice`
      const body = {
        Line: args.invoice.lines.map((l) => ({
          DetailType: 'SalesItemLineDetail',
          Amount: l.amount_cents / 100,
          Description: l.description,
          SalesItemLineDetail: { Qty: l.quantity ?? 1 },
        })),
        CustomerRef: { value: args.invoice.customer_ref },
        DueDate: args.invoice.due_date,
        PrivateNote: `local_invoice_id=${args.invoice.local_invoice_id}`,
      }
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${args.access_token}`,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(`QBO push invoice failed: ${res.status}`)
      const j = await res.json() as { Invoice: { Id: string; SyncToken: string } }
      return { qbo_invoice_id: j.Invoice.Id, sync_token: j.Invoice.SyncToken }
    },
    async listRecentPayments(args) {
      const q = `select * from Payment where MetaData.LastUpdatedTime > '${args.since}' maxresults 100`
      const url = `${apiBase}/company/${args.realm_id}/query?query=${encodeURIComponent(q)}`
      const res = await fetch(url, {
        method: 'GET',
        headers: { authorization: `Bearer ${args.access_token}`, accept: 'application/json' },
      })
      if (!res.ok) throw new Error(`QBO list payments failed: ${res.status}`)
      const j = await res.json() as { QueryResponse?: { Payment?: Array<{ Id: string; CustomerRef: { value: string }; TotalAmt: number; TxnDate: string; MetaData: { CreateTime: string }; Line?: Array<{ LinkedTxn?: Array<{ TxnId: string; TxnType: string }> }> }> } }
      const payments = j.QueryResponse?.Payment ?? []
      return payments.map((p) => ({
        id: p.Id,
        customer_ref: p.CustomerRef.value,
        total_amount: p.TotalAmt,
        txn_date: p.TxnDate,
        meta_create_time: p.MetaData.CreateTime,
        applied_to_invoice_ids: (p.Line ?? []).flatMap((l) => (l.LinkedTxn ?? []).filter((t) => t.TxnType === 'Invoice').map((t) => t.TxnId)),
      }))
    },
    async parseWebhookEvent(args) {
      // Real Intuit verifier code is HMAC-SHA256 over the raw body using
      // the verifier token. Wired when QBO_WEBHOOK_VERIFIER is set.
      const verifier = process.env.QBO_WEBHOOK_VERIFIER
      if (verifier && args.signature) {
        const crypto = await import('crypto')
        const expected = crypto.createHmac('sha256', verifier).update(args.payload).digest('base64')
        if (expected !== args.signature) throw new Error('QBO webhook signature mismatch')
      }
      return JSON.parse(args.payload) as QboWebhookEvent
    },
  }
}
