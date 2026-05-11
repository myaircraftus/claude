/**
 * Phase 18 Sprint 18.4 — route-guard tests.
 *
 * The actual guard helpers call getCurrentPersona() + cookies(), both
 * of which require a Next request context. We test the *decision logic*
 * via a thin shim: each test substitutes the resolver with a controlled
 * value and checks the allow/redirect output.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { PERSONA_CONFIG } from './config'
import type { Persona } from '@/types'

// Stub the imports the module under test uses. We mock next/headers
// (cookies) and the server persona resolver, then re-import the SUT.
vi.mock('next/headers', () => ({
  cookies: () => ({
    get: (_name: string) => mockCookies.get(_name) ? { value: mockCookies.get(_name)! } : undefined,
  }),
}))
vi.mock('./server', () => ({
  getCurrentPersona: async () => ({ persona: mockTruePersona }),
}))

const mockCookies = new Map<string, string>()
let mockTruePersona: Persona = 'owner'

// Re-import after mocks are set so the module reads them.
import { requirePersona, getEffectivePersona, VIEW_AS_COOKIE } from './route-guard'

beforeEach(() => {
  mockCookies.clear()
  mockTruePersona = 'owner'
})

describe('getEffectivePersona', () => {
  it('returns the true persona when no view-as cookie is set', async () => {
    mockTruePersona = 'shop'
    const r = await getEffectivePersona()
    expect(r.effectivePersona).toBe('shop')
    expect(r.truePersona).toBe('shop')
    expect(r.viewAs).toBe(false)
  })

  it('ignores view-as cookie for non-admin users (admins only can view-as)', async () => {
    mockTruePersona = 'shop'
    mockCookies.set(VIEW_AS_COOKIE, 'owner')
    const r = await getEffectivePersona()
    expect(r.effectivePersona).toBe('shop')
    expect(r.viewAs).toBe(false)
  })

  it('honors view-as cookie when true persona is admin', async () => {
    mockTruePersona = 'admin'
    mockCookies.set(VIEW_AS_COOKIE, 'shop')
    const r = await getEffectivePersona()
    expect(r.effectivePersona).toBe('shop')
    expect(r.viewAs).toBe(true)
    expect(r.truePersona).toBe('admin')
  })

  it('ignores a view-as cookie of "admin" (no-op self-view)', async () => {
    mockTruePersona = 'admin'
    mockCookies.set(VIEW_AS_COOKIE, 'admin')
    const r = await getEffectivePersona()
    expect(r.effectivePersona).toBe('admin')
    expect(r.viewAs).toBe(false)
  })

  it('ignores a malformed view-as cookie', async () => {
    mockTruePersona = 'admin'
    mockCookies.set(VIEW_AS_COOKIE, 'pilot')
    const r = await getEffectivePersona()
    expect(r.effectivePersona).toBe('admin')
    expect(r.viewAs).toBe(false)
  })
})

describe('requirePersona', () => {
  it('allows owner on owner-restricted routes', async () => {
    mockTruePersona = 'owner'
    const r = await requirePersona(['owner', 'admin'])
    expect(r.allowed).toBe(true)
    expect(r.redirectTo).toBeUndefined()
  })

  it('redirects shop trying to access owner-only route → /workflow', async () => {
    mockTruePersona = 'shop'
    const r = await requirePersona(['owner', 'admin'])
    expect(r.allowed).toBe(false)
    expect(r.redirectTo).toBe(PERSONA_CONFIG.shop.homeRoute) // /workflow
  })

  it('redirects owner trying to access shop-only route → /my-aircraft', async () => {
    mockTruePersona = 'owner'
    const r = await requirePersona(['shop', 'admin'])
    expect(r.allowed).toBe(false)
    expect(r.redirectTo).toBe(PERSONA_CONFIG.owner.homeRoute) // /my-aircraft
  })

  it('admin can access any persona-restricted route', async () => {
    mockTruePersona = 'admin'
    expect((await requirePersona(['owner', 'admin'])).allowed).toBe(true)
    expect((await requirePersona(['shop', 'admin'])).allowed).toBe(true)
    expect((await requirePersona(['admin'])).allowed).toBe(true)
  })

  it('non-admin redirected from admin-only route → their home', async () => {
    mockTruePersona = 'owner'
    const r = await requirePersona(['admin'])
    expect(r.allowed).toBe(false)
    expect(r.redirectTo).toBe(PERSONA_CONFIG.owner.homeRoute)
  })

  it('admin with view-as=owner is treated as owner — cannot access shop-only', async () => {
    // Closes F2: even admin-view-as should be persona-scoped server-side.
    mockTruePersona = 'admin'
    mockCookies.set(VIEW_AS_COOKIE, 'owner')
    const r = await requirePersona(['shop', 'admin'])
    expect(r.allowed).toBe(false)
    expect(r.redirectTo).toBe(PERSONA_CONFIG.owner.homeRoute)
  })

  it('admin with view-as=owner CAN still access owner-only routes', async () => {
    mockTruePersona = 'admin'
    mockCookies.set(VIEW_AS_COOKIE, 'owner')
    const r = await requirePersona(['owner', 'admin'])
    expect(r.allowed).toBe(true)
    expect(r.viewAs).toBe(true)
  })
})
