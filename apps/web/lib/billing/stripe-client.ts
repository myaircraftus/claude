/**
 * Stripe client adapter (Spec 6.3 — stub layer).
 *
 * Single import surface for every billing route. Auto-detects whether
 * to use the real Stripe SDK or the in-memory mock based on env:
 *
 *   STRIPE_USE_MOCK=true                  → mock (test fixtures)
 *   STRIPE_SECRET_KEY=sk_live_...         → real SDK
 *   neither set                           → mock (safe default)
 *
 * Mock responses match the Stripe SDK shape byte-for-byte so swapping
 * is a single env-var flip + credential drop. New billing UI consumes
 * `getStripeClient()`; legacy /api/billing/* routes that import Stripe
 * directly continue to work unchanged.
 */

export interface StripeClient {
  /** Create a checkout session — returns a hosted URL the client redirects to. */
  createCheckoutSession(args: {
    organization_id: string
    customer_email?: string
    price_id: string
    success_url: string
    cancel_url: string
    metadata?: Record<string, string>
  }): Promise<{ id: string; url: string }>

  /** Customer-portal session for self-serve plan changes. */
  createPortalSession(args: {
    customer_id: string
    return_url: string
  }): Promise<{ id: string; url: string }>

  /** Read a subscription. */
  retrieveSubscription(id: string): Promise<StripeSubscription>

  /** Read invoices for a customer. */
  listInvoices(args: { customer_id: string; limit?: number }): Promise<StripeInvoice[]>

  /** Verify + parse a webhook event payload. */
  parseWebhookEvent(args: { payload: string; signature: string | null }): Promise<StripeWebhookEvent>
}

export interface StripeSubscription {
  id: string
  customer: string
  status: 'incomplete' | 'incomplete_expired' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' | 'paused'
  items: { data: Array<{ price: { id: string; product: string } }> }
  current_period_start: number
  current_period_end: number
  cancel_at_period_end: boolean
  trial_end: number | null
  metadata: Record<string, string>
}

export interface StripeInvoice {
  id: string
  customer: string
  subscription: string | null
  status: 'draft' | 'open' | 'paid' | 'uncollectible' | 'void'
  amount_due: number
  amount_paid: number
  currency: string
  invoice_pdf: string | null
  hosted_invoice_url: string | null
  period_start: number
  period_end: number
  created: number
}

export interface StripeWebhookEvent {
  id: string
  type: string
  data: { object: Record<string, unknown> }
  created: number
}

export function isStripeMock(): boolean {
  if (process.env.STRIPE_USE_MOCK === 'true') return true
  if (!process.env.STRIPE_SECRET_KEY) return true
  return false
}

let cached: StripeClient | null = null

export function getStripeClient(): StripeClient {
  if (cached) return cached
  cached = isStripeMock() ? buildMockClient() : buildRealClient()
  return cached
}

/* ─── Mock ──────────────────────────────────────────────────────────────── */

function buildMockClient(): StripeClient {
  const sessions = new Map<string, { url: string; metadata: Record<string, string> }>()

  return {
    async createCheckoutSession(args) {
      const id = `cs_test_mock_${Math.random().toString(36).slice(2, 14)}`
      // Mock checkout URL — points back to a local success route that
      // simulates the webhook flow. UI shows a "mock checkout" badge.
      const url = `${args.success_url}${args.success_url.includes('?') ? '&' : '?'}__mock_session=${id}`
      sessions.set(id, { url, metadata: { ...(args.metadata ?? {}), price_id: args.price_id } })
      return { id, url }
    },
    async createPortalSession(args) {
      return {
        id: `bps_test_mock_${Math.random().toString(36).slice(2, 14)}`,
        url: `${args.return_url}${args.return_url.includes('?') ? '&' : '?'}__mock_portal=1`,
      }
    },
    async retrieveSubscription(id) {
      const now = Math.floor(Date.now() / 1000)
      return {
        id, customer: 'cus_test_mock',
        status: 'active',
        items: { data: [{ price: { id: 'price_test_mock', product: 'prod_test_mock' } }] },
        current_period_start: now - 86400 * 7,
        current_period_end: now + 86400 * 23,
        cancel_at_period_end: false,
        trial_end: null,
        metadata: {},
      }
    },
    async listInvoices(args) {
      const now = Math.floor(Date.now() / 1000)
      return Array.from({ length: Math.min(args.limit ?? 5, 5) }, (_, i) => ({
        id: `in_test_mock_${i}`,
        customer: args.customer_id,
        subscription: 'sub_test_mock',
        status: 'paid' as const,
        amount_due: 4900,
        amount_paid: 4900,
        currency: 'usd',
        invoice_pdf: null,
        hosted_invoice_url: null,
        period_start: now - 86400 * (30 * (i + 1)),
        period_end: now - 86400 * (30 * i),
        created: now - 86400 * (30 * i),
      }))
    },
    async parseWebhookEvent(args) {
      // Mock webhook: caller already JSON-parsed payload OR sends raw JSON.
      const obj = JSON.parse(args.payload)
      return obj as StripeWebhookEvent
    },
  }
}

/* ─── Real Stripe SDK adapter (lazy-loaded) ─────────────────────────────── */

function buildRealClient(): StripeClient {
  // Lazy require so the SDK isn't pulled into bundles that don't need it.
  // The 'stripe' npm dep is already in package.json from the existing
  // /api/billing/checkout route.
  const Stripe = require('stripe') as typeof import('stripe').default
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-04-10' })
  return {
    async createCheckoutSession(args) {
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer_email: args.customer_email,
        line_items: [{ price: args.price_id, quantity: 1 }],
        success_url: args.success_url,
        cancel_url: args.cancel_url,
        metadata: { organization_id: args.organization_id, ...(args.metadata ?? {}) },
      })
      return { id: session.id, url: session.url ?? '' }
    },
    async createPortalSession(args) {
      const session = await stripe.billingPortal.sessions.create({
        customer: args.customer_id,
        return_url: args.return_url,
      })
      return { id: session.id, url: session.url }
    },
    async retrieveSubscription(id) {
      return (await stripe.subscriptions.retrieve(id)) as unknown as StripeSubscription
    },
    async listInvoices(args) {
      const list = await stripe.invoices.list({ customer: args.customer_id, limit: args.limit ?? 10 })
      return list.data as unknown as StripeInvoice[]
    },
    async parseWebhookEvent(args) {
      if (!args.signature) throw new Error('Missing stripe-signature header')
      const secret = process.env.STRIPE_WEBHOOK_SECRET
      if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET not configured')
      const event = stripe.webhooks.constructEvent(args.payload, args.signature, secret)
      return event as unknown as StripeWebhookEvent
    },
  }
}
