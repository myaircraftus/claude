/**
 * GET /api/work-orders/[id]/messages/sign-url?path=<storagePath>
 *
 * Mints a signed URL for an attachment in the `work-order-chat` storage bucket
 * so the chat panel can render images / audio / files without exposing the
 * raw storage path. The path must live under the work order's org prefix —
 * caller can't request someone else's file even if they know the path.
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServiceSupabase } from '@/lib/supabase/server'

interface RouteContext {
  params: { id: string }
}

const SIGN_TTL_SECONDS = 60 * 30 // 30 minutes

export async function GET(req: NextRequest, { params }: RouteContext) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const path = req.nextUrl.searchParams.get('path') ?? ''
  if (!path || path.includes('..')) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
  }

  // Path is `<orgId>/<woId>/<fileId>.<ext>` — verify both prefixes match.
  if (!path.startsWith(`${ctx.organizationId}/${params.id}/`)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const service = createServiceSupabase()
  const { data: wo } = await service
    .from('work_orders')
    .select('id')
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle()
  if (!wo) return NextResponse.json({ error: 'Work order not found' }, { status: 404 })

  const { data, error } = await service.storage
    .from('work-order-chat')
    .createSignedUrl(path, SIGN_TTL_SECONDS)

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: error?.message ?? 'Failed to sign url' }, { status: 500 })
  }
  return NextResponse.json({ url: data.signedUrl })
}
