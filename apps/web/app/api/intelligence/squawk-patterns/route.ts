/**
 * POST /api/intelligence/squawk-patterns — Recurring Squawk Patterns module
 * of the Aircraft Intelligence Suite.
 *
 * Analyzes this aircraft's squawk history to surface problems that keep
 * coming back. Squawks are pulled directly from the `squawks` table, then
 * an AI call clusters them by similarity (e.g. "oil pressure", "left
 * brake"). Each cluster ≥2 occurrences is scored for frequency, open/
 * resolved split, reopen cycles, and recurrence cadence, and corroborated
 * against the maintenance logs via RAG. Owner-only — the shop persona is
 * blocked. Results are cached for 24h; pass `regenerate: true` to bypass.
 */
import { NextResponse, type NextRequest } from 'next/server'
import OpenAI from 'openai'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { getCurrentPersona } from '@/lib/persona/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { runIntelligenceQuery } from '@/lib/rag/intelligence-query'
import { readIntelligenceCache, writeIntelligenceCache } from '@/lib/intelligence/cache'
import type { IntelligenceCitation, IntelligenceReport } from '@/lib/intelligence/types'

export const dynamic = 'force-dynamic'

const A_AND_P_NOTICE = 'Consult a licensed A&P mechanic before performing any maintenance.'

/** A raw squawk row pulled from the `squawks` table. */
interface SquawkRow {
  id: string
  title: string | null
  description: string | null
  status: string | null
  severity: string | null
  created_at: string | null
  resolved_at: string | null
}

/** One recurring-problem cluster in the report payload. */
interface SquawkCluster {
  label: string
  count: number
  date_range: { first: string | null; last: string | null }
  last_occurrence: string | null
  open_count: number
  resolved_count: number
  reopen_count: number
  avg_days_between: number | null
  trend: 'more_frequent' | 'less_frequent' | 'steady' | 'insufficient'
  log_mentions: number
  recommendation: string
  citations: IntelligenceCitation[]
}

/** Module-specific `data` payload of the squawk-patterns IntelligenceReport. */
interface SquawkPatternsData {
  empty?: boolean
  clusters: SquawkCluster[]
  total_squawks: number
  log_corroboration?: { text: string; citations: IntelligenceCitation[] }
}

/** Statuses that count a squawk as "resolved/closed" rather than open. */
const CLOSED_STATUSES = new Set(['resolved', 'closed', 'verified', 'complete', 'completed'])

export async function POST(req: NextRequest) {
  // --- Auth: org context + owner-only persona gate -------------------------
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { organizationId } = ctx

  try {
    const { persona } = await getCurrentPersona()
    if (persona === 'shop') {
      return NextResponse.json(
        { error: 'Aircraft Intelligence is owner-only.' },
        { status: 403 },
      )
    }
  } catch {
    // defensive — resolveRequestOrgContext already proved a session
  }

  // --- Body ----------------------------------------------------------------
  let body: { aircraft_id?: unknown; regenerate?: unknown } = {}
  try {
    body = await req.json()
  } catch {
    body = {}
  }
  const aircraftId = typeof body.aircraft_id === 'string' ? body.aircraft_id : ''
  const regenerate = body.regenerate === true
  if (!aircraftId) {
    return NextResponse.json({ error: 'aircraft_id is required' }, { status: 400 })
  }

  const supabase = createServiceSupabase()

  // --- Verify the aircraft belongs to this org ----------------------------
  const { data: aircraft } = await supabase
    .from('aircraft')
    .select('id')
    .eq('id', aircraftId)
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (!aircraft) {
    return NextResponse.json({ error: 'Aircraft not found' }, { status: 404 })
  }

  // --- Cache hit -----------------------------------------------------------
  if (!regenerate) {
    const cached = await readIntelligenceCache(supabase, aircraftId, 'squawk-patterns')
    if (cached) {
      return NextResponse.json({ ...cached.result_json, cached: true })
    }
  }

  // --- Pull squawk history (direct query) ---------------------------------
  const { data: squawkData } = await supabase
    .from('squawks')
    .select('id, title, description, status, severity, created_at, resolved_at')
    .eq('aircraft_id', aircraftId)
    .order('created_at', { ascending: true })

  const squawks: SquawkRow[] = ((squawkData as Array<Record<string, any>>) ?? []).map((s) => ({
    id: String(s.id),
    title: s.title ?? null,
    description: s.description ?? null,
    status: s.status ?? null,
    severity: s.severity ?? null,
    created_at: s.created_at ?? null,
    resolved_at: s.resolved_at ?? null,
  }))

  // --- Empty state: no squawks --------------------------------------------
  if (squawks.length === 0) {
    const emptyReport: IntelligenceReport<SquawkPatternsData> = {
      module: 'squawk-patterns',
      aircraft_id: aircraftId,
      generated_at: new Date().toISOString(),
      data: { empty: true, clusters: [], total_squawks: 0 },
      cached: false,
    }
    return NextResponse.json(emptyReport)
  }

  // --- AI clustering: group squawks by similarity -------------------------
  const byId = new Map(squawks.map((s) => [s.id, s]))
  let clusterDefs: Array<{ label: string; squawk_ids: string[]; recommendation?: string }> = []

  if (process.env.OPENAI_API_KEY) {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 30000, maxRetries: 1 })
    const squawkList = squawks
      .map((s) => {
        const text = [s.title, s.description].filter(Boolean).join(' — ').slice(0, 300)
        return `${s.id}\t${text || 'Untitled squawk'}`
      })
      .join('\n')

    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You are an aircraft maintenance analyst. You are given a list of squawks ' +
              '(discrepancies/complaints) for one aircraft. Cluster them by the underlying ' +
              'mechanical system or root problem so that squawks describing the same recurring ' +
              'issue land in the same group (e.g. "oil pressure", "left brake", "alternator", ' +
              '"nose gear shimmy"). A squawk belongs to exactly one cluster. One-off, unrelated ' +
              'squawks may be left out. For each cluster also write a short, plain-English ' +
              'recommendation for the owner. Respond ONLY with JSON: ' +
              '{"clusters":[{"label":"short lowercase phrase","squawk_ids":["id",...],' +
              '"recommendation":"one or two sentences"}]}. Use the exact ids provided.',
          },
          {
            role: 'user',
            content: `Squawks (id<TAB>title — description):\n${squawkList}`,
          },
        ],
      })

      const raw = completion.choices[0]?.message?.content ?? '{}'
      const parsed = JSON.parse(raw) as {
        clusters?: Array<{ label?: unknown; squawk_ids?: unknown; recommendation?: unknown }>
      }
      clusterDefs = (parsed.clusters ?? [])
        .map((c) => ({
          label: typeof c.label === 'string' ? c.label.trim() : '',
          squawk_ids: Array.isArray(c.squawk_ids)
            ? c.squawk_ids.map((x) => String(x)).filter((x) => byId.has(x))
            : [],
          recommendation:
            typeof c.recommendation === 'string' ? c.recommendation.trim() : undefined,
        }))
        .filter((c) => c.label && c.squawk_ids.length > 0)
    } catch {
      clusterDefs = []
    }
  }

  // --- Maintenance-log corroboration (RAG) --------------------------------
  const logRes = await runIntelligenceQuery({
    organizationId,
    aircraftId,
    question:
      'What recurring mechanical problems or complaints appear multiple times in the ' +
      'maintenance records?',
    strategy: 'hybrid_vb',
  })

  // --- Score each cluster (≥2 occurrences only) ---------------------------
  const dedupeIds = (ids: string[]) => Array.from(new Set(ids))
  const scored: SquawkCluster[] = []

  for (const def of clusterDefs) {
    const ids = dedupeIds(def.squawk_ids)
    if (ids.length < 2) continue

    const rows = ids
      .map((id) => byId.get(id))
      .filter((r): r is SquawkRow => Boolean(r))
      .sort((a, b) => {
        const ta = a.created_at ? new Date(a.created_at).getTime() : 0
        const tb = b.created_at ? new Date(b.created_at).getTime() : 0
        return ta - tb
      })
    if (rows.length < 2) continue

    const dates = rows
      .map((r) => r.created_at)
      .filter((d): d is string => Boolean(d))
      .map((d) => new Date(d).getTime())
      .filter((t) => !Number.isNaN(t))
      .sort((a, b) => a - b)

    const first = dates.length ? new Date(dates[0]).toISOString() : null
    const last = dates.length ? new Date(dates[dates.length - 1]).toISOString() : null

    const resolvedCount = rows.filter(
      (r) => (r.status && CLOSED_STATUSES.has(r.status.toLowerCase())) || r.resolved_at,
    ).length
    const openCount = rows.length - resolvedCount

    // Reopen-cycle heuristic: without a full status-history table, a cluster
    // that has resolved squawks AND later open ones implies the issue was
    // closed and came back. Count it as (resolved AND a later open exists).
    let reopenCount = 0
    for (let i = 0; i < rows.length; i += 1) {
      const r = rows[i]
      const isResolved =
        (r.status && CLOSED_STATUSES.has(r.status.toLowerCase())) || Boolean(r.resolved_at)
      if (!isResolved) continue
      const laterOpen = rows
        .slice(i + 1)
        .some((n) => !((n.status && CLOSED_STATUSES.has(n.status.toLowerCase())) || n.resolved_at))
      if (laterOpen) reopenCount += 1
    }

    // Average days between consecutive recurrences.
    let avgDaysBetween: number | null = null
    if (dates.length >= 2) {
      let total = 0
      for (let i = 1; i < dates.length; i += 1) {
        total += (dates[i] - dates[i - 1]) / 86_400_000
      }
      avgDaysBetween = Math.round((total / (dates.length - 1)) * 10) / 10
    }

    // Trend: compare the first gap with the last gap.
    let trend: SquawkCluster['trend'] = 'insufficient'
    if (dates.length >= 3) {
      const firstGap = (dates[1] - dates[0]) / 86_400_000
      const lastGap = (dates[dates.length - 1] - dates[dates.length - 2]) / 86_400_000
      if (lastGap < firstGap * 0.75) trend = 'more_frequent'
      else if (lastGap > firstGap * 1.25) trend = 'less_frequent'
      else trend = 'steady'
    }

    // Per-cluster log corroboration for the top clusters (cap RAG calls).
    let logMentions = 0
    let citations: IntelligenceCitation[] = []
    if (scored.length < 4) {
      const perRes = await runIntelligenceQuery({
        organizationId,
        aircraftId,
        question: `Find maintenance log entries that mention ${def.label} problems or repairs.`,
        strategy: 'hybrid_vb',
      })
      logMentions = perRes.chunkCount
      citations = perRes.citations
    }

    const recommendation =
      (def.recommendation && def.recommendation.length > 0
        ? def.recommendation
        : `This issue has recurred ${rows.length} times. Have a mechanic investigate the ` +
          `root cause rather than repeating the same fix.`) +
      ` ${A_AND_P_NOTICE}`

    scored.push({
      label: def.label,
      count: rows.length,
      date_range: { first, last },
      last_occurrence: last,
      open_count: openCount,
      resolved_count: resolvedCount,
      reopen_count: reopenCount,
      avg_days_between: avgDaysBetween,
      trend,
      log_mentions: logMentions,
      recommendation,
      citations,
    })
  }

  // Most frequent first.
  scored.sort((a, b) => b.count - a.count)

  // --- Assemble + cache ----------------------------------------------------
  const data: SquawkPatternsData = {
    clusters: scored,
    total_squawks: squawks.length,
    log_corroboration: { text: logRes.answer, citations: logRes.citations },
  }

  const report: IntelligenceReport<SquawkPatternsData> = {
    module: 'squawk-patterns',
    aircraft_id: aircraftId,
    generated_at: new Date().toISOString(),
    data,
    cached: false,
  }

  await writeIntelligenceCache(supabase, {
    aircraftId,
    orgId: organizationId,
    module: 'squawk-patterns',
    result: report as unknown as Record<string, unknown>,
  })

  return NextResponse.json(report)
}
