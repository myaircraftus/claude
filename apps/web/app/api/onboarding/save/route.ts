import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'

// POST /api/onboarding/save
// Incrementally saves onboarding answers to user_profiles / organizations
export async function POST(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const service = createServiceSupabase()

  // ── Profile fields ─────────────────────────────────────────────────────────
  const profilePatch: Record<string, unknown> = {}
  if (body.full_name !== undefined) profilePatch.full_name = body.full_name
  if (body.phone !== undefined) profilePatch.phone = body.phone
  if (body.job_title !== undefined) profilePatch.job_title = body.job_title
  if (body.cert_number !== undefined) profilePatch.cert_number = body.cert_number
  if (body.persona !== undefined) profilePatch.persona = body.persona
  if (body.onboarding_context !== undefined) profilePatch.onboarding_context = body.onboarding_context
  if (body.onboarding_completed_at !== undefined) profilePatch.onboarding_completed_at = body.onboarding_completed_at

  if (Object.keys(profilePatch).length > 0) {
    const { error } = await service
      .from('user_profiles')
      .upsert({ id: user.id, email: user.email ?? '', ...profilePatch }, { onConflict: 'id' })
    if (error) {
      console.error('[onboarding/save] profile upsert error', error)
      return NextResponse.json({ error: 'Failed to save profile' }, { status: 500 })
    }
  }

  // ── Org fields ─────────────────────────────────────────────────────────────
  const orgPatch: Record<string, unknown> = {}
  if (body.org_name !== undefined) orgPatch.name = body.org_name
  if (body.current_integration !== undefined) orgPatch.current_integration = body.current_integration
  if (body.integration_flags !== undefined) orgPatch.integration_flags = body.integration_flags

  if (Object.keys(orgPatch).length > 0 && body.org_id) {
    const { error } = await service
      .from('organizations')
      .update(orgPatch)
      .eq('id', body.org_id as string)
    if (error) {
      console.error('[onboarding/save] org update error', error)
      return NextResponse.json({ error: 'Failed to save organization' }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}
