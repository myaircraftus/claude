/**
 * POST /api/inbox/classify
 *
 * On-demand: re-run the inbox.classifier (and matching extractor) on
 * an existing inbox_messages row. Used by:
 *   - the inbox UI's "Re-process" button when AI got it wrong
 *   - the admin /admin/agents page "Run now" button (future)
 *
 * Body: { message_id: string }
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { classifyInboxMessage } from '@/lib/agents/impl/inbox-classifier'
import { extractExpenseFromInbox } from '@/lib/agents/impl/inbox-expense-extractor'
import { parseEstimateFromInbox } from '@/lib/agents/impl/inbox-estimate-parser'
import { importInvoiceFromInbox } from '@/lib/agents/impl/inbox-invoice-importer'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as { message_id?: string }
  if (!body.message_id) {
    return NextResponse.json({ error: 'message_id required' }, { status: 400 })
  }

  const service = createServiceSupabase()
  const { data: msg } = await service
    .from('inbox_messages')
    .select('id, user_id, organization_id, from_addr, subject, body_text, attachments')
    .eq('id', body.message_id)
    .maybeSingle()
  if (!msg) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (msg.user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const attachments = (msg.attachments as Array<{ filename?: string }> | null) ?? []
  const classifyResult = await classifyInboxMessage({
    supabase: service,
    triggeredBy: user.id,
    messageId: msg.id,
    from: msg.from_addr,
    subject: msg.subject,
    body: msg.body_text,
    attachmentNames: attachments.map((a) => a.filename ?? 'attachment'),
  })

  const category = classifyResult.output?.category ?? 'other'
  const confidence = classifyResult.output?.confidence ?? 'low'

  let extractorResult: { ok?: boolean; runId?: string } | null = null
  if (
    confidence !== 'low' &&
    confidence !== 'refused' &&
    ['receipt', 'estimate', 'invoice'].includes(category)
  ) {
    const extractorArgs = {
      supabase: service,
      triggeredBy: user.id,
      messageId: msg.id,
      orgId: msg.organization_id,
      userId: user.id,
      subject: msg.subject,
      body: msg.body_text,
      from: msg.from_addr,
    }
    if (category === 'receipt') extractorResult = await extractExpenseFromInbox(extractorArgs)
    else if (category === 'estimate') extractorResult = await parseEstimateFromInbox(extractorArgs)
    else if (category === 'invoice') extractorResult = await importInvoiceFromInbox(extractorArgs)
  }

  return NextResponse.json({
    ok: true,
    classified_as: category,
    confidence,
    extractor: extractorResult ? { ok: extractorResult.ok, run_id: extractorResult.runId } : null,
  })
}
