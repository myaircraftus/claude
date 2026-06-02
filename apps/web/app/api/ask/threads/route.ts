/**
 * GET /api/ask/threads
 *
 * The signed-in user's Ask AI conversations (most-recently-updated first),
 * scoped to their org + created_by. Powers the conversation list in the
 * Ask experience sidebar.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { listAskThreads } from '@/lib/ask/threads'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) {
    const supabase = createServerSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    return NextResponse.json(
      { error: user ? 'No organization' : 'Unauthorized' },
      { status: user ? 403 : 401 },
    )
  }

  const supabase = createServerSupabase()
  const threads = await listAskThreads(supabase, ctx.organizationId, ctx.user.id, 30)
  return NextResponse.json({ threads })
}
