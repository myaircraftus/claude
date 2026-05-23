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
  /**
   * True when this context was synthesised for a platform_admin who
   * doesn't have a real customers.portal_user_id row. Lets admins
   * preview the owner experience without needing a fake portal link.
   * Routes can still gate the heaviest write operations on
   * isAdminPreview if they care; reads behave the same.
   */
  isAdminPreview: boolean
  /**
   * Orgs the admin belongs to. Only populated when isAdminPreview.
   * Used by list endpoints to broaden the scope to "every aircraft in
   * the admin's orgs" rather than only aircraft linked to a customer
   * via owner_customer_id (most prod data doesn't have that linkage
   * yet, so the strict portal scope returns []).
   */
  adminOrgIds: string[]
}

/**
 * Resolve the calling user as an owner-portal user, returning the customer
 * row(s) they're bound to. Returns null when:
 *   - no auth user (signed out)
 *   - the user has no customers row with portal_access = true AND
 *     is not a platform_admin
 *
 * Platform-admin fallback: when a platform_admin has no portal customer
 * link (the normal Andy/in-dev case), we synthesise an OwnerContext that
 * grants access to every customer row in every org the admin belongs to.
 * This is intentionally a backdoor for previewing/QA; real owners always
 * go through the customers.portal_user_id path.
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

  if (customers && customers.length > 0) {
    return {
      userId: user.id,
      customers: customers as OwnerCustomer[],
      customerIds: (customers as OwnerCustomer[]).map((c) => c.id),
      isAdminPreview: false,
      adminOrgIds: [],
    }
  }

  // No portal-customer link. Check the platform_admin backdoor — admins
  // get a synthesised context spanning every customers row in the orgs
  // they belong to, so they can preview the owner experience.
  const { data: profile } = await service
    .from('user_profiles')
    .select('is_platform_admin')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile?.is_platform_admin) return null

  const { data: memberships } = await service
    .from('organization_memberships')
    .select('organization_id')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
  const orgIds = (memberships ?? []).map((m: { organization_id: string }) => m.organization_id)
  if (orgIds.length === 0) {
    return {
      userId: user.id,
      customers: [],
      customerIds: [],
      isAdminPreview: true,
      adminOrgIds: [],
    }
  }

  const { data: orgCustomers } = await service
    .from('customers')
    .select('id, organization_id')
    .in('organization_id', orgIds)

  const list = (orgCustomers ?? []) as OwnerCustomer[]
  return {
    userId: user.id,
    customers: list,
    customerIds: list.map((c) => c.id),
    isAdminPreview: true,
    adminOrgIds: orgIds,
  }
}

/**
 * Look up every aircraft id the owner owns. Used to scope /api/owner/*
 * list queries. Service-role: by definition aircraft.organization_id is
 * not the user's, so RLS would block this — and the whole point of
 * portal access is reading specific rows the user doesn't own.
 */
export async function getOwnerAircraftIds(ctx: OwnerContext): Promise<string[]> {
  const service = createServiceSupabase()
  // Admin preview: every aircraft in the admin's orgs is in scope, even
  // when no customers row has owner_customer_id wired up. Real portal
  // customers stay strict (only their owned aircraft).
  if (ctx.isAdminPreview && ctx.adminOrgIds.length > 0) {
    const { data: aircraft } = await service
      .from('aircraft')
      .select('id')
      .in('organization_id', ctx.adminOrgIds)
      .eq('is_archived', false)
    return (aircraft ?? []).map((a: { id: string }) => a.id)
  }
  if (ctx.customerIds.length === 0) return []
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

  // Admin preview: the WO must just belong to one of the admin's orgs.
  if (ctx.isAdminPreview) {
    if (!ctx.adminOrgIds.includes(wo.organization_id)) return null
    return wo as {
      id: string
      organization_id: string
      aircraft_id: string | null
      thread_id: string | null
    }
  }

  // Strict portal-customer path: confirm the aircraft is owned by one
  // of the calling user's customer rows.
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
