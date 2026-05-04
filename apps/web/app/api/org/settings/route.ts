/**
 * /api/org/settings  (Spec 6.2)
 *
 *   GET → organizations.settings JSONB blob (or {})
 *   PUT → partial-merge into the JSONB blob (owner+admin only)
 *
 * Loose-shape JSONB; the API layer enforces the keys we know about
 * (default_labor_rates, tax_profile, document_categories, reminder_offsets,
 * notification_preferences, ai_behavior). Unknown keys are ignored — won't
 * break older clients during a rollout.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const WRITE_ROLES = new Set(['owner', 'admin'])
const VALID_AI_BEHAVIOR = new Set(['aggressive', 'balanced', 'conservative'])
const VALID_DEPTS = new Set(['airframe', 'engine', 'avionics', 'interior', 'shop'])

interface PutBody {
  default_labor_rates?: Record<string, number>
  tax_profile?: { rate?: number; jurisdiction?: string; exempt?: boolean; exemption_id?: string | null }
  document_categories?: string[]
  reminder_offsets?: Array<{ offset_days: number; channels?: string[] }>
  notification_preferences?: { in_app?: boolean; email?: boolean; push?: boolean; sms?: boolean }
  ai_behavior?: string
}

function sanitize(body: PutBody): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (body.default_labor_rates && typeof body.default_labor_rates === 'object') {
    const rates: Record<string, number> = {}
    for (const [k, v] of Object.entries(body.default_labor_rates)) {
      if (VALID_DEPTS.has(k) && typeof v === 'number' && v >= 0) rates[k] = Math.round(v * 100) / 100
    }
    out.default_labor_rates = rates
  }
  if (body.tax_profile && typeof body.tax_profile === 'object') {
    out.tax_profile = {
      rate: typeof body.tax_profile.rate === 'number' ? Math.max(0, Math.min(100, body.tax_profile.rate)) : 0,
      jurisdiction: typeof body.tax_profile.jurisdiction === 'string' ? body.tax_profile.jurisdiction.slice(0, 100) : '',
      exempt: !!body.tax_profile.exempt,
      exemption_id: typeof body.tax_profile.exemption_id === 'string' ? body.tax_profile.exemption_id.slice(0, 100) : null,
    }
  }
  if (Array.isArray(body.document_categories)) {
    out.document_categories = body.document_categories.filter((s): s is string => typeof s === 'string').slice(0, 50)
  }
  if (Array.isArray(body.reminder_offsets)) {
    out.reminder_offsets = body.reminder_offsets
      .filter((r) => r && typeof r.offset_days === 'number' && Number.isFinite(r.offset_days))
      .map((r) => ({
        offset_days: Math.round(r.offset_days),
        channels: Array.isArray(r.channels) ? r.channels.filter((c): c is string => typeof c === 'string') : ['in-app'],
      })).slice(0, 12)
  }
  if (body.notification_preferences && typeof body.notification_preferences === 'object') {
    out.notification_preferences = {
      in_app: body.notification_preferences.in_app !== false,
      email: !!body.notification_preferences.email,
      push: !!body.notification_preferences.push,
      sms: !!body.notification_preferences.sms,
    }
  }
  if (typeof body.ai_behavior === 'string' && VALID_AI_BEHAVIOR.has(body.ai_behavior)) {
    out.ai_behavior = body.ai_behavior
  }
  return out
}

export async function GET() {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_memberships').select('organization_id')
    .eq('user_id', user.id).not('accepted_at', 'is', null).single()
  if (!membership) return NextResponse.json({ error: 'No org' }, { status: 403 })

  const { data: org } = await supabase
    .from('organizations').select('settings')
    .eq('id', membership.organization_id).maybeSingle()
  return NextResponse.json({ settings: (org as { settings?: Record<string, unknown> } | null)?.settings ?? {} })
}

export async function PUT(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_memberships').select('organization_id, role')
    .eq('user_id', user.id).not('accepted_at', 'is', null).single()
  if (!membership) return NextResponse.json({ error: 'No org' }, { status: 403 })
  if (!WRITE_ROLES.has(membership.role)) return NextResponse.json({ error: 'Owner/admin only' }, { status: 403 })

  let body: PutBody
  try { body = (await req.json()) as PutBody } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  // Read existing, partial-merge sanitized keys.
  const { data: org } = await supabase
    .from('organizations').select('settings')
    .eq('id', membership.organization_id).maybeSingle()
  const current = (org as { settings?: Record<string, unknown> } | null)?.settings ?? {}
  const merged = { ...current, ...sanitize(body) }

  const { error } = await supabase
    .from('organizations').update({ settings: merged }).eq('id', membership.organization_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ settings: merged })
}
