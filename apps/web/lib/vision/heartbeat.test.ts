/**
 * Sprint 11.1 — heartbeat service tests.
 *
 * Verifies:
 *   - HeartbeatUpsertSchema accepts/rejects the expected payloads
 *   - upsertHeartbeat is idempotent (single row per worker_id)
 *   - getActiveWorkers respects maxAgeSeconds cutoff (uses .gte)
 *   - isWorkerAlive returns boolean correctly
 *   - countAvailableWorkers filters by status idle|busy
 *   - markWorkerStopping updates the right column
 *
 * Mocks the Supabase client; no DB.
 */
import { describe, it, expect, vi } from 'vitest'
import {
  upsertHeartbeat,
  getActiveWorkers,
  isWorkerAlive,
  countAvailableWorkers,
  markWorkerStopping,
  HeartbeatUpsertSchema,
} from './heartbeat'

// ─── Schema tests ─────────────────────────────────────────────────────

describe('HeartbeatUpsertSchema', () => {
  const valid = { worker_id: 'colab-abc12345', gpu_host: 'colab' as const }

  it('accepts a minimal payload', () => {
    expect(HeartbeatUpsertSchema.parse(valid)).toMatchObject(valid)
  })

  it('accepts the full set of allowed gpu_host values', () => {
    for (const host of ['colab', 'colab-pro', 'colab-a100', 'modal', 'modal-stub', 'replicate', 'runpod', 'stub'] as const) {
      expect(() => HeartbeatUpsertSchema.parse({ ...valid, gpu_host: host })).not.toThrow()
    }
  })

  it('rejects unknown gpu_host', () => {
    expect(() => HeartbeatUpsertSchema.parse({ ...valid, gpu_host: 'azure' as any })).toThrow()
  })

  it.each(['idle', 'busy', 'stopping'] as const)('accepts status=%s', (s) => {
    expect(HeartbeatUpsertSchema.parse({ ...valid, status: s }).status).toBe(s)
  })

  it('rejects unknown status', () => {
    expect(() => HeartbeatUpsertSchema.parse({ ...valid, status: 'magical' as any })).toThrow()
  })

  it('accepts null last_job_id', () => {
    expect(HeartbeatUpsertSchema.parse({ ...valid, last_job_id: null }).last_job_id).toBeNull()
  })

  it('rejects empty worker_id', () => {
    expect(() => HeartbeatUpsertSchema.parse({ ...valid, worker_id: '' })).toThrow()
  })

  it('rejects > 200 char worker_id', () => {
    expect(() => HeartbeatUpsertSchema.parse({ ...valid, worker_id: 'a'.repeat(201) })).toThrow()
  })

  it('rejects negative jobs_processed_total', () => {
    expect(() => HeartbeatUpsertSchema.parse({ ...valid, jobs_processed_total: -1 })).toThrow()
  })

  it('rejects > 4000 char last_error', () => {
    expect(() => HeartbeatUpsertSchema.parse({ ...valid, last_error: 'x'.repeat(4001) })).toThrow()
  })
})

// ─── Mock Supabase client ─────────────────────────────────────────────

interface CallLog {
  table: string
  ops: Array<{ method: string; args: unknown[] }>
}

function makeMockSupabase(opts: {
  selectResult?: { data: unknown; error: unknown; count?: number }
  upsertResult?: { data: unknown; error: unknown }
  updateResult?: { data: unknown; error: unknown }
} = {}) {
  const calls: CallLog[] = []

  function makeChain(table: string) {
    const log: CallLog = { table, ops: [] }
    calls.push(log)

    const chain: any = new Proxy({}, {
      get(_t, prop) {
        if (prop === 'then') {
          // Mutation methods take priority over read methods
          const methods = log.ops.map((o) => o.method)
          const fallback = { data: null, error: null, count: null }
          const result =
            methods.includes('upsert') ? opts.upsertResult ?? fallback :
            methods.includes('update') ? opts.updateResult ?? fallback :
            opts.selectResult ?? { data: [], error: null }
          return (resolve: (v: unknown) => void) => resolve(result)
        }
        return (...args: unknown[]) => {
          log.ops.push({ method: String(prop), args })
          return chain
        }
      },
    })

    return chain
  }

  return {
    client: { from: (table: string) => makeChain(table) } as any,
    calls,
  }
}

// ─── upsertHeartbeat ──────────────────────────────────────────────────

describe('upsertHeartbeat', () => {
  it('upserts on the worker_id unique index', async () => {
    const upserted = {
      id: '00000000-0000-0000-0000-000000000001',
      worker_id: 'colab-abc12345',
      gpu_host: 'colab',
      last_seen_at: new Date().toISOString(),
      status: 'idle',
      jobs_processed_total: 0,
      last_job_id: null,
      last_error: null,
      metadata: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    const { client, calls } = makeMockSupabase({
      upsertResult: { data: upserted, error: null },
    })

    const result = await upsertHeartbeat(client, {
      worker_id: 'colab-abc12345',
      gpu_host: 'colab',
    })

    expect(result.worker_id).toBe('colab-abc12345')
    const log = calls.find((c) => c.table === 'vision_worker_heartbeat')!
    const upsertCall = log.ops.find((o) => o.method === 'upsert')!
    const onConflict = upsertCall.args[1] as { onConflict: string }
    expect(onConflict.onConflict).toBe('worker_id')
  })

  it('idempotent: two calls with same worker_id hit the same upsert path', async () => {
    const { client, calls } = makeMockSupabase({
      upsertResult: { data: { worker_id: 'w1', gpu_host: 'colab', status: 'idle' }, error: null },
    })
    await upsertHeartbeat(client, { worker_id: 'w1', gpu_host: 'colab' })
    await upsertHeartbeat(client, { worker_id: 'w1', gpu_host: 'colab', status: 'busy' })
    const upsertCalls = calls
      .flatMap((c) => c.ops)
      .filter((o) => o.method === 'upsert')
    expect(upsertCalls.length).toBe(2)
  })

  it('throws on supabase error', async () => {
    const { client } = makeMockSupabase({
      upsertResult: { data: null, error: { message: 'rls denied' } },
    })
    await expect(
      upsertHeartbeat(client, { worker_id: 'w1', gpu_host: 'colab' }),
    ).rejects.toThrow(/rls denied/)
  })

  it('only sends fields the caller provided (omits undefined)', async () => {
    const { client, calls } = makeMockSupabase({
      upsertResult: { data: { worker_id: 'w1' }, error: null },
    })
    await upsertHeartbeat(client, {
      worker_id: 'w1',
      gpu_host: 'colab',
      // status, jobs_processed_total, etc. NOT supplied
    })
    const log = calls.find((c) => c.table === 'vision_worker_heartbeat')!
    const upsertCall = log.ops.find((o) => o.method === 'upsert')!
    const row = upsertCall.args[0] as Record<string, unknown>
    expect(row.worker_id).toBe('w1')
    expect(row.gpu_host).toBe('colab')
    expect(row.last_seen_at).toBeDefined()
    expect(row.status).toBeUndefined()
    expect(row.jobs_processed_total).toBeUndefined()
  })
})

// ─── getActiveWorkers ─────────────────────────────────────────────────

describe('getActiveWorkers', () => {
  it('filters with .gte on last_seen_at against now - maxAgeSeconds', async () => {
    const { client, calls } = makeMockSupabase({
      selectResult: { data: [], error: null },
    })
    await getActiveWorkers(client, 60)
    const log = calls.find((c) => c.table === 'vision_worker_heartbeat')!
    const gteCall = log.ops.find((o) => o.method === 'gte')!
    expect(gteCall.args[0]).toBe('last_seen_at')
    const cutoff = new Date(gteCall.args[1] as string)
    const expectedCutoff = new Date(Date.now() - 60_000)
    // Within 1s slack
    expect(Math.abs(cutoff.getTime() - expectedCutoff.getTime())).toBeLessThan(1000)
  })

  it('respects custom maxAgeSeconds', async () => {
    const { client, calls } = makeMockSupabase({
      selectResult: { data: [], error: null },
    })
    await getActiveWorkers(client, 300) // 5 min
    const log = calls.find((c) => c.table === 'vision_worker_heartbeat')!
    const gteCall = log.ops.find((o) => o.method === 'gte')!
    const cutoff = new Date(gteCall.args[1] as string)
    const expectedCutoff = new Date(Date.now() - 300_000)
    expect(Math.abs(cutoff.getTime() - expectedCutoff.getTime())).toBeLessThan(1000)
  })

  it('returns empty array when nothing is alive', async () => {
    const { client } = makeMockSupabase({
      selectResult: { data: [], error: null },
    })
    expect(await getActiveWorkers(client)).toEqual([])
  })

  it('throws on supabase error', async () => {
    const { client } = makeMockSupabase({
      selectResult: { data: null, error: { message: 'connection lost' } },
    })
    await expect(getActiveWorkers(client)).rejects.toThrow(/connection lost/)
  })
})

// ─── isWorkerAlive ────────────────────────────────────────────────────

describe('isWorkerAlive', () => {
  it('returns true when row found within window', async () => {
    const { client } = makeMockSupabase({
      selectResult: { data: { worker_id: 'w1' }, error: null },
    })
    expect(await isWorkerAlive(client, 'w1', 60)).toBe(true)
  })

  it('returns false when no row in window', async () => {
    const { client } = makeMockSupabase({
      selectResult: { data: null, error: null },
    })
    expect(await isWorkerAlive(client, 'w1', 60)).toBe(false)
  })

  it('passes worker_id through .eq filter', async () => {
    const { client, calls } = makeMockSupabase({
      selectResult: { data: null, error: null },
    })
    await isWorkerAlive(client, 'colab-test')
    const log = calls.find((c) => c.table === 'vision_worker_heartbeat')!
    const eqCall = log.ops.find((o) => o.method === 'eq')!
    expect(eqCall.args).toEqual(['worker_id', 'colab-test'])
  })
})

// ─── countAvailableWorkers ────────────────────────────────────────────

describe('countAvailableWorkers', () => {
  it('returns the count from supabase head:true query', async () => {
    const { client } = makeMockSupabase({
      selectResult: { data: null, error: null, count: 3 },
    })
    expect(await countAvailableWorkers(client)).toBe(3)
  })

  it('filters status to idle|busy', async () => {
    const { client, calls } = makeMockSupabase({
      selectResult: { data: null, error: null, count: 0 },
    })
    await countAvailableWorkers(client, 60)
    const log = calls.find((c) => c.table === 'vision_worker_heartbeat')!
    const inCall = log.ops.find((o) => o.method === 'in')!
    expect(inCall.args[0]).toBe('status')
    expect(inCall.args[1]).toEqual(['idle', 'busy'])
  })

  it('returns 0 when no workers', async () => {
    const { client } = makeMockSupabase({
      selectResult: { data: null, error: null, count: 0 },
    })
    expect(await countAvailableWorkers(client)).toBe(0)
  })
})

// ─── markWorkerStopping ───────────────────────────────────────────────

describe('markWorkerStopping', () => {
  it('updates status=stopping for the worker_id', async () => {
    const { client, calls } = makeMockSupabase({
      updateResult: { data: null, error: null },
    })
    await markWorkerStopping(client, 'colab-shutting-down')
    const log = calls.find((c) => c.table === 'vision_worker_heartbeat')!
    const updateCall = log.ops.find((o) => o.method === 'update')!
    expect(updateCall.args[0]).toEqual({ status: 'stopping' })
    const eqCall = log.ops.find((o) => o.method === 'eq')!
    expect(eqCall.args).toEqual(['worker_id', 'colab-shutting-down'])
  })

  it('throws on supabase error', async () => {
    const { client } = makeMockSupabase({
      updateResult: { data: null, error: { message: 'no row' } },
    })
    await expect(markWorkerStopping(client, 'w1')).rejects.toThrow(/no row/)
  })
})
