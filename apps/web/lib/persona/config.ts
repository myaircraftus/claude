/**
 * Persona system (Spec 0.2) — single source of truth for owner / shop / admin
 * UI variants. Same app, three radically different surfaces.
 *
 * Phase 18 (mig 119) — `mechanic` persona was merged into `shop`. Every
 * persona-gated UI / RLS / nav branch that previously discriminated mechanic
 * vs shop now treats them as one. The org-level role enum still has
 * 'mechanic' as a value (it's a personnel role, not a UI persona) and is
 * orthogonal to this module.
 *
 * - Owner: plain-English aircraft owner. Hides W/O profitability, labor rates,
 *   and shop-pricing. Home is "My Aircraft".
 * - Shop: shop foreman / dispatcher / A&P. Sees scheduling, work orders,
 *   parts, tools, KPIs, profitability. Home is the operations dashboard.
 * - Admin: platform admin. Surfaced via the footer admin entry, NOT in
 *   the main persona switcher. Home is /admin/command-center.
 *
 * Read this config from `getCurrentPersona()` (server) or `usePersona()`
 * (client). Don't branch on persona inline — extend this config and read it.
 */

import type { Persona } from '@/types'

export interface PersonaConfig {
  /** Default landing route after login or org-switch. */
  homeRoute: string
  /** Section labels for the sidebar — order matters. UI maps these to nav items. */
  sidebarSections: string[]
  /**
   * Module keys that are *hidden* for this persona. Compared against
   * `nav-item.module` and `route.module` to filter access. Adding a key here
   * is the only place to hide a module from a persona; do not branch inline.
   */
  hiddenModules: string[]
  /** System prompt sent to the AI assistant for this persona. */
  aiSystemPrompt: string
  /** Ordered card priorities for the AI Inbox / home screen (Phase 5). */
  homeCardPriorities: string[]
  /** Display label, used in toggles, settings, and the persona switcher. */
  label: string
}

export const PERSONA_CONFIG: Record<Persona, PersonaConfig> = {
  owner: {
    // Spec 5.1 — Smart Home Screen replaces the legacy /dashboard for owners.
    homeRoute: '/my-aircraft',
    sidebarSections: ['MY AIRCRAFT', 'DOCUMENTS', 'MAINTENANCE', 'FINANCES'],
    hiddenModules: ['work-orders-financials', 'labor-rates', 'shop-pricing'],
    aiSystemPrompt:
      'You are an AI co-pilot for an aircraft owner. Speak in plain English. Translate maintenance jargon. Surface upcoming items, costs, and compliance.',
    homeCardPriorities: ['expiring-docs', 'upcoming-compliance', 'open-squawks', 'next-flight'],
    label: 'Owner',
  },
  shop: {
    // Phase 18 — shop is the union of the old shop-foreman + mechanic surfaces.
    // hiddenModules is empty: shop sees everything operational. Owner-specific
    // finance surfaces (Aircraft Economics, Tax P&L) are gated at the
    // route-guard / nav-category level, not via hiddenModules here, because
    // some shop deployments DO need limited owner-side visibility.
    //
    // Dashboard is the shop command center. It shows exceptions and launches
    // official module workflows; source records still live in their modules.
    homeRoute: '/dashboard',
    sidebarSections: ['DASHBOARD', 'WORK ORDERS', 'SCHEDULING', 'PARTS', 'TOOLS', 'INVOICING', 'REPORTS', 'ADMIN'],
    hiddenModules: [],
    aiSystemPrompt:
      'You are an AI assistant for an aviation maintenance shop. You serve A&P mechanics, shop foremen, and dispatchers. Be technically precise. Reference FARs, ADs, SBs. Optimize for throughput, profitability, and compliance.',
    homeCardPriorities: [
      'assigned-wos',
      'overdue-wos',
      'tool-calibrations-due',
      'today-shifts',
      'low-stock-parts',
      'pending-approvals',
      'kpis',
    ],
    label: 'Shop',
  },
  // Platform admin — internal-only persona surfaced via the footer admin entry.
  admin: {
    // Phase 16 Sprint 16.7 — admin homeRoute is the unified command-center.
    homeRoute: '/admin/command-center',
    sidebarSections: ['DASHBOARD', 'WORK ORDERS', 'SCHEDULING', 'PARTS', 'INVOICING', 'REPORTS', 'ADMIN'],
    hiddenModules: [],
    aiSystemPrompt:
      'You are an AI assistant for a platform admin operating an aviation maintenance SaaS. You have full visibility into org / billing / ops state. Be precise and concise.',
    homeCardPriorities: ['overdue-wos', 'today-shifts', 'low-stock-parts', 'pending-approvals', 'kpis'],
    label: 'Admin',
  },
}

/**
 * Default fallback. Used by getCurrentPersona() when membership.persona and
 * user_profiles.persona are both NULL — a freshly created user.
 */
export const DEFAULT_PERSONA: Persona = 'owner'

/** Type guard for runtime persona values (e.g. from request bodies). */
export function isPersona(value: unknown): value is Persona {
  return value === 'owner' || value === 'shop' || value === 'admin'
}

/**
 * Resolve a persona value from its possible sources, with the documented
 * fallback chain: membership → user_profile → DEFAULT_PERSONA.
 *
 * Phase 18 backward-compat: any 'mechanic' value still floating in memory
 * (e.g. from a stale session before mig 119 ran) is silently coerced to
 * 'shop' so the UI never crashes on a missing persona-config branch.
 *
 * Strings outside the allowed enum are silently coerced to DEFAULT_PERSONA;
 * the caller can rely on the return value being a valid Persona.
 */
export function resolvePersona(
  membershipPersona: string | null | undefined,
  userProfilePersona: string | null | undefined,
): Persona {
  const fold = (v: string | null | undefined): string | null | undefined =>
    v === 'mechanic' ? 'shop' : v
  const m = fold(membershipPersona)
  const u = fold(userProfilePersona)
  if (isPersona(m)) return m
  if (isPersona(u)) return u
  return DEFAULT_PERSONA
}

/** Whether the given module key is hidden for this persona. */
export function isModuleHidden(persona: Persona, moduleKey: string): boolean {
  return PERSONA_CONFIG[persona].hiddenModules.includes(moduleKey)
}
