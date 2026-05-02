'use client'

/**
 * useOrg() — client hook returning the active org + the user's other
 * memberships, plus a switcher that POSTs the active-org change to
 * /api/me/active-org and reloads. Required by Spec 0.1 hard rule #7.
 *
 * Data is fetched lazily on first mount and revalidated on focus.
 */

import { useCallback, useEffect, useState } from 'react'
import type { Organization, OrganizationMembership } from '@/types'

export interface OrgContextPayload {
  /** The org the user is currently viewing. */
  active: Pick<Organization, 'id' | 'name' | 'slug' | 'org_type' | 'home_base'> | null
  /** Active membership row (role + persona for the active org). */
  activeMembership: OrganizationMembership | null
  /** Every accepted membership the user has — drives the switcher. */
  memberships: Array<{
    membership: OrganizationMembership
    organization: Pick<Organization, 'id' | 'name' | 'slug' | 'org_type' | 'home_base'>
  }>
  loading: boolean
  error: string | null
  /** Switch active org. Sets the cookie via API + soft-reloads the page. */
  switchOrg: (organizationId: string) => Promise<void>
  refresh: () => Promise<void>
}

export function useOrg(): OrgContextPayload {
  const [state, setState] = useState<{
    active: OrgContextPayload['active']
    activeMembership: OrganizationMembership | null
    memberships: OrgContextPayload['memberships']
    loading: boolean
    error: string | null
  }>({
    active: null,
    activeMembership: null,
    memberships: [],
    loading: true,
    error: null,
  })

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/me/orgs', { cache: 'no-store' })
      if (!res.ok) {
        setState((s) => ({ ...s, loading: false, error: `HTTP ${res.status}` }))
        return
      }
      const json = (await res.json()) as {
        active_organization_id: string | null
        memberships: OrgContextPayload['memberships']
      }
      const active = json.memberships.find((m) => m.organization.id === json.active_organization_id)?.organization ?? null
      const activeMembership = json.memberships.find((m) => m.organization.id === json.active_organization_id)?.membership ?? null
      setState({
        active,
        activeMembership,
        memberships: json.memberships,
        loading: false,
        error: null,
      })
    } catch (err: any) {
      setState((s) => ({ ...s, loading: false, error: String(err?.message ?? err) }))
    }
  }, [])

  useEffect(() => {
    refresh()
    function onFocus() { refresh() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refresh])

  const switchOrg = useCallback(async (organizationId: string) => {
    const res = await fetch('/api/me/active-org', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ organization_id: organizationId }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      throw new Error(body?.error || `Could not switch org (HTTP ${res.status})`)
    }
    // Hard reload — cookie change needs server re-render to take effect.
    window.location.assign('/dashboard')
  }, [])

  return { ...state, switchOrg, refresh }
}
