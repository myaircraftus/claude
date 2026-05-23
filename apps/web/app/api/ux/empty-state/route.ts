/**
 * POST /api/ux/empty-state
 *
 * On-demand: the EmptyState component asks the coach agent for 2-3
 * tailored next actions for the current page. Returns the agent's
 * suggestions OR the heuristic fallback if OPENAI_API_KEY is missing.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { suggestEmptyStateActions, type EmptyPersona } from '@/lib/agents/impl/ux-empty-state-coach'

export const runtime = 'nodejs'

interface Body {
  pathname?: string
  persona?: EmptyPersona
  resource?: string
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as Body
  const pathname = (body.pathname ?? '').slice(0, 200)
  const persona: EmptyPersona = (body.persona === 'shop' || body.persona === 'admin' || body.persona === 'mechanic')
    ? body.persona
    : 'owner'
  if (!pathname) {
    return NextResponse.json({ error: 'pathname required' }, { status: 400 })
  }

  const service = createServiceSupabase()
  const result = await suggestEmptyStateActions({
    supabase: service,
    triggeredBy: user.id,
    pathname,
    persona,
    resource: body.resource,
  })
  return NextResponse.json({
    ok: result.ok,
    suggestions: result.output?.suggestions ?? [],
  })
}
