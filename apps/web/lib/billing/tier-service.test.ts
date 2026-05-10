/**
 * Phase 14 Sprint 14.2 — tier-service tests.
 *
 * Mocks the supabase client to verify:
 *   - getOrgTier honors kill-switch (tier_billing_disabled → beta)
 *   - getAircraftTier honors override + still respects org kill-switch
 *   - changeOrgTier writes both UPDATE + tier_history INSERT atomically
 *   - listOrgsByTier batches aircraft counts in a single query
 */
import { describe, it, expect, vi } from 'vitest'
import {
  getOrgTier,
  getOrgTierState,
  getAircraftTier,
  changeOrgTier,
  listOrgsByTier,
  setAircraftTierOverride,
} from './tier-service'

function mockSupabase(opts: {
  orgRow?: any | null
  aircraftRow?: any | null
  orgListRows?: any[]
  aircraftListRows?: any[]
  tierHistoryInsertResult?: any
  updateError?: any
}) {
  const calls: { table: string; method: string; args: any[] }[] = []

  function makeChain(table: string) {
    /** Track which terminal op was invoked on this chain instance. */
    const ops: string[] = []

    const chain: any = new Proxy({}, {
      get(_t, prop) {
        const name = String(prop)
        if (name === 'then') {
          // Resolution depends on which terminal op was invoked.
          if (ops.includes('update')) {
            return (resolve: any) =>
              resolve({ data: null, error: opts.updateError ?? null })
          }
          // Default: SELECT path → list rows for the table
          if (table === 'organizations') {
            return (resolve: any) => resolve({ data: opts.orgListRows ?? [], error: null })
          }
          if (table === 'aircraft') {
            return (resolve: any) => resolve({ data: opts.aircraftListRows ?? [], error: null })
          }
          return (resolve: any) => resolve({ data: [], error: null })
        }
        if (name === 'maybeSingle') {
          return () => {
            ops.push('maybeSingle')
            if (table === 'organizations') return Promise.resolve({ data: opts.orgRow, error: null })
            if (table === 'aircraft') return Promise.resolve({ data: opts.aircraftRow, error: null })
            return Promise.resolve({ data: null, error: null })
          }
        }
        if (name === 'single') {
          return () => {
            ops.push('single')
            if (table === 'tier_history') {
              return Promise.resolve(
                opts.tierHistoryInsertResult ?? { data: { id: 'hist-1' }, error: null },
              )
            }
            return Promise.resolve({ data: null, error: null })
          }
        }
        return (...args: any[]) => {
          ops.push(name)
          calls.push({ table, method: name, args })
          return chain
        }
      },
    })

    return chain
  }

  const supabase = { from: (table: string) => makeChain(table) } as any
  return { supabase, calls }
}

describe('getOrgTierState', () => {
  it('returns beta for missing row (fail-safe default)', async () => {
    const { supabase } = mockSupabase({ orgRow: null })
    const r = await getOrgTierState(supabase, 'org-1')
    expect(r).toEqual({ tier: 'beta', tier_billing_disabled: true, tier_effective_from: null })
  })

  it('coerces unknown tier values to beta', async () => {
    const { supabase } = mockSupabase({
      orgRow: { tier: 'enterprise', tier_billing_disabled: false, tier_effective_from: null },
    })
    const r = await getOrgTierState(supabase, 'org-1')
    expect(r.tier).toBe('beta')
  })

  it('passes through the row as-is when valid', async () => {
    const { supabase } = mockSupabase({
      orgRow: { tier: 'pro', tier_billing_disabled: false, tier_effective_from: '2026-05-09' },
    })
    const r = await getOrgTierState(supabase, 'org-1')
    expect(r).toEqual({ tier: 'pro', tier_billing_disabled: false, tier_effective_from: '2026-05-09' })
  })
})

describe('getOrgTier — applies the kill-switch', () => {
  it('Pro org with billing enabled → pro', async () => {
    const { supabase } = mockSupabase({
      orgRow: { tier: 'pro', tier_billing_disabled: false, tier_effective_from: null },
    })
    expect(await getOrgTier(supabase, 'o1')).toBe('pro')
  })
  it('Pro org with billing DISABLED → beta', async () => {
    const { supabase } = mockSupabase({
      orgRow: { tier: 'pro', tier_billing_disabled: true, tier_effective_from: null },
    })
    expect(await getOrgTier(supabase, 'o1')).toBe('beta')
  })
  it('Standard org with billing enabled → standard', async () => {
    const { supabase } = mockSupabase({
      orgRow: { tier: 'standard', tier_billing_disabled: false, tier_effective_from: null },
    })
    expect(await getOrgTier(supabase, 'o1')).toBe('standard')
  })
})

describe('getAircraftTier — override + kill-switch interplay', () => {
  it('No override → defers to org tier (Standard)', async () => {
    const { supabase } = mockSupabase({
      aircraftRow: { tier_override: null, organization_id: 'o1' },
      orgRow: { tier: 'standard', tier_billing_disabled: false, tier_effective_from: null },
    })
    expect(await getAircraftTier(supabase, 'ac-1')).toBe('standard')
  })

  it("override='pro' on Standard org → pro", async () => {
    const { supabase } = mockSupabase({
      aircraftRow: { tier_override: 'pro', organization_id: 'o1' },
      orgRow: { tier: 'standard', tier_billing_disabled: false, tier_effective_from: null },
    })
    expect(await getAircraftTier(supabase, 'ac-1')).toBe('pro')
  })

  it("override='pro' but org billing DISABLED → beta (kill-switch wins)", async () => {
    const { supabase } = mockSupabase({
      aircraftRow: { tier_override: 'pro', organization_id: 'o1' },
      orgRow: { tier: 'standard', tier_billing_disabled: true, tier_effective_from: null },
    })
    expect(await getAircraftTier(supabase, 'ac-1')).toBe('beta')
  })

  it('Aircraft not found → beta (fail-safe)', async () => {
    const { supabase } = mockSupabase({ aircraftRow: null })
    expect(await getAircraftTier(supabase, 'ac-missing')).toBe('beta')
  })
})

describe('changeOrgTier — atomic update + history insert', () => {
  it('writes the tier_history row with from_tier from current state', async () => {
    const { supabase, calls } = mockSupabase({
      orgRow: { tier: 'beta', tier_billing_disabled: true, tier_effective_from: null },
      tierHistoryInsertResult: { data: { id: 'hist-X' }, error: null },
    })
    const r = await changeOrgTier(supabase, {
      orgId: 'o1',
      newTier: 'pro',
      changedByUserId: 'u1',
      reason: 'upgrade',
      setBillingDisabled: false,
    })
    expect(r).toEqual({ from: 'beta', to: 'pro', historyId: 'hist-X' })
    // Verify update payload included the right keys
    const upd = calls.find((c) => c.table === 'organizations' && c.method === 'update')
    expect(upd?.args[0]).toMatchObject({
      tier: 'pro',
      tier_billing_disabled: false,
    })
    // Verify history insert payload
    const hist = calls.find((c) => c.table === 'tier_history' && c.method === 'insert')
    expect(hist?.args[0]).toMatchObject({
      organization_id: 'o1',
      from_tier: 'beta',
      to_tier: 'pro',
      changed_by_user_id: 'u1',
      reason: 'upgrade',
    })
  })

  it('throws when the org update returns an error', async () => {
    const { supabase } = mockSupabase({
      orgRow: { tier: 'beta', tier_billing_disabled: true, tier_effective_from: null },
      updateError: { message: 'permission denied' },
    })
    await expect(
      changeOrgTier(supabase, { orgId: 'o1', newTier: 'pro', changedByUserId: 'u1' }),
    ).rejects.toThrow(/org update failed/)
  })
})

describe('setAircraftTierOverride', () => {
  it('writes the override value', async () => {
    const { supabase, calls } = mockSupabase({})
    await setAircraftTierOverride(supabase, 'ac-1', 'pro')
    const upd = calls.find((c) => c.table === 'aircraft' && c.method === 'update')
    expect(upd?.args[0]).toEqual({ tier_override: 'pro' })
  })
  it('null clears the override', async () => {
    const { supabase, calls } = mockSupabase({})
    await setAircraftTierOverride(supabase, 'ac-1', null)
    const upd = calls.find((c) => c.table === 'aircraft' && c.method === 'update')
    expect(upd?.args[0]).toEqual({ tier_override: null })
  })
})

describe('listOrgsByTier — joins aircraft counts', () => {
  it('returns rows with aircraft_count populated from the second query', async () => {
    const { supabase } = mockSupabase({
      orgListRows: [
        { id: 'o1', name: 'Alpha', tier: 'pro', tier_billing_disabled: false, tier_effective_from: null },
        { id: 'o2', name: 'Beta', tier: 'standard', tier_billing_disabled: false, tier_effective_from: null },
      ],
      aircraftListRows: [
        { organization_id: 'o1' },
        { organization_id: 'o1' },
        { organization_id: 'o1' },
        { organization_id: 'o2' },
      ],
    })
    const rows = await listOrgsByTier(supabase, {})
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ id: 'o1', tier: 'pro', aircraft_count: 3 })
    expect(rows[1]).toMatchObject({ id: 'o2', tier: 'standard', aircraft_count: 1 })
  })

  it('empty input returns empty', async () => {
    const { supabase } = mockSupabase({ orgListRows: [] })
    const rows = await listOrgsByTier(supabase, {})
    expect(rows).toEqual([])
  })
})
