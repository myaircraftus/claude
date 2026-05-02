/**
 * POST /api/ai/tools/[name] (Spec 0.3)
 *
 * Execute a tool from the Spec 0.3 registry (`lib/ai/tool-registry.ts`).
 * The same dispatch path is used by:
 *   - The user clicking a `SuggestedAction` button on an ActionCard
 *   - The LLM emitting a function-call result
 *   - Internal cron / orchestrator code (which calls invokeTool() directly
 *     rather than going through HTTP — same registry, same permission gate)
 *
 * Body: { args: Record<string, unknown> }
 *
 * Note: this is the *Spec 0.3* tool registry, not the older OpenAI
 * function-calling tools used by /api/ask (those live in lib/ai/tools.ts).
 * Tool names are namespaced by registry; if a name collides we'll add a
 * `?registry=` query param at that point.
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { getCurrentPersona } from '@/lib/persona/server'
import { invokeTool, getTool } from '@/lib/ai/tool-registry'

export async function POST(
  req: NextRequest,
  { params }: { params: { name: string } },
) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tool = getTool(params.name)
  if (!tool) return NextResponse.json({ error: `Unknown tool: ${params.name}` }, { status: 404 })

  let body: { args?: Record<string, unknown> }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const persona = await getCurrentPersona()

  try {
    const result = await invokeTool(tool.name, body.args ?? {}, {
      organization_id: ctx.organizationId,
      user_id: ctx.user.id,
      persona: persona.persona,
      role: ctx.role,
    })
    return NextResponse.json({ ok: true, result })
  } catch (e: any) {
    const msg = e?.message ?? 'Tool invocation failed'
    // Permission errors thrown from invokeTool() carry "not permitted" — map
    // those to 403 rather than 500 so the UI can show a useful message.
    const status = /not permitted/i.test(msg) ? 403 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
