/**
 * Owner-portal auth helpers.
 *
 * The owner is NOT a member of the shop's organization. Their access
 * flows through a customers row: customers.portal_user_id = auth.uid()
 * AND customers.portal_access = true. From there we know which aircraft
 * they own (aircraft.owner_customer_id) and therefore which work orders
 * they're allowed to see / chat on.
 *
 * These helpers centralise the lookup so every /api/owner/* route uses
 * the same query and the same access checks. Service-role client only —
 * the lookup intentionally bypasses RLS to walk the relationship
 * graph, then the route enforces the ownership predicate in TypeScript.
 */
import type { NextRequest } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'

export interface OwnerCustomer {
  id: string
  organization_id: string
}

export interface OwnerContext {
  userId: string
  /** Every customer row the user is bound to (most owners have 1). */
  customers: OwnerCustomer[]
  customerIds: string[]
}

/**
 * Resolve the calling user as an owner-portal user, returning the customer
 * row(s) they're bound to. Returns null when:
 *   - no auth user (signed out)
 *   - the user has no customers row with portal_access = true
 */
export async function resolveOwnerContext(_req: NextRequest): Promise<OwnerContext | null> {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const service = createServiceSupabase()
  const { data: customers } = await service
    .from('customers')
    .select('id, organization_id')
    .eq('portal_user_id', user.id)
    .eq('portal_access', true)

  if (!customers || customers.length === 0) return null

  return {
    userId: user.id,
    customers: customers as OwnerCustomer[],
    customerIds: customers.map((c: { id: string }) => c.id),
  }
}

/**
 * Look up every aircraft id the owner owns. Used to scope /api/owner/*
 * list queries. Service-role: by definition aircraft.organization_id is
 * not the user's, so RLS would block this — and the whole point of
 * portal access is reading specific rows the user doesn't own.
 */
export async function getOwnerAircraftIds(ctx: OwnerContext): Promise<string[]> {
  if (ctx.customerIds.length === 0) return []
  const service = createServiceSupabase()
  const { data: aircraft } = await service
    .from('aircraft')
    .select('id')
    .in('owner_customer_id', ctx.customerIds)
  return (aircraft ?? []).map((a: { id: string }) => a.id)
}

/**
 * Verify the calling owner owns the aircraft on this work order. Returns
 * the work order row (with thread_id, aircraft_id, organization_id) on
 * success or null on failure. Use this as the FIRST check in any
 * /api/owner/work-orders/[id]/* route.
 */
export async function getOwnerScopedWorkOrder(
  ctx: OwnerContext,
  workOrderId: string,
): Promise<
  | {
      id: string
      organization_id: string
      aircraft_id: string | null
      thread_id: string | null
    }
  | null
> {
  const service = createServiceSupabase()
  const { data: wo } = await service
    .from('work_orders')
    .select('id, organization_id, aircraft_id, thread_id')
    .eq('id', workOrderId)
    .maybeSingle()
  if (!wo || !wo.aircraft_id) return null

  // Confirm the aircraft is owned by one of this user's customers
  const { data: aircraft } = await service
    .from('aircraft')
    .select('id, owner_customer_id')
    .eq('id', wo.aircraft_id)
    .maybeSingle()
  if (!aircraft || !aircraft.owner_customer_id) return null
  if (!ctx.customerIds.includes(aircraft.owner_customer_id)) return null

  return wo as {
    id: string
    organization_id: string
    aircraft_id: string | null
    thread_id: string | null
  }
}
