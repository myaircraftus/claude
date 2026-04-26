import { NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { evaluateFaraimAccess } from '@/lib/faraim/entitlement'

export const runtime = 'nodejs'

const FARAIM_API_BASE = process.env.FARAIM_API_BASE ?? 'https://www.faraim.us'

function resolveApiKey(): string | null {
  const useSandbox =
    process.env.FARAIM_ENV === 'sandbox' || process.env.NODE_ENV !== 'production'
  if (useSandbox && process.env.FARAIM_SANDBOX_KEY) return process.env.FARAIM_SANDBOX_KEY
  return process.env.FARAIM_API_KEY ?? process.env.FARAIM_SANDBOX_KEY ?? null
}

export async function POST() {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const apiKey = resolveApiKey()
  if (!apiKey) {
    console.error('[faraim-session] FARAIM_API_KEY not configured')
    return NextResponse.json({ error: 'FAR/AIM is not configured' }, { status: 500 })
  }

  const { data: memberships } = await supabase
    .from('organization_memberships')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .limit(25)

  if (!memberships || memberships.length === 0) {
    return NextResponse.json({ error: 'No organization membership found' }, { status: 403 })
  }

  // Evaluate every membership and pick the most permissive entitlement so a
  // user who is paid/trial in one org can use FAR/AIM even while viewing
  // another org where they're free-tier.
  const evaluations = await Promise.all(
    memberships.map(async (m) => ({
      orgId: m.organization_id,
      access: await evaluateFaraimAccess(supabase, {
        userId: user.id,
        organizationId: m.organization_id,
      }),
    }))
  )
  const priority: Record<string, number> = {
    paid: 5,
    trial: 4,
    has_aircraft: 3,
    free_quota: 2,
    trial_expired_no_aircraft: 1,
    free_quota_exhausted: 0,
  }
  const best = evaluations.reduce((acc, cur) =>
    (priority[cur.access.reason] ?? -1) > (priority[acc.access.reason] ?? -1) ? cur : acc
  )
  const access = best.access

  if (!access.allowed) {
    return NextResponse.json(
      {
        error: access.message ?? 'FAR/AIM access not available',
        reason: access.reason,
        upgradeRequired: access.upgradeRequired ?? false,
      },
      { status: 402 }
    )
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('full_name, email')
    .eq('id', user.id)
    .single()

  let response: Response
  try {
    response = await fetch(`${FARAIM_API_BASE}/api/partner/v1/embed/session`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        studentId: user.id,
        studentEmail: profile?.email ?? user.email ?? undefined,
        studentName: profile?.full_name ?? undefined,
        sessionTtlSeconds: 28800,
      }),
    })
  } catch (err) {
    console.error('[faraim-session] network error', err)
    return NextResponse.json({ error: 'Could not start FAR/AIM session' }, { status: 502 })
  }

  const json = await response.json().catch(() => ({}))

  if (!response.ok || !(json as { success?: boolean }).success) {
    console.error('[faraim-session] upstream error', {
      status: response.status,
      requestId: (json as { requestId?: string }).requestId,
      code: (json as { error?: { code?: string } }).error?.code,
    })
    return NextResponse.json({ error: 'Could not start FAR/AIM session' }, { status: 502 })
  }

  const data = (json as { data: { embedUrls: { ask: string; questionBank?: string }; expiresAt: string } }).data

  // Increment quota counter only for free-tier users so paid/trial/aircraft
  // users don't accumulate noise.
  if (access.reason === 'free_quota') {
    const service = createServiceSupabase()
    await service.rpc('increment_faraim_session_count', { p_user_id: user.id }).catch(async () => {
      const { data: row } = await service
        .from('user_profiles')
        .select('faraim_session_count')
        .eq('id', user.id)
        .single()
      const current = (row as { faraim_session_count?: number } | null)?.faraim_session_count ?? 0
      await service
        .from('user_profiles')
        .update({
          faraim_session_count: current + 1,
          faraim_last_session_at: new Date().toISOString(),
        })
        .eq('id', user.id)
    })
  }

  return NextResponse.json({
    embedUrls: data.embedUrls,
    expiresAt: data.expiresAt,
    access: {
      reason: access.reason,
      remaining: access.remaining ?? null,
    },
  })
}
