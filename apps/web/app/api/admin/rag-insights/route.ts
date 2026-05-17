/**
 * GET /api/admin/rag-insights
 *
 * Admin-only insights endpoint for the RAG query feedback loop. Aggregates the
 * last 30 days of rag_query_log rows for the caller's organization into:
 *   - by_strategy: per-strategy { count, avg_chunk_count, avg_duration_ms }
 *   - zero_chunk_queries: count of rows that retrieved 0 chunks (failed lookups)
 *   - total_queries: total rows in the window
 *
 * Persona-gated to 'admin'. Other personas get a 403. Never crashes on empty
 * data — returns zeros / an empty object cleanly.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getCurrentPersona } from '@/lib/persona/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServiceSupabase } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

interface StrategyAggregate {
  count: number
  avg_chunk_count: number
  avg_duration_ms: number
}

export async function GET(req: NextRequest) {
  // --- Auth + persona gate --------------------------------------------------
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let persona: string
  try {
    ;({ persona } = await getCurrentPersona())
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (persona !== 'admin') {
    return NextResponse.json(
      { error: 'Forbidden — admin persona required' },
      { status: 403 },
    )
  }

  // --- Query the last 30 days of feedback rows for this org -----------------
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const supabase = createServiceSupabase()

  const { data, error } = await supabase
    .from('rag_query_log')
    .select('strategy, chunk_count, duration_ms')
    .eq('org_id', ctx.organizationId)
    .gte('created_at', since)
    .limit(50000)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (data ?? []) as Array<{
    strategy: string | null
    chunk_count: number | null
    duration_ms: number | null
  }>

  // --- Aggregate ------------------------------------------------------------
  const totals = new Map<string, { count: number; chunkSum: number; durationSum: number }>()
  let zeroChunkQueries = 0

  for (const row of rows) {
    const strategy = row.strategy ?? 'unknown'
    const chunkCount = typeof row.chunk_count === 'number' ? row.chunk_count : 0
    const durationMs = typeof row.duration_ms === 'number' ? row.duration_ms : 0

    if (chunkCount === 0) zeroChunkQueries += 1

    const bucket = totals.get(strategy) ?? { count: 0, chunkSum: 0, durationSum: 0 }
    bucket.count += 1
    bucket.chunkSum += chunkCount
    bucket.durationSum += durationMs
    totals.set(strategy, bucket)
  }

  const byStrategy: Record<string, StrategyAggregate> = {}
  for (const [strategy, bucket] of totals) {
    byStrategy[strategy] = {
      count: bucket.count,
      avg_chunk_count: bucket.count > 0 ? bucket.chunkSum / bucket.count : 0,
      avg_duration_ms: bucket.count > 0 ? bucket.durationSum / bucket.count : 0,
    }
  }

  return NextResponse.json({
    by_strategy: byStrategy,
    zero_chunk_queries: zeroChunkQueries,
    total_queries: rows.length,
  })
}
