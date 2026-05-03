/**
 * GET /api/cron/trash-purge  (Cross-cutting Concern 4)
 *
 * Daily sweep — hard-deletes trashed rows older than TRASH_RETENTION_DAYS
 * across every registered entity type. Vercel-cron auth pattern (UA OR
 * Bearer CRON_SECRET) — same as 5.5 wo-audit / 5.3 predictions cron.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { TRASH_ENTITIES, TRASH_RETENTION_DAYS } from '@/lib/trash/registry'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function isVercelCronRequest(req: NextRequest): boolean {
  const ua = req.headers.get('user-agent') ?? ''
  if (ua.startsWith('vercel-cron')) return true
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') === `Bearer ${secret}`) return true
  return false
}

export async function GET(req: NextRequest) {
  if (!isVercelCronRequest(req)) {
    return NextResponse.json({ error: 'Cron only' }, { status: 401 })
  }

  const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const service = createServiceSupabase()

  const results: Array<{ entity_type: string; purged: number; error?: string }> = []
  for (const [key, cfg] of Object.entries(TRASH_ENTITIES)) {
    const { count, error } = await service
      .from(cfg.table)
      .delete({ count: 'exact' })
      .lt('deleted_at', cutoff)
    if (error) results.push({ entity_type: key, purged: 0, error: error.message })
    else results.push({ entity_type: key, purged: count ?? 0 })
  }

  return NextResponse.json({
    cutoff,
    retention_days: TRASH_RETENTION_DAYS,
    results,
    total_purged: results.reduce((s, r) => s + r.purged, 0),
  })
}
