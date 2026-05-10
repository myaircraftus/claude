/**
 * Phase 13.5 — collapsible nav categories.
 *
 * Canonical category structure (per Phase 2 spec). The existing AppLayout
 * still owns the flat per-persona NavItem[] arrays (ownerNavBase /
 * buildMechanicNav / adminNavItems) — this module overlays a category
 * grouping on top via href→category lookup, so the nav can render with
 * collapsible section headers without losing the mechanic-permissions
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
  { id: 'today',        label: 'Today',        personas: ['owner', 'mechanic', 'shop', 'admin'], defaultExpanded: true,  order: 1 },
  { id: 'aircraft',     label: 'Aircraft',     personas: ['owner', 'mechanic', 'shop', 'admin'], defaultExpanded: true,  order: 2 },
  { id: 'operations',   label: 'Operations',   personas: ['owner', 'mechanic', 'shop', 'admin'], defaultExpanded: true,  order: 3 },
  { id: 'workforce',    label: 'Workforce',    personas: ['mechanic', 'shop', 'admin'],          defaultExpanded: false, order: 4 },
  { id: 'customer',     label: 'Customer',     personas: ['shop', 'admin'],                       defaultExpanded: false, order: 5 },
  { id: 'economics',    label: 'Economics',    personas: ['owner', 'admin'],                      defaultExpanded: false, order: 6 },
  { id: 'commercial',   label: 'Commercial',   personas: ['shop', 'admin'],                       defaultExpanded: false, order: 7 },
  { id: 'ai',           label: 'AI',           personas: ['owner', 'mechanic', 'shop', 'admin'], defaultExpanded: false, order: 8 },
  { id: 'organization', label: 'Organization', personas: ['admin'],                               defaultExpanded: false, order: 9 },
  { id: 'profile',      label: 'Profile',      personas: ['owner', 'mechanic', 'shop', 'admin'], defaultExpanded: false, order: 10 },
  { id: 'other',        label: 'Other',        personas: ['owner', 'mechanic', 'shop', 'admin'], defaultExpanded: true,  order: 99 },
]

/**
 * href / pattern → category. Match by href prefix; first match wins. The
 * '/admin/...' prefix routes belong to 'organization' since /admin/* is
 * platform-staff infra.
 */
const HREF_CATEGORY_PATTERNS: Array<{ prefix: string; category: NavCategoryId }> = [
  // Today
  { prefix: '/my-aircraft',       category: 'today' },
  { prefix: '/my-day',            category: 'today' },
  { prefix: '/dashboard',         category: 'today' },
  { prefix: '/inbox',             category: 'today' },
  { prefix: '/workflow',          category: 'today' },
  { prefix: '/workspace',         category: 'today' },
  // Aircraft
  { prefix: '/aircraft',          category: 'aircraft' },
  { prefix: '/compliance',        category: 'aircraft' },
  { prefix: '/inspections',       category: 'aircraft' },
  { prefix: '/continued',         category: 'aircraft' },
  { prefix: '/meters',            category: 'aircraft' },
  { prefix: '/locations',         category: 'aircraft' },
  // Operations
  { prefix: '/work-orders',       category: 'operations' },
  { prefix: '/parts',             category: 'operations' },
  { prefix: '/purchase-orders',   category: 'operations' },
  { prefix: '/vendors',           category: 'operations' },
  { prefix: '/tools',             category: 'operations' },
  { prefix: '/documents',         category: 'operations' },
  { prefix: '/expirations',       category: 'operations' },
  { prefix: '/manuals',           category: 'operations' },
  { prefix: '/mechanic',          category: 'operations' },
  // Workforce
  { prefix: '/scheduler',         category: 'workforce' },
  { prefix: '/time-clock',        category: 'workforce' },
  { prefix: '/clock',             category: 'workforce' },
  { prefix: '/time-off',          category: 'workforce' },
  { prefix: '/users',             category: 'workforce' },
  // Customer
  { prefix: '/approvals',         category: 'customer' },
  { prefix: '/customers',         category: 'customer' },
  { prefix: '/marketplace',       category: 'customer' },
  // Economics
  { prefix: '/costs',             category: 'economics' },
  { prefix: '/economics',         category: 'economics' },
  { prefix: '/reports',           category: 'economics' },
  // AI
  { prefix: '/ask',               category: 'ai' },
  // Organization (admin / org-level)
  { prefix: '/admin',             category: 'organization' },
  { prefix: '/org',               category: 'organization' },
  { prefix: '/settings',          category: 'organization' },
  { prefix: '/billing',           category: 'organization' },
  { prefix: '/integrations',      category: 'organization' },
  // Profile
  { prefix: '/profile',           category: 'profile' },
  { prefix: '/account',           category: 'profile' },
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
