/**
 * GET /api/sop/simulator/[id]
 *
 * Fetch a persisted simulator session by id, scoped to the calling
 * user via RLS. Returns the full message history so the simulator
 * client can rehydrate state when the user clicks "Resume."
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { getSession } from '@/lib/sop/sessions'

export const runtime = 'nodejs'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const session = await getSession({ sessionId: params.id, userId: user.id })
  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }
  return NextResponse.json({ session })
}
