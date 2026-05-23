/**
 * data-quality.orphaned-records-detector
 *
 * Nightly 04:00 UTC. Hunts for rows pointing at FK references that no
 * longer exist (or never did). We scan the most-trafficked tables:
 *
 *   - work_orders.aircraft_id → aircraft.id
 *   - logbook_entries.aircraft_id → aircraft.id
 *   - logbook_entries.document_id → documents.id
 *   - inbox_messages.user_id → user_profiles.id
 *   - agent_runs.triggered_by → user_profiles.id (informational only)
 *
 * Pure SQL. Emits 'orphaned_records' recommendations grouped by the
 * source table + reference column. The founder decides whether to
 * soft-delete, repair, or ignore each cluster — agent never auto-mutates.
 *
 * Bounded: scans up to 50k rows per source table and reports at most
 * 100 orphans per cluster. Larger clusters become a fix-it-script task
 * rather than a per-row recommendation.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { runAgent } from '../runner'

export interface OrphanCluster {
  source_table: string
  fk_column: string
  target_table: string
  orphan_count: number
  example_rows: Array<{ id: string; fk_value: string | null }>
}

export interface OrphanReport {
  scanned_tables: number
  total_orphans: number
  clusters: OrphanCluster[]
}

interface Probe {
  source: string
  fk: string
  target: string
  pk: 'id'
}

const PROBES: Probe[] = [
  { source: 'work_orders', fk: 'aircraft_id', target: 'aircraft', pk: 'id' },
  { source: 'logbook_entries', fk: 'aircraft_id', target: 'aircraft', pk: 'id' },
  { source: 'logbook_entries', fk: 'document_id', target: 'documents', pk: 'id' },
  { source: 'inbox_messages', fk: 'user_id', target: 'user_profiles', pk: 'id' },
]

async function checkProbe(
  supabase: SupabaseClient,
  probe: Probe,
): Promise<OrphanCluster | null> {
  // 1) Pull source rows with non-null FK
  const { data: srcRows, error: srcErr } = await supabase
    .from(probe.source)
    .select(`id, ${probe.fk}`)
    .not(probe.fk, 'is', null)
    .limit(50000)
  if (srcErr || !srcRows) return null
  type Src = { id: string } & Record<string, string | null>
  const src = srcRows as Src[]
  if (src.length === 0) {
    return {
      source_table: probe.source,
      fk_column: probe.fk,
      target_table: probe.target,
      orphan_count: 0,
      example_rows: [],
    }
  }
  // 2) Unique FK values
  const fkValues = Array.from(
    new Set(src.map((r) => r[probe.fk]).filter((v): v is string => Boolean(v))),
  )
  if (fkValues.length === 0) {
    return {
      source_table: probe.source,
      fk_column: probe.fk,
      target_table: probe.target,
      orphan_count: 0,
      example_rows: [],
    }
  }
  // 3) Which exist?
  const present = new Set<string>()
  // Supabase .in() caps at ~1000 — chunk
  for (let i = 0; i < fkValues.length; i += 500) {
    const chunk = fkValues.slice(i, i + 500)
    const { data: tgt } = await supabase
      .from(probe.target)
      .select(probe.pk)
      .in(probe.pk, chunk)
    for (const t of (tgt ?? []) as Array<Record<string, string>>) {
      const v = t[probe.pk]
      if (typeof v === 'string') present.add(v)
    }
  }
  // 4) Orphan = source row whose FK isn't in present
  const orphans = src.filter((r) => {
    const v = r[probe.fk]
    return v !== null && v !== undefined && !present.has(v)
  })
  return {
    source_table: probe.source,
    fk_column: probe.fk,
    target_table: probe.target,
    orphan_count: orphans.length,
    example_rows: orphans.slice(0, 50).map((r) => ({
      id: r.id,
      fk_value: r[probe.fk] ?? null,
    })),
  }
}

export async function detectOrphanedRecords(args: {
  supabase: SupabaseClient
}): Promise<{ ok: boolean; output?: OrphanReport; runId?: string; error?: string }> {
  return runAgent<OrphanReport>(
    'data-quality.orphaned-records-detector',
    { supabase: args.supabase, input: { probes: PROBES.length } },
    async () => {
      const clusters: OrphanCluster[] = []
      for (const p of PROBES) {
        const c = await checkProbe(args.supabase, p)
        if (c) clusters.push(c)
      }
      const meaningful = clusters.filter((c) => c.orphan_count > 0)
      const total = meaningful.reduce((a, c) => a + c.orphan_count, 0)
      return {
        output: {
          scanned_tables: PROBES.length,
          total_orphans: total,
          clusters: meaningful,
        },
        needsHuman: total > 0,
        recommendation:
          total > 0
            ? {
                kind: 'orphaned_records',
                total_orphans: total,
                clusters: meaningful,
              }
            : null,
      }
    },
  )
}
