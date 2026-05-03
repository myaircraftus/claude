/**
 * POST /api/costs/intake/[id]/extract  (Spec 7.3)
 *
 * Manual or post-upload trigger for the Claude Vision pipeline. Mechanic+
 * auth. Returns the orchestrator's RunResult — caller can poll the
 * intake_documents.status field for live progress.
 *
 * The auto-trigger (background fire from /api/costs/upload + email webhook)
 * imports runExtraction directly; this route is for forced re-runs after
 * a model upgrade or stricter prompt update.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { runExtraction } from '@/lib/ai/extractors/run'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const ALLOWED_ROLES = new Set(['owner', 'admin', 'mechanic'])

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
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
  if (!ALLOWED_ROLES.has(membership.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  // Verify intake belongs to this org before letting the service-role
  // orchestrator at it.
  const { data: row } = await supabase
    .from('intake_documents')
    .select('id')
    .eq('id', params.id)
    .eq('organization_id', membership.organization_id)
    .maybeSingle()
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    const result = await runExtraction({ intake_document_id: params.id })
    return NextResponse.json(result, { status: result.ok ? 200 : 500 })
  } catch (e) {
    console.error('[intake/extract] error:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Extraction failed' },
      { status: 500 },
    )
  }
}
