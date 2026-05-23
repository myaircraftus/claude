/**
 * POST /api/ux/explain-error
 *
 * Called by the client-side ErrorBoundary when an unexpected error
 * surfaces. Body: { status?, message, path? }. Returns user-friendly
 * copy the boundary renders in place of the raw stack.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { explainError } from '@/lib/agents/impl/ux-error-explainer'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  // Don't require auth — even signed-out users hitting an error should
  // get the user-friendly explanation. We pass null triggeredBy in
  // that case so the audit row still files.
  const body = (await req.json().catch(() => ({}))) as {
    status?: number
    message?: string
    path?: string
  }
  const message = (body.message ?? '').slice(0, 1000)
  if (!message) {
    return NextResponse.json({ error: 'message required' }, { status: 400 })
  }
  const service = createServiceSupabase()
  const result = await explainError({
    supabase: service,
    triggeredBy: user?.id ?? null,
    status: body.status ?? null,
    message,
    path: body.path ?? null,
  })
  return NextResponse.json({
    ok: result.ok,
    user_message: result.output?.user_message,
    suggestion: result.output?.suggestion,
    retry_safe: result.output?.retry_safe,
  })
}
