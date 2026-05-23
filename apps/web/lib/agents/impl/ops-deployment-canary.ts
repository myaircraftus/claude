/**
 * ops.deployment-canary
 *
 * Every 5 minutes: HTTP-probes a small set of public endpoints and
 * verifies they return the expected status code. Emits a
 * 'deployment_canary_failed' recommendation on any probe failure.
 *
 *   Probes:
 *     GET  /api/health          → 200
 *     GET  /api/ping            → 200
 *     GET  /api/integrations/registry → 200 (with auth header) optional
 *
 * No auto-rollback — recommendation only. The founder decides whether
 * to redeploy / promote a previous build.
 *
 * Uses process.env.PUBLIC_APP_ORIGIN (e.g. https://myaircraft.us) to
 * find the production host. If unset, we no-op cleanly.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { runAgent } from '../runner'

interface ProbeResult {
  path: string
  status: number | null
  ok: boolean
  latency_ms: number
  error: string | null
}

export interface CanaryReport {
  origin: string
  probe_count: number
  ok_count: number
  fail_count: number
  probes: ProbeResult[]
}

const PROBES = [
  { path: '/api/health', expect: 200 },
  { path: '/api/ping', expect: 200 },
] as const

export async function runDeploymentCanary(args: {
  supabase: SupabaseClient
  /** Override origin for staging probes. */
  origin?: string
}): Promise<{ ok: boolean; output?: CanaryReport; runId?: string; error?: string }> {
  const origin = args.origin ?? process.env.PUBLIC_APP_ORIGIN ?? ''
  return runAgent<CanaryReport>(
    'ops.deployment-canary',
    {
      supabase: args.supabase,
      input: { origin, probe_count: PROBES.length },
    },
    async () => {
      if (!origin) {
        return {
          output: {
            origin: '',
            probe_count: 0,
            ok_count: 0,
            fail_count: 0,
            probes: [],
          },
          recommendation: { kind: 'canary_not_configured' },
        }
      }
      const probes: ProbeResult[] = []
      for (const p of PROBES) {
        const t0 = Date.now()
        try {
          const res = await fetch(`${origin}${p.path}`, {
            method: 'GET',
            signal: AbortSignal.timeout(4500),
            headers: { 'user-agent': 'myaircraft-canary/1' },
          })
          probes.push({
            path: p.path,
            status: res.status,
            ok: res.status === p.expect,
            latency_ms: Date.now() - t0,
            error: null,
          })
        } catch (err) {
          probes.push({
            path: p.path,
            status: null,
            ok: false,
            latency_ms: Date.now() - t0,
            error: (err as Error).message.slice(0, 200),
          })
        }
      }
      const fails = probes.filter((p) => !p.ok)
      return {
        output: {
          origin,
          probe_count: probes.length,
          ok_count: probes.length - fails.length,
          fail_count: fails.length,
          probes,
        },
        needsHuman: fails.length > 0,
        recommendation:
          fails.length > 0
            ? {
                kind: 'deployment_canary_failed',
                origin,
                fail_count: fails.length,
                probes: fails,
              }
            : null,
      }
    },
  )
}
