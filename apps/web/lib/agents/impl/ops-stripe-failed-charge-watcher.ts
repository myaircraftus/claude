/**
 * ops.stripe-failed-charge-watcher
 *
 * Hourly Stripe API sweep of charges with status='failed' in the last
 * 26 hours. Groups by customer; if a customer has 2+ failed charges
 * in that window AND the matching organization is *not* in 'cancelled'
 * state, emit a 'stripe_failed_charge' recommendation so a human can
 * reach out before the account silently churns.
 *
 * No auto-action — recommendation only. We never email the customer
 * on the agent's behalf; the founder approves outreach.
 *
 * Safe to run with no STRIPE_SECRET_KEY: returns an empty report.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import { runAgent } from '../runner'

export interface FailedChargeCluster {
  customer_id: string
  organization_id: string | null
  org_name: string | null
  failure_count: number
  total_amount_cents: number
  last_failure_at: string
  last_failure_code: string | null
  last_failure_message: string | null
}

export interface FailedChargeReport {
  window_hours: number
  scanned_charges: number
  cluster_count: number
  clusters: FailedChargeCluster[]
}

const WINDOW_HOURS = 26

export async function watchStripeFailedCharges(args: {
  supabase: SupabaseClient
}): Promise<{ ok: boolean; output?: FailedChargeReport; runId?: string; error?: string }> {
  return runAgent<FailedChargeReport>(
    'ops.stripe-failed-charge-watcher',
    { supabase: args.supabase, input: { window_hours: WINDOW_HOURS } },
    async (logger) => {
      const key = process.env.STRIPE_SECRET_KEY
      if (!key) {
        return {
          output: {
            window_hours: WINDOW_HOURS,
            scanned_charges: 0,
            cluster_count: 0,
            clusters: [],
          },
          recommendation: { kind: 'stripe_not_configured' },
        }
      }
      logger.recordModel('stripe', 'charges.list')
      const stripe = new Stripe(key, { apiVersion: '2024-04-10' })
      const since = Math.floor((Date.now() - WINDOW_HOURS * 60 * 60 * 1000) / 1000)

      // charges.list supports created.gte. We page once for safety.
      const list = await stripe.charges.list({
        created: { gte: since },
        limit: 100,
      })
      const failed = list.data.filter((c) => c.status === 'failed' && c.customer)
      const grouped = new Map<string, FailedChargeCluster>()
      for (const c of failed) {
        const customerId = typeof c.customer === 'string' ? c.customer : c.customer?.id
        if (!customerId) continue
        const existing = grouped.get(customerId) ?? {
          customer_id: customerId,
          organization_id: null,
          org_name: null,
          failure_count: 0,
          total_amount_cents: 0,
          last_failure_at: new Date(c.created * 1000).toISOString(),
          last_failure_code: c.failure_code ?? null,
          last_failure_message: c.failure_message ?? null,
        }
        existing.failure_count += 1
        existing.total_amount_cents += c.amount
        if (c.created * 1000 > new Date(existing.last_failure_at).getTime()) {
          existing.last_failure_at = new Date(c.created * 1000).toISOString()
          existing.last_failure_code = c.failure_code ?? null
          existing.last_failure_message = c.failure_message ?? null
        }
        grouped.set(customerId, existing)
      }

      // Keep only clusters with 2+ failures.
      const clusters = Array.from(grouped.values()).filter((c) => c.failure_count >= 2)

      // Backfill org info from organizations.stripe_customer_id.
      if (clusters.length > 0) {
        const customerIds = clusters.map((c) => c.customer_id)
        const { data: orgs } = await args.supabase
          .from('organizations')
          .select('id, name, stripe_customer_id, subscription_status')
          .in('stripe_customer_id', customerIds)
        type Org = {
          id: string
          name: string | null
          stripe_customer_id: string
          subscription_status: string | null
        }
        const byCustomer = new Map<string, Org>()
        for (const o of (orgs ?? []) as Org[]) {
          byCustomer.set(o.stripe_customer_id, o)
        }
        for (const c of clusters) {
          const org = byCustomer.get(c.customer_id)
          if (org) {
            c.organization_id = org.id
            c.org_name = org.name
          }
        }
        // Drop clusters where the matching org is already cancelled —
        // those are expected failures, not surprise churn.
        const live = clusters.filter((c) => {
          const org = byCustomer.get(c.customer_id)
          return !org || org.subscription_status !== 'cancelled'
        })
        clusters.length = 0
        clusters.push(...live)
      }

      clusters.sort((a, b) => b.failure_count - a.failure_count)

      return {
        output: {
          window_hours: WINDOW_HOURS,
          scanned_charges: list.data.length,
          cluster_count: clusters.length,
          clusters,
        },
        needsHuman: clusters.length > 0,
        recommendation:
          clusters.length > 0
            ? {
                kind: 'stripe_failed_charges',
                cluster_count: clusters.length,
                clusters: clusters.slice(0, 25),
              }
            : null,
      }
    },
  )
}
