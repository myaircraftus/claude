/**
 * intelligence_cache read/write helpers.
 *
 * Each module's expensive multi-query AI analysis is cached for 24h. Reads
 * pick the latest non-expired row per (aircraft, module); writes simply
 * INSERT a fresh row (old rows expire on their own and are ignored).
 */
import type { IntelligenceModule } from './types'

export interface CachedIntelligence {
  result_json: Record<string, unknown>
  generated_at: string
  expires_at: string
}

/** Latest non-expired cache row for (aircraft, module), or null if none/stale. */
export async function readIntelligenceCache(
  supabase: any,
  aircraftId: string,
  module: IntelligenceModule,
): Promise<CachedIntelligence | null> {
  try {
    const { data, error } = await supabase
      .from('intelligence_cache')
      .select('result_json, generated_at, expires_at')
      .eq('aircraft_id', aircraftId)
      .eq('module', module)
      .gt('expires_at', new Date().toISOString())
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error || !data) return null
    return data as CachedIntelligence
  } catch {
    return null
  }
}

/** Persist a fresh module result (24h TTL via the column default). Best-effort. */
export async function writeIntelligenceCache(
  supabase: any,
  args: {
    aircraftId: string
    orgId: string
    module: IntelligenceModule
    result: Record<string, unknown>
  },
): Promise<void> {
  try {
    await supabase.from('intelligence_cache').insert({
      aircraft_id: args.aircraftId,
      org_id: args.orgId,
      module: args.module,
      result_json: args.result,
    })
  } catch {
    // caching is best-effort — never block a response on a cache write
  }
}
