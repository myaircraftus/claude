/**
 * /api/admin/ops-prompt — Phase 16 Sprint 16.11
 *
 * POST { source_type, source_id, ai_analysis? }
 *   Generate a Claude Code prompt + persist to ops_event_prompts.
 *   Returns { prompt_text, prompt_id, context_files }.
 *
 * PATCH { prompt_id, used_at?, outcome?, outcome_note? }
 *   Update audit fields after admin pastes the prompt and ships a fix.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { generateClaudeCodePrompt } from '@/lib/ops/prompt-generator'
import type { OpsSourceType } from '@/lib/ops/spine'

export const dynamic = 'force-dynamic'

const VALID_SOURCE_TYPES: ReadonlySet<OpsSourceType> = new Set([
  'support_ticket', 'error_event', 'alert_event', 'feedback_item', 'churn_signal',
])

const VALID_OUTCOMES = new Set(['pending', 'used', 'fixed', 'partial', 'wont_fix', 'duplicate'])

async function requirePlatformAdmin() {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const { data: profile } = await supabase
    .from('user_profiles').select('is_platform_admin').eq('id', user.id).single()
  if (!profile?.is_platform_admin) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { user }
}

export async function POST(req: NextRequest) {
  const guard = await requirePlatformAdmin()
  if ('error' in guard) return guard.error

  const body = await req.json().catch(() => null)
  if (!body || !VALID_SOURCE_TYPES.has(body.source_type) || typeof body.source_id !== 'string') {
    return NextResponse.json({ error: 'source_type + source_id required' }, { status: 400 })
  }

  const service = createServiceSupabase()
  const generated = await generateClaudeCodePrompt(
    service,
    body.source_type as OpsSourceType,
    body.source_id,
    { ai_analysis: typeof body.ai_analysis === 'string' ? body.ai_analysis : undefined },
  )

  if (!generated) {
    return NextResponse.json({ error: 'source not found or unsupported' }, { status: 404 })
  }

  const { data: row, error } = await service
    .from('ops_event_prompts')
    .insert({
      ops_event_source_type: body.source_type,
      ops_event_source_id: body.source_id,
      prompt_text: generated.prompt_text,
      context_files: generated.context_files,
      ai_analysis: generated.ai_analysis,
      generated_by_user_id: guard.user.id,
      metadata: generated.metadata,
    })
    .select('id')
    .single()

  if (error) {
    return NextResponse.json(
      { error: error.message, hint: 'ops_event_prompts table may not be applied yet (migration 113)' },
      { status: 503 },
    )
  }

  return NextResponse.json({
    prompt_id: (row as { id: string }).id,
    prompt_text: generated.prompt_text,
    context_files: generated.context_files,
  })
}

export async function PATCH(req: NextRequest) {
  const guard = await requirePlatformAdmin()
  if ('error' in guard) return guard.error

  const body = await req.json().catch(() => null)
  if (!body?.prompt_id) {
    return NextResponse.json({ error: 'prompt_id required' }, { status: 400 })
  }

  const patch: Record<string, unknown> = {}
  if (body.used_at === true) patch.used_at = new Date().toISOString()
  if (typeof body.outcome === 'string') {
    if (!VALID_OUTCOMES.has(body.outcome)) {
      return NextResponse.json({ error: 'invalid outcome' }, { status: 400 })
    }
    patch.outcome = body.outcome
    patch.outcome_recorded_at = new Date().toISOString()
  }
  if (typeof body.outcome_note === 'string') {
    patch.outcome_note = body.outcome_note.slice(0, 1000)
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 })
  }

  const service = createServiceSupabase()
  const { error } = await service
    .from('ops_event_prompts')
    .update(patch)
    .eq('id', body.prompt_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
