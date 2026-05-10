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
  it('maps /admin/* → organization', () => {
    expect(categoryForHref('/admin')).toBe('organization')
    expect(categoryForHref('/admin/vision/workers')).toBe('organization')
    expect(categoryForHref('/admin/errors')).toBe('organization')
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
    expect(ids).not.toContain('organization')
    expect(ids).not.toContain('workforce')
    expect(ids).not.toContain('customer')
    expect(ids).not.toContain('commercial')
  })

  it('mechanic sees workforce + operations + ai but NOT economics or organization', () => {
    const ids = categoriesForPersona('mechanic').map((c) => c.id)
    expect(ids).toContain('workforce')
    expect(ids).toContain('operations')
    expect(ids).not.toContain('economics')
    expect(ids).not.toContain('organization')
    expect(ids).not.toContain('customer')
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
    // owner doesn't see organization, so /admin is filtered out entirely
    expect(groupMap.get('organization')).toBeUndefined()
  })

  it('admin sees /admin under organization category', () => {
    const groups = groupNavItemsByCategory(items, 'admin')
    const orgGroup = groups.find((g) => g.category.id === 'organization')
    expect(orgGroup?.items.map((i) => i.label)).toContain('Admin')
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
