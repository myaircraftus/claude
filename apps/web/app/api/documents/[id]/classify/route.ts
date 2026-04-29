/**
 * POST /api/documents/[id]/classify
 *
 * "Reclassify with AI" — runs autoClassifyDocument against the doc's chunks
 * and updates doc_type / document_subtype. Used by the per-row sparkles
 * button on the Aircraft Documents tab when the AI got the bucket wrong on
 * upload and the user wants the LLM to take another pass.
 */

import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServiceSupabase } from '@/lib/supabase/server'
import { autoClassifyDocument } from '@/lib/documents/auto-classify'

export const runtime = 'nodejs'
export const maxDuration = 60

interface RouteContext {
  params: { id: string }
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceSupabase()

  // Belt-and-suspenders ownership check before invoking the helper, which
  // uses service-role and would otherwise classify any doc by id.
  const { data: doc } = await service
    .from('documents')
    .select('id')
    .eq('id', params.id)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle()
  if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

  const result = await autoClassifyDocument(service as any, params.id)
  if (!result) {
    return NextResponse.json(
      { error: 'No OCR text or classifier unavailable' },
      { status: 409 },
    )
  }

  return NextResponse.json(result)
}
