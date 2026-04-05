// POST /api/scanner/batches/[id]/submit — finalize a batch and queue for processing
//
// Sets status=submitted, submitted_at=now. Downstream OCR pipeline picks this up.

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: batch } = await supabase
    .from('scan_batches')
    .select('id, organization_id, page_count, status')
    .eq('id', params.id)
    .single()
  if (!batch) return NextResponse.json({ error: 'Batch not found' }, { status: 404 })
  if (batch.page_count < 1) {
    return NextResponse.json({ error: 'Batch has no pages' }, { status: 400 })
  }
  if (batch.status !== 'capturing') {
    return NextResponse.json({ error: 'Batch already submitted' }, { status: 400 })
  }

  const now = new Date().toISOString()
  const { error } = await (supabase as any)
    .from('scan_batches')
    .update({ status: 'submitted', submitted_at: now })
    .eq('id', batch.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await (supabase as any).from('scan_batch_events').insert({
    scan_batch_id: batch.id,
    event_type: 'submitted',
    payload: { page_count: batch.page_count, submitted_at: now },
    created_by: user.id,
  })

  return NextResponse.json({ ok: true, status: 'submitted', submitted_at: now })
}
