import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { tasks } from '@trigger.dev/sdk/v3'

// ─── Route context type ────────────────────────────────────────────────────────

interface RouteContext {
  params: { id: string }
}

// ─── POST /api/documents/[id]/retry ───────────────────────────────────────────

export async function POST(_req: NextRequest, { params }: RouteContext) {
  const { id } = params

  // ── 1. Auth check ──────────────────────────────────────────────────────────
  const supabase = createServerSupabase()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── 2. Role check (mechanic+) ──────────────────────────────────────────────
  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()

  if (!membership) {
    return NextResponse.json({ error: 'No organization membership found' }, { status: 403 })
  }

  const ALLOWED_ROLES = ['owner', 'admin', 'mechanic']
  if (!ALLOWED_ROLES.includes(membership.role)) {
    return NextResponse.json(
      { error: 'Insufficient permissions. Mechanic role or higher required.' },
      { status: 403 }
    )
  }

  const orgId = membership.organization_id

  // ── 3. Verify document is in 'failed' state ────────────────────────────────
  const serviceClient = createServiceSupabase()

  const { data: doc, error: fetchError } = await serviceClient
    .from('documents')
    .select('id, parsing_status, title')
    .eq('id', id)
    .eq('organization_id', orgId)
    .single()

  if (fetchError || !doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  if (doc.parsing_status !== 'failed') {
    return NextResponse.json(
      {
        error: `Cannot retry document with status "${doc.parsing_status}". Only failed documents can be retried.`,
      },
      { status: 409 }
    )
  }

  // ── 4. Update status to 'queued', clear parse_error ───────────────────────
  const { error: updateError } = await serviceClient
    .from('documents')
    .update({
      parsing_status: 'queued',
      parse_error: null,
      parse_started_at: null,
      parse_completed_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('organization_id', orgId)

  if (updateError) {
    console.error('[retry] DB update error:', updateError)
    return NextResponse.json({ error: 'Failed to re-queue document' }, { status: 500 })
  }

  // ── 5. Re-trigger Trigger.dev job ─────────────────────────────────────────
  try {
    await tasks.trigger('ingest-document', { documentId: id })
  } catch (triggerError) {
    console.error('[retry] Failed to trigger ingest job:', triggerError)
    // Non-fatal: document is now in 'queued' state and will be picked up by workers
  }

  // ── Write audit log ────────────────────────────────────────────────────────
  await serviceClient.from('audit_logs').insert({
    organization_id: orgId,
    user_id: user.id,
    action: 'document.retry',
    resource_type: 'document',
    resource_id: id,
    metadata_json: { title: doc.title },
  })

  return NextResponse.json({ status: 'queued' })
}
