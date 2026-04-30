/**
 * POST /api/admin/ingestion-health/send-to-claude
 * GET  /api/admin/ingestion-health/send-to-claude  (lists pending items)
 *
 * The "click button instead of copy-paste" path. The admin dashboard POSTs
 * one of these per failure they want help with; the row lands in
 * `claude_review_requests` with the full failure snapshot. Next time
 * Claude is active in chat, the user can say "check the queue" (or
 * Claude can poll proactively) and Claude reads every pending row,
 * analyzes them in one pass, ships fixes, and marks each one resolved.
 *
 * Why this is the safe path (vs. autonomous code edits): nothing is
 * applied without Claude reading the row, deciding the right fix, and
 * shipping a normal commit. The button just removes the copy-paste step,
 * not the human/Claude judgment step.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface SendToClaudeBody {
  failure_id?: string
  document_id?: string
  operator_note?: string
  /** Snapshot of everything the dashboard sees — used as fallback if we can't load from DB. */
  snapshot?: Record<string, unknown>
}

async function requirePlatformAdmin() {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, status: 401, body: { error: 'Unauthorized' } }
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('email, is_platform_admin')
    .eq('id', user.id)
    .single()
  if (!profile?.is_platform_admin) {
    return { ok: false as const, status: 403, body: { error: 'Forbidden' } }
  }
  return { ok: true as const, user, email: profile.email }
}

export async function POST(req: NextRequest) {
  const auth = await requirePlatformAdmin()
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status })

  let body: SendToClaudeBody & { failure_ids?: string[]; bulk_all_failures?: boolean }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // BULK PATH: queue every recent ingestion_failures row in one shot.
  // Either pass an explicit array of failure_ids, OR pass bulk_all_failures
  // to send everything from the last 7 days that isn't already recovered.
  // De-dups against any pending/in_review rows already in the queue so we
  // don't push the same failure twice.
  const service = createServiceSupabase()
  if (body.bulk_all_failures || (Array.isArray(body.failure_ids) && body.failure_ids.length > 0)) {
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    let candidatesQuery = service
      .from('ingestion_failures')
      .select('id, document_id, organization_id, error_message, classifier_tag, severity, attempt_number, outcome, occurred_at, pipeline_stage')
      .gte('occurred_at', since7d)

    if (Array.isArray(body.failure_ids) && body.failure_ids.length > 0) {
      candidatesQuery = candidatesQuery.in('id', body.failure_ids)
    } else {
      // bulk_all_failures: focus on actually-broken stuff (skip already-recovered).
      candidatesQuery = candidatesQuery.neq('outcome', 'recovered')
    }

    const { data: candidates, error: candErr } = await candidatesQuery.limit(500)
    if (candErr) return NextResponse.json({ error: candErr.message }, { status: 500 })

    const candidateRows = (candidates ?? []) as Array<Record<string, any>>
    if (candidateRows.length === 0) {
      return NextResponse.json({ ok: true, queued: 0, skipped: 0, message: 'Nothing to queue.' })
    }

    // Skip failure_ids already pending or in_review.
    const candidateIds = candidateRows.map((r) => r.id as string)
    const { data: existing } = await service
      .from('claude_review_requests')
      .select('failure_id')
      .in('failure_id', candidateIds)
      .in('status', ['pending', 'in_review'])
    const existingSet = new Set(((existing ?? []) as Array<{ failure_id: string }>).map((r) => r.failure_id))

    // Hydrate doc titles + tails so the queue rows are self-contained.
    const docIds = Array.from(new Set(candidateRows.map((r) => r.document_id))).filter(Boolean) as string[]
    const docMeta = new Map<string, { title: string; tail: string | null; status: string }>()
    if (docIds.length > 0) {
      const { data: docs } = await service
        .from('documents')
        .select('id, title, parsing_status, aircraft:aircraft_id(tail_number)')
        .in('id', docIds)
      for (const d of docs ?? []) {
        const tail = Array.isArray((d as any).aircraft)
          ? (d as any).aircraft[0]?.tail_number ?? null
          : (d as any).aircraft?.tail_number ?? null
        docMeta.set(d.id as string, {
          title: (d as any).title ?? 'Untitled',
          tail,
          status: (d as any).parsing_status ?? 'unknown',
        })
      }
    }

    const rowsToInsert = candidateRows
      .filter((r) => !existingSet.has(r.id))
      .map((r) => {
        const meta = docMeta.get(r.document_id as string)
        return {
          requested_by_user_id: auth.user.id,
          requested_by_email: auth.email,
          request_type: 'ingestion_failure',
          failure_id: r.id,
          document_id: r.document_id,
          organization_id: r.organization_id,
          failure_snapshot: {
            ...r,
            document_title: meta?.title ?? null,
            aircraft_tail: meta?.tail ?? null,
            current_doc_status: meta?.status ?? null,
          },
          status: 'pending',
        }
      })

    if (rowsToInsert.length === 0) {
      return NextResponse.json({
        ok: true,
        queued: 0,
        skipped: candidateRows.length,
        message: 'All matching failures are already in the queue.',
      })
    }

    const { error: insertErr } = await service.from('claude_review_requests').insert(rowsToInsert)
    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

    return NextResponse.json({
      ok: true,
      queued: rowsToInsert.length,
      skipped: candidateRows.length - rowsToInsert.length,
      message: `Queued ${rowsToInsert.length} failures. ${candidateRows.length - rowsToInsert.length} were already in the queue.`,
    })
  }

  // SINGLE-FAILURE PATH below — bulk path returned above.

  // Pull the full failure record + linked doc context so the queue row is
  // self-contained. Claude reads ONLY this snapshot — no follow-up DB
  // lookups required to act on it.
  let snapshot: Record<string, unknown> | null = null
  let documentId: string | null = body.document_id ?? null
  let organizationId: string | null = null

  if (body.failure_id) {
    const { data: f } = await service
      .from('ingestion_failures')
      .select('*')
      .eq('id', body.failure_id)
      .maybeSingle()
    if (f) {
      snapshot = f as Record<string, unknown>
      documentId = (f as any).document_id ?? documentId
      organizationId = (f as any).organization_id ?? null
    }
  }

  // Enrich with doc title / aircraft tail / current status so the queue
  // listing is human-readable without joining anything.
  if (documentId) {
    const { data: doc } = await service
      .from('documents')
      .select('title, parsing_status, aircraft:aircraft_id(tail_number)')
      .eq('id', documentId)
      .maybeSingle()
    if (doc) {
      const tail = Array.isArray((doc as any).aircraft)
        ? (doc as any).aircraft[0]?.tail_number ?? null
        : (doc as any).aircraft?.tail_number ?? null
      snapshot = {
        ...(snapshot ?? body.snapshot ?? {}),
        document_title: (doc as any).title,
        aircraft_tail: tail,
        current_doc_status: (doc as any).parsing_status,
      }
      if (!organizationId) {
        // Fall back via the user's org membership.
        const { data: membership } = await service
          .from('organization_memberships')
          .select('organization_id')
          .eq('user_id', auth.user.id)
          .maybeSingle()
        organizationId = (membership as any)?.organization_id ?? null
      }
    }
  }

  if (!snapshot) {
    snapshot = body.snapshot ?? null
  }

  if (!snapshot) {
    return NextResponse.json(
      { error: 'No snapshot available — pass failure_id or snapshot.' },
      { status: 400 },
    )
  }

  const { data: inserted, error } = await service
    .from('claude_review_requests')
    .insert({
      requested_by_user_id: auth.user.id,
      requested_by_email: auth.email,
      request_type: 'ingestion_failure',
      failure_id: body.failure_id ?? null,
      document_id: documentId,
      organization_id: organizationId,
      failure_snapshot: snapshot,
      operator_note: body.operator_note ?? null,
      status: 'pending',
    })
    .select('id, created_at, status')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    request: inserted,
    note:
      "Queued for Claude. Next time you're in chat with Claude, say 'check the queue' (or Claude will see it on the dashboard) and the fix will get shipped without any copy-paste.",
  })
}

export async function GET(_req: NextRequest) {
  const auth = await requirePlatformAdmin()
  if (!auth.ok) return NextResponse.json(auth.body, { status: auth.status })

  const service = createServiceSupabase()
  const { data, error } = await service
    .from('claude_review_requests')
    .select('id, status, request_type, failure_snapshot, operator_note, created_at, resolved_at, resolution_summary')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ requests: data ?? [] })
}
