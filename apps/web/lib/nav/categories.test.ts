/**
 * Phase 13.5 — nav category tests.
 */
import { describe, it, expect } from 'vitest'
import {
  categoryForHref,
  categoriesForPersona,
  groupNavItemsByCategory,
  NAV_CATEGORIES,
  navCategoriesStorageKey,
} from './categories'

describe('categoryForHref', () => {
  it('maps /my-aircraft → today', () => {
    expect(categoryForHref('/my-aircraft')).toBe('today')
    expect(categoryForHref('/my-aircraft/123')).toBe('today')
  })
  it('maps /aircraft/* → aircraft', () => {
    expect(categoryForHref('/aircraft')).toBe('aircraft')
    expect(categoryForHref('/aircraft/abc/edit')).toBe('aircraft')
  })
  it('maps /admin/* subroutes to the correct admin sub-category (Phase 18 Sprint 18.3)', () => {
    // Admin Console — catch-all for /admin/* without a more-specific prefix
    expect(categoryForHref('/admin')).toBe('admin-console')
    expect(categoryForHref('/admin/command-center')).toBe('admin-console')
    expect(categoryForHref('/admin/support/inbox')).toBe('admin-console')
    expect(categoryForHref('/admin/health')).toBe('admin-console')
    expect(categoryForHref('/admin/ops-assistant')).toBe('admin-console')
    expect(categoryForHref('/admin/observability/errors')).toBe('admin-console')
    expect(categoryForHref('/admin/customer-signals')).toBe('admin-console')
    // Admin Billing
    expect(categoryForHref('/admin/billing/batch')).toBe('admin-billing')
    expect(categoryForHref('/admin/billing/orgs')).toBe('admin-billing')
    // Admin Vision
    expect(categoryForHref('/admin/vision')).toBe('admin-vision')
    expect(categoryForHref('/admin/vision/review')).toBe('admin-vision')
    expect(categoryForHref('/admin/vision/workers')).toBe('admin-vision')
    expect(categoryForHref('/admin/vision/telemetry')).toBe('admin-vision')
    // Admin Content
    expect(categoryForHref('/admin/content')).toBe('admin-content')
    expect(categoryForHref('/admin/faraim')).toBe('admin-content')
    expect(categoryForHref('/admin/tour')).toBe('admin-content')
  })

  it('maps non-admin /org and /settings → organization (not admin-console)', () => {
    expect(categoryForHref('/settings')).toBe('organization')
    expect(categoryForHref('/billing')).toBe('organization')
    expect(categoryForHref('/integrations')).toBe('organization')
    expect(categoryForHref('/org/billing')).toBe('organization')
  })
  it('maps /work-orders → operations', () => {
    expect(categoryForHref('/work-orders')).toBe('operations')
  })
  it('falls back to other for unknown', () => {
    expect(categoryForHref('/some-random-route')).toBe('other')
    expect(categoryForHref(null)).toBe('other')
    expect(categoryForHref(undefined)).toBe('other')
  })
})

describe('categoriesForPersona', () => {
  it('owner sees Today, Aircraft, Operations, Economics, AI, Profile, Other', () => {
    const ids = categoriesForPersona('owner').map((c) => c.id)
    expect(ids).toContain('today')
    expect(ids).toContain('aircraft')
    expect(ids).toContain('operations')
    expect(ids).toContain('economics')
    expect(ids).toContain('ai')
    expect(ids).toContain('profile')
    expect(ids).toContain('other')
    expect(ids).not.toContain('workforce')
    expect(ids).not.toContain('customer')
    expect(ids).not.toContain('commercial')
    // owner does NOT see any of the admin sub-categories
    expect(ids).not.toContain('admin-console')
    expect(ids).not.toContain('admin-billing')
    expect(ids).not.toContain('admin-vision')
    expect(ids).not.toContain('admin-content')
  })

  it('admin sees the 4 admin sub-categories (Phase 18 Sprint 18.3)', () => {
    const ids = categoriesForPersona('admin').map((c) => c.id)
    expect(ids).toContain('admin-console')
    expect(ids).toContain('admin-billing')
    expect(ids).toContain('admin-vision')
    expect(ids).toContain('admin-content')
  })

  it('shop does NOT see any of the admin sub-categories', () => {
    const ids = categoriesForPersona('shop').map((c) => c.id)
    expect(ids).not.toContain('admin-console')
    expect(ids).not.toContain('admin-billing')
    expect(ids).not.toContain('admin-vision')
    expect(ids).not.toContain('admin-content')
  })

  it('shop sees workforce + operations + customer + commercial + ai but NOT economics or organization', () => {
    // Phase 18 mig 119 — mechanic merged into shop. Shop is the canonical
    // operational persona now; it sees the workforce + customer + commercial
    // categories the legacy mechanic flow couldn't.
    const ids = categoriesForPersona('shop').map((c) => c.id)
    expect(ids).toContain('workforce')
    expect(ids).toContain('operations')
    expect(ids).toContain('customer')
    expect(ids).toContain('commercial')
    expect(ids).not.toContain('economics')
    expect(ids).not.toContain('organization')
  })

  it('admin sees every category', () => {
    const ids = categoriesForPersona('admin').map((c) => c.id)
    for (const c of NAV_CATEGORIES) {
      expect(ids).toContain(c.id)
    }
  })
})

describe('groupNavItemsByCategory', () => {
  const items = [
    { label: 'Home', href: '/my-aircraft' },
    { label: 'Aircraft', href: '/aircraft' },
    { label: 'Work Orders', href: '/work-orders' },
    { label: 'Admin', href: '/admin' },
    { label: 'Random', href: '/random-thing' },
  ]

  it('puts each item in the correct bucket for owner', () => {
    const groups = groupNavItemsByCategory(items, 'owner')
    const groupMap = new Map(groups.map((g) => [g.category.id, g.items]))
    expect(groupMap.get('today')?.[0]?.label).toBe('Home')
    expect(groupMap.get('aircraft')?.[0]?.label).toBe('Aircraft')
    expect(groupMap.get('operations')?.[0]?.label).toBe('Work Orders')
    // owner doesn't see any admin sub-category, so /admin is filtered out
    expect(groupMap.get('admin-console')).toBeUndefined()
  })

  it('admin sees /admin under admin-console category (Phase 18 Sprint 18.3)', () => {
    const groups = groupNavItemsByCategory(items, 'admin')
    const adminGroup = groups.find((g) => g.category.id === 'admin-console')
    expect(adminGroup?.items.map((i) => i.label)).toContain('Admin')
  })

  it('admin sub-categories split correctly when nav has admin/billing + admin/vision items', () => {
    const adminItems = [
      { label: 'Command Center', href: '/admin/command-center' },
      { label: 'Billing — Orgs', href: '/admin/billing/orgs' },
      { label: 'Vision Index',   href: '/admin/vision' },
      { label: 'Marketing CMS',  href: '/admin/content' },
    ]
    const groups = groupNavItemsByCategory(adminItems, 'admin')
    const groupMap = new Map(groups.map((g) => [g.category.id, g.items.map((i) => i.label)]))
    expect(groupMap.get('admin-console')).toContain('Command Center')
    expect(groupMap.get('admin-billing')).toContain('Billing — Orgs')
    expect(groupMap.get('admin-vision')).toContain('Vision Index')
    expect(groupMap.get('admin-content')).toContain('Marketing CMS')
  })

  it('skips empty categories', () => {
    const groups = groupNavItemsByCategory([{ label: 'Home', href: '/my-aircraft' }], 'owner')
    const ids = groups.map((g) => g.category.id)
    expect(ids).toContain('today')
    expect(ids).not.toContain('aircraft')
    expect(ids).not.toContain('operations')
  })
})

describe('navCategoriesStorageKey', () => {
  it('namespaces by user', () => {
    expect(navCategoriesStorageKey('user-1')).toBe('myaircraft_nav_categories_user-1')
    expect(navCategoriesStorageKey('user-2')).toBe('myaircraft_nav_categories_user-2')
  })
})
