/**
 * /api/bulk-updates  (Cross-cutting Concern 3)
 *
 *   GET  ?status=  → list jobs (org-scoped, last 100)
 *   POST           → create + waitUntil-process a job
 *
 * Body: { entity_type, entity_ids: string[], patch: Record<string, unknown> }
 */
import { NextRequest, NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { BULK_ENTITY_TABLES, processBulkJob } from '@/lib/bulk/processor'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const WRITE_ROLES = new Set(['owner', 'admin', 'mechanic'])

interface CreateBody {
  entity_type?: string
  entity_ids?: string[]
  patch?: Record<string, unknown>
}

export async function GET(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()
  if (!membership) return NextResponse.json({ error: 'No org' }, { status: 403 })

  const url = new URL(req.url)
  const status = url.searchParams.get('status')

  let q = supabase
    .from('bulk_update_jobs')
    .select('*')
    .eq('organization_id', membership.organization_id)
  if (status) q = q.eq('status', status)
  const { data, error } = await q.order('created_at', { ascending: false }).limit(100)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ jobs: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()
  if (!membership) return NextResponse.json({ error: 'No org' }, { status: 403 })
  if (!WRITE_ROLES.has(membership.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  let body: CreateBody
  try { body = (await req.json()) as CreateBody } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  if (!body.entity_type || !(body.entity_type in BULK_ENTITY_TABLES)) {
    return NextResponse.json({ error: `entity_type must be one of: ${Object.keys(BULK_ENTITY_TABLES).join(', ')}` }, { status: 400 })
  }
  if (!Array.isArray(body.entity_ids) || body.entity_ids.length === 0) {
    return NextResponse.json({ error: 'entity_ids required' }, { status: 400 })
  }
  if (body.entity_ids.length > 1000) {
    return NextResponse.json({ error: 'Max 1000 ids per job' }, { status: 400 })
  }
  if (!body.patch || typeof body.patch !== 'object') {
    return NextResponse.json({ error: 'patch object required' }, { status: 400 })
  }

  // Insert job with status=pending; processor flips to running→completed/failed.
  const { data: jobRow, error } = await supabase
    .from('bulk_update_jobs')
    .insert({
      organization_id: membership.organization_id,
      entity_type: body.entity_type,
      entity_ids: body.entity_ids,
      patch: body.patch,
      status: 'pending',
      created_by: user.id,
    })
    .select('*')
    .single()
  if (error || !jobRow) return NextResponse.json({ error: error?.message ?? 'insert failed' }, { status: 500 })

  // Background-process via waitUntil — same Vercel-safe pattern as 7.3.
  const service = createServiceSupabase()
  waitUntil((async () => {
    try {
      await processBulkJob(service, jobRow as {
        id: string; organization_id: string; entity_type: string;
        entity_ids: string[]; patch: Record<string, unknown>;
      })
    } catch (e) {
      console.warn('[bulk-update] background process failed:', e)
    }
  })())

  return NextResponse.json({ job: jobRow }, { status: 201 })
}
