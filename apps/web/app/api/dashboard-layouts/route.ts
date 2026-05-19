/**
 * /api/dashboard-layouts  (Cross-cutting Concern 5)
 *
 *   GET  ?persona= → caller's layout for the persona (defaults to active persona)
 *   PUT  body { persona, widgets } → upsert by (user_id, org_id, persona)
 *
 * The widgets blob is stored verbatim — UI defines the schema. Server
 * just enforces ownership (user_id = auth.uid()) + sane size limits.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import type { Persona } from '@/types'

export const dynamic = 'force-dynamic'

const VALID_PERSONAS = new Set<Persona | 'mechanic'>(['owner', 'mechanic', 'shop', 'admin'])
const MAX_WIDGETS_BYTES = 200_000 // ~200KB JSON cap

interface PutBody {
  persona?: Persona
  widgets?: unknown
}

export async function GET(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id, persona')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()
  if (!membership) return NextResponse.json({ error: 'No org' }, { status: 403 })

  const url = new URL(req.url)
  const requested = (url.searchParams.get('persona') ?? membership.persona ?? 'owner') as Persona
  const persona: Persona = VALID_PERSONAS.has(requested) ? requested : 'owner'

  const { data } = await supabase
    .from('dashboard_layouts')
    .select('*')
    .eq('user_id', user.id)
    .eq('organization_id', membership.organization_id)
    .eq('persona', persona)
    .maybeSingle()

  return NextResponse.json({ layout: data ?? null, persona })
}

export async function PUT(req: NextRequest) {
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

  let body: PutBody
  try { body = (await req.json()) as PutBody } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const persona = body.persona ?? 'owner'
  if (!VALID_PERSONAS.has(persona)) {
    return NextResponse.json({ error: 'Invalid persona' }, { status: 400 })
  }

  const widgets = Array.isArray(body.widgets) ? body.widgets : []
  const serialized = JSON.stringify(widgets)
  if (serialized.length > MAX_WIDGETS_BYTES) {
    return NextResponse.json({ error: `widgets blob exceeds ${MAX_WIDGETS_BYTES} bytes` }, { status: 413 })
  }

  const { data, error } = await supabase
    .from('dashboard_layouts')
    .upsert({
      user_id: user.id,
      organization_id: membership.organization_id,
      persona,
      widgets,
    }, { onConflict: 'user_id,organization_id,persona' })
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ layout: data })
}
