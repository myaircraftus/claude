/**
 * Phase 13.5 — collapsible nav categories.
 * Phase 18 Sprint 18.3 — admin category split into 4 (Admin Console, Admin
 * Billing, Admin Vision, Admin Content) so the Phase 16 ops surfaces have
 * a home in the nav. The legacy 'organization' category is preserved for
 * non-admin org-level routes (/org, /settings, /billing, /integrations).
 *
 * Canonical category structure (per Phase 2 spec). The existing AppLayout
 * still owns the flat per-persona NavItem[] arrays — this module overlays a
 * category grouping on top via href→category lookup, so the nav can render
 * with collapsible section headers without losing the persona-permissions
 * gating that the flat arrays provide.
 *
 * Items whose href doesn't appear in the map fall into 'Other' so the
 * sidebar never silently drops a navigation entry.
 */
import type { Persona } from '@/types'

export type NavCategoryId =
  | 'today'
  | 'aircraft'
  | 'operations'
  | 'workforce'
  | 'customer'
  | 'economics'
  | 'commercial'
  | 'ai'
  // Phase 18 — 4 admin sub-categories (admin-only).
  | 'admin-console'
  | 'admin-billing'
  | 'admin-vision'
  | 'admin-content'
  // Non-admin org-level routes (settings, integrations, billing for org owners).
  | 'organization'
  | 'profile'
  | 'other'

export interface NavCategoryDef {
  id: NavCategoryId
  label: string
  /** Personas that should ever see this section. Items inside also have their own filter. */
  personas: Persona[]
  /** Whether the category starts collapsed by default for net-new users. */
  defaultExpanded: boolean
  /** Display order. */
  order: number
}

export const NAV_CATEGORIES: NavCategoryDef[] = [
  { id: 'today',          label: 'Today',          personas: ['owner', 'shop', 'admin'], defaultExpanded: true,  order: 1 },
  { id: 'aircraft',       label: 'Aircraft',       personas: ['owner', 'shop', 'admin'], defaultExpanded: true,  order: 2 },
  { id: 'operations',     label: 'Operations',     personas: ['owner', 'shop', 'admin'], defaultExpanded: true,  order: 3 },
  { id: 'workforce',      label: 'Workforce',      personas: ['shop', 'admin'],          defaultExpanded: false, order: 4 },
  { id: 'customer',       label: 'Customer',       personas: ['shop', 'admin'],          defaultExpanded: false, order: 5 },
  { id: 'economics',      label: 'Economics',      personas: ['owner', 'admin'],         defaultExpanded: false, order: 6 },
  { id: 'commercial',     label: 'Commercial',     personas: ['shop', 'admin'],          defaultExpanded: false, order: 7 },
  { id: 'ai',             label: 'AI',             personas: ['owner', 'shop', 'admin'], defaultExpanded: false, order: 8 },
  // Admin-only sub-categories (Phase 18 Sprint 18.3 — surface Phase 16 ops UI)
  { id: 'admin-console',  label: 'Admin Console',  personas: ['admin'],                  defaultExpanded: true,  order: 50 },
  { id: 'admin-billing',  label: 'Admin Billing',  personas: ['admin'],                  defaultExpanded: false, order: 51 },
  { id: 'admin-vision',   label: 'Admin Vision',   personas: ['admin'],                  defaultExpanded: false, order: 52 },
  { id: 'admin-content',  label: 'Admin Content',  personas: ['admin'],                  defaultExpanded: false, order: 53 },
  // Non-admin org-level routes (settings, integrations, etc.).
  { id: 'organization',   label: 'Organization',   personas: ['owner', 'shop', 'admin'], defaultExpanded: false, order: 60 },
  { id: 'profile',        label: 'Profile',        personas: ['owner', 'shop', 'admin'], defaultExpanded: false, order: 70 },
  { id: 'other',          label: 'Other',          personas: ['owner', 'shop', 'admin'], defaultExpanded: true,  order: 99 },
]

/**
 * href / pattern → category. Match by href prefix; FIRST MATCH WINS.
 * Order matters: longer / more-specific prefixes come first so e.g.
 * `/admin/billing/orgs` resolves to 'admin-billing' (not 'admin-console')
 * before the catch-all `/admin` ever gets a chance to match.
 */
const HREF_CATEGORY_PATTERNS: Array<{ prefix: string; category: NavCategoryId }> = [
  // ── Today
  { prefix: '/my-aircraft',                  category: 'today' },
  { prefix: '/my-day',                       category: 'today' },
  { prefix: '/dashboard',                    category: 'today' },
  { prefix: '/inbox',                        category: 'today' },
  { prefix: '/workflow',                     category: 'today' },
  { prefix: '/workspace',                    category: 'today' },
  // ── Aircraft
  { prefix: '/aircraft',                     category: 'aircraft' },
  { prefix: '/compliance',                   category: 'aircraft' },
  { prefix: '/inspections',                  category: 'aircraft' },
  { prefix: '/continued',                    category: 'aircraft' },
  { prefix: '/meters',                       category: 'aircraft' },
  { prefix: '/locations',                    category: 'aircraft' },
  { prefix: '/telemetry',                    category: 'aircraft' },
  // ── Operations
  { prefix: '/work-orders',                  category: 'operations' },
  { prefix: '/parts',                        category: 'operations' },
  { prefix: '/purchase-orders',              category: 'operations' },
  { prefix: '/vendors',                      category: 'operations' },
  { prefix: '/tools',                        category: 'operations' },
  { prefix: '/documents',                    category: 'operations' },
  { prefix: '/expirations',                  category: 'operations' },
  { prefix: '/manuals',                      category: 'operations' },
  { prefix: '/mechanic',                     category: 'operations' },
  // ── Workforce
  { prefix: '/scheduler',                    category: 'workforce' },
  { prefix: '/time-clock',                   category: 'workforce' },
  { prefix: '/clock',                        category: 'workforce' },
  { prefix: '/time-off',                     category: 'workforce' },
  { prefix: '/users',                        category: 'workforce' },
  { prefix: '/org/directory',                category: 'workforce' },
  // ── Customer
  { prefix: '/approvals',                    category: 'customer' },
  { prefix: '/customers',                    category: 'customer' },
  { prefix: '/marketplace',                  category: 'customer' },
  // ── Economics
  { prefix: '/costs',                        category: 'economics' },
  { prefix: '/economics',                    category: 'economics' },
  { prefix: '/reports',                      category: 'economics' },
  // ── Commercial
  { prefix: '/invoices',                     category: 'commercial' },
  { prefix: '/billing-rates',                category: 'commercial' },
  { prefix: '/accounting',                   category: 'commercial' },
  // ── AI
  { prefix: '/ask',                          category: 'ai' },
  { prefix: '/ai',                           category: 'ai' },
  // ── Admin Billing (must be before /admin catch-all)
  { prefix: '/admin/billing',                category: 'admin-billing' },
  // ── Admin Vision (must be before /admin catch-all)
  { prefix: '/admin/vision',                 category: 'admin-vision' },
  // ── Admin Content (must be before /admin catch-all)
  { prefix: '/admin/content',                category: 'admin-content' },
  { prefix: '/admin/marketing',              category: 'admin-content' },
  { prefix: '/admin/faraim',                 category: 'admin-content' },
  { prefix: '/admin/tour',                   category: 'admin-content' },
  // ── Admin Console (catch-all for /admin/* — must be LAST among /admin prefixes)
  { prefix: '/admin/command-center',         category: 'admin-console' },
  { prefix: '/admin/support',                category: 'admin-console' },
  { prefix: '/admin/observability',          category: 'admin-console' },
  { prefix: '/admin/errors',                 category: 'admin-console' },
  { prefix: '/admin/health',                 category: 'admin-console' },
  { prefix: '/admin/ops-assistant',          category: 'admin-console' },
  { prefix: '/admin/customer-signals',       category: 'admin-console' },
  { prefix: '/admin/ingestion',              category: 'admin-console' },
  { prefix: '/admin',                        category: 'admin-console' },
  // ── Non-admin org-level
  { prefix: '/org',                          category: 'organization' },
  { prefix: '/settings',                     category: 'organization' },
  { prefix: '/billing',                      category: 'organization' },
  { prefix: '/integrations',                 category: 'organization' },
  // ── Profile
  { prefix: '/profile',                      category: 'profile' },
  { prefix: '/account',                      category: 'profile' },
]

/** Lookup a category for a given href. Returns 'other' if no match. */
export function categoryForHref(href: string | undefined | null): NavCategoryId {
  if (!href) return 'other'
  for (const { prefix, category } of HREF_CATEGORY_PATTERNS) {
    if (href === prefix || href.startsWith(prefix + '/') || href.startsWith(prefix + '?')) {
      return category
    }
  }
  return 'other'
}

/** Filter category list to those visible for the persona. */
export function categoriesForPersona(persona: Persona): NavCategoryDef[] {
  return NAV_CATEGORIES.filter((c) => c.personas.includes(persona))
    .sort((a, b) => a.order - b.order)
}

export interface CategorizedNavItem<T = unknown> {
  category: NavCategoryId
  item: T
}

/**
 * Group a flat list of nav items into category buckets. Items without a
 * matching prefix go to 'other'. The bucket ordering follows NAV_CATEGORIES.
 */
export function groupNavItemsByCategory<T extends { href?: string; tab?: string }>(
  items: T[],
  persona: Persona,
): Array<{ category: NavCategoryDef; items: T[] }> {
  const allowed = new Set(categoriesForPersona(persona).map((c) => c.id))
  const buckets = new Map<NavCategoryId, T[]>()
  for (const item of items) {
    const cat = categoryForHref(item.href ?? (item.tab ? `/mechanic?tab=${item.tab}` : null))
    const arr = buckets.get(cat) ?? []
    arr.push(item)
    buckets.set(cat, arr)
  }
  return categoriesForPersona(persona)
    .map((cat) => ({ category: cat, items: buckets.get(cat.id) ?? [] }))
    .filter(({ category, items }) => allowed.has(category.id) && items.length > 0)
}

/** localStorage key — scoped per user so multiple accounts on the same browser don't trample. */
export function navCategoriesStorageKey(userId: string): string {
  return `myaircraft_nav_categories_${userId}`
}
