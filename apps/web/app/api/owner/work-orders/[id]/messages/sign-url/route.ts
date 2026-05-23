/**
 * GET /api/owner/work-orders/[id]/messages/sign-url?path=<storagePath>
 *
 * Owner-side mirror of the shop sign-url. Verifies the calling user owns
 * the aircraft on this WO, then signs a short-TTL URL for the requested
 * attachment path. The path must live under <wo.organization_id>/<woId>/
 * so an owner can't request another tenant's files even if they guessed
 * the path.
 */
import { NextRequest, NextResponse } from 'next/server'
import { resolveOwnerContext, getOwnerScopedWorkOrder } from '@/lib/auth/owner-portal'
import { createServiceSupabase } from '@/lib/supabase/server'

const SIGN_TTL_SECONDS = 60 * 30 // 30 minutes

export const runtime = 'nodejs'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveOwnerContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const wo = await getOwnerScopedWorkOrder(ctx, params.id)
  if (!wo) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const path = req.nextUrl.searchParams.get('path') ?? ''
  if (!path || path.includes('..')) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
  }
  // Path must start with the WO's org + id prefix — defense in depth on
  // top of the RLS storage policy.
  if (!path.startsWith(`${wo.organization_id}/${wo.id}/`)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const service = createServiceSupabase()
  const { data, error } = await service.storage
    .from('work-order-chat')
    .createSignedUrl(path, SIGN_TTL_SECONDS)
  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: error?.message ?? 'Failed to sign url' }, { status: 500 })
  }
  return NextResponse.json({ url: data.signedUrl })
}
