/**
 * Phase 14 Sprint 14.5 — admin billing orgs route auth tests.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: vi.fn(),
  createServiceSupabase: vi.fn(),
}))
vi.mock('@/lib/billing/tier-service', () => ({
  listOrgsByTier: vi.fn(),
}))

import { GET } from './route'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { listOrgsByTier } from '@/lib/billing/tier-service'

function mockSb(opts: { user: { id: string } | null; isAdmin?: boolean }) {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: opts.user } }) },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { is_platform_admin: opts.isAdmin ?? false },
      }),
    }),
  } as any
}

beforeEach(() => {
  vi.clearAllMocks()
})

function makeReq(qs = '') {
  return new Request(`http://localhost/api/admin/billing/orgs${qs}`) as any
}

describe('GET /api/admin/billing/orgs', () => {
  it('401 anon', async () => {
    ;(createServerSupabase as any).mockReturnValue(mockSb({ user: null }))
    const res = await GET(makeReq())
    expect(res.status).toBe(401)
  })
  it('403 non-admin', async () => {
    ;(createServerSupabase as any).mockReturnValue(
      mockSb({ user: { id: 'u' }, isAdmin: false }),
    )
    const res = await GET(makeReq())
    expect(res.status).toBe(403)
  })
  it('200 admin returns rows with monthly_price_usd', async () => {
    ;(createServerSupabase as any).mockReturnValue(
      mockSb({ user: { id: 'u' }, isAdmin: true }),
    )
    ;(createServiceSupabase as any).mockReturnValue({} as any)
    ;(listOrgsByTier as any).mockResolvedValue([
      {
        id: 'o1',
        name: 'Alpha',
        tier: 'pro',
        tier_billing_disabled: false,
        tier_effective_from: null,
        aircraft_count: 5,
      },
      {
        id: 'o2',
        name: 'Beta Org',
        tier: 'beta',
        tier_billing_disabled: true,
        tier_effective_from: null,
        aircraft_count: 3,
      },
    ])
    const res = await GET(makeReq())
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.rows).toHaveLength(2)
    // Pro × 5 aircraft = 5 × $149 = $745
    expect(body.rows[0].monthly_price_usd).toBe(745)
    // Beta org tier_billing_disabled = true → $0
    expect(body.rows[1].monthly_price_usd).toBe(0)
  })
  it('honors ?tier= filter', async () => {
    ;(createServerSupabase as any).mockReturnValue(
      mockSb({ user: { id: 'u' }, isAdmin: true }),
    )
    ;(createServiceSupabase as any).mockReturnValue({} as any)
    ;(listOrgsByTier as any).mockResolvedValue([])
    await GET(makeReq('?tier=standard'))
    expect(listOrgsByTier).toHaveBeenCalledWith(expect.anything(), {
      tier: 'standard',
    })
  })
  it('ignores invalid ?tier value', async () => {
    ;(createServerSupabase as any).mockReturnValue(
      mockSb({ user: { id: 'u' }, isAdmin: true }),
    )
    ;(createServiceSupabase as any).mockReturnValue({} as any)
    ;(listOrgsByTier as any).mockResolvedValue([])
    await GET(makeReq('?tier=enterprise'))
    expect(listOrgsByTier).toHaveBeenCalledWith(expect.anything(), {})
  })
})
