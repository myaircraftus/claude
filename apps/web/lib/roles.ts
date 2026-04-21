import type { OrgRole } from '@/types'

/**
 * Role groups used for server-side authorization.
 *
 * The org role hierarchy is:
 *   owner > admin > mechanic > pilot > viewer > auditor
 *
 * Import these arrays and use `.includes(role)` to gate API routes and
 * server component layouts. Never trust client-side role checks alone.
 */

/** Org-level administrators — owner + admin. */
export const ADMIN_AND_ABOVE: readonly OrgRole[] = ['owner', 'admin'] as const

/** Roles that can perform mechanic actions (create/edit work orders, etc). */
export const MECHANIC_AND_ABOVE: readonly OrgRole[] = ['owner', 'admin', 'mechanic'] as const

/** Roles with read access to the main app surface. */
export const ANY_MEMBER: readonly OrgRole[] = [
  'owner',
  'admin',
  'mechanic',
  'pilot',
  'viewer',
  'auditor',
] as const

/** Roles that should see the AI workspace / Command Center. */
export const WORKSPACE_ACCESS: readonly OrgRole[] = ['owner', 'admin', 'mechanic'] as const

/** Roles that should see the billing settings sub-area. */
export const BILLING_ACCESS: readonly OrgRole[] = ['owner', 'admin'] as const

export function isAdminOrAbove(role: OrgRole | null | undefined): boolean {
  return !!role && ADMIN_AND_ABOVE.includes(role)
}

export function isMechanicOrAbove(role: OrgRole | null | undefined): boolean {
  return !!role && MECHANIC_AND_ABOVE.includes(role)
}

export function hasWorkspaceAccess(role: OrgRole | null | undefined): boolean {
  return !!role && WORKSPACE_ACCESS.includes(role)
}

export function hasBillingAccess(role: OrgRole | null | undefined): boolean {
  return !!role && BILLING_ACCESS.includes(role)
}

/**
 * Minimal permission set for the UI — read-only.
 * Used as the SAFE fallback when team data fails to load.
 * DO NOT use a permissive default: that is a security issue.
 */
export const MINIMAL_MECHANIC_PERMISSIONS = {
  aiCommandCenter: false,
  dashboard: false,
  aircraft: false,
  squawks: false,
  estimates: false,
  workOrders: false,
  invoices: false,
  logbook: false,
  settingsFull: false,
  woLineItems: false,
  woOwnersView: false,
  woCloseWO: false,
  woInvoice: false,
} as const
