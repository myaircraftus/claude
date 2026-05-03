/**
 * /api/memberships/[id]/persona-prefs  (Spec 5.8)
 *
 *   GET   → return the row's persona + persona_overrides
 *   PATCH → partial-merge of persona_overrides JSONB
 *
 * The membership row must belong to the authenticated user — owner/admin
 * editing other users' prefs is OUT of scope for 5.8 (would need a
 * separate route + role check). Self-edit only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const VALID_DATE_RANGES = new Set(['7d', '30d', '90d', '365d', 'ytd'])
const VALID_TONES = new Set(['plain', 'technical', 'operations'])
const VALID_DIRS = new Set(['asc', 'desc'])

interface PrefsBody {
  defaultDateRange?: string
  defaultGroupBy?: string | null
  defaultSort?: { field?: string; direction?: string } | null
  notificationTone?: string
  voiceIntentPriors?: string[]
}

function sanitize(body: PrefsBody): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (body.defaultDateRange && VALID_DATE_RANGES.has(body.defaultDateRange)) {
    out.defaultDateRange = body.defaultDateRange
  }
  if (body.defaultGroupBy === null || typeof body.defaultGroupBy === 'string') {
    out.defaultGroupBy = body.defaultGroupBy
  }
  if (body.defaultSort && typeof body.defaultSort === 'object') {
    const f = typeof body.defaultSort.field === 'string' ? body.defaultSort.field.slice(0, 64) : undefined
    const d = body.defaultSort.direction && VALID_DIRS.has(body.defaultSort.direction) ? body.defaultSort.direction : undefined
    if (f && d) out.defaultSort = { field: f, direction: d }
  }
  if (body.notificationTone && VALID_TONES.has(body.notificationTone)) {
    out.notificationTone = body.notificationTone
  }
  if (Array.isArray(body.voiceIntentPriors)) {
    out.voiceIntentPriors = body.voiceIntentPriors
      .filter((s): s is string => typeof s === 'string')
      .map((s) => s.slice(0, 80))
      .slice(0, 12)
  }
  return out
}

async function loadOwnMembership(supabase: ReturnType<typeof createServerSupabase>, userId: string, membershipId: string) {
  const { data } = await supabase
    .from('organization_memberships')
    .select('id, user_id, organization_id, role, persona, persona_overrides')
    .eq('id', membershipId)
    .eq('user_id', userId)
    .maybeSingle()
  return data as {
    id: string; user_id: string; organization_id: string; role: string;
    persona: string | null; persona_overrides: Record<string, unknown> | null;
  } | null
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const row = await loadOwnMembership(supabase, user.id, params.id)
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({
    membership_id: row.id,
    persona: row.persona,
    persona_overrides: row.persona_overrides ?? {},
  })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const row = await loadOwnMembership(supabase, user.id, params.id)
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let body: PrefsBody
  try { body = (await req.json()) as PrefsBody } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const sanitized = sanitize(body)
  const merged = { ...(row.persona_overrides ?? {}), ...sanitized }

  const { error } = await supabase
    .from('organization_memberships')
    .update({ persona_overrides: merged })
    .eq('id', row.id)
    .eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    membership_id: row.id,
    persona: row.persona,
    persona_overrides: merged,
  })
}
