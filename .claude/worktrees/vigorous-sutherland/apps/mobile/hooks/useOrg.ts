import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

interface Org {
  id: string
  name: string
  slug: string
  plan: string
  plan_aircraft_limit: number
  plan_queries_monthly: number
  queries_used_this_month: number
}

interface OrgState {
  org: Org | null
  orgId: string | null
  role: string | null
  loading: boolean
}

export function useOrg(userId: string | undefined): OrgState {
  const [state, setState] = useState<OrgState>({ org: null, orgId: null, role: null, loading: true })

  useEffect(() => {
    if (!userId) {
      setState({ org: null, orgId: null, role: null, loading: false })
      return
    }

    supabase
      .from('organization_memberships')
      .select('organization_id, role, organizations(*)')
      .eq('user_id', userId)
      .not('accepted_at', 'is', null)
      .single()
      .then(({ data }) => {
        if (data) {
          setState({
            org: (data as any).organizations as Org,
            orgId: data.organization_id,
            role: data.role,
            loading: false,
          })
        } else {
          setState({ org: null, orgId: null, role: null, loading: false })
        }
      })
  }, [userId])

  return state
}
