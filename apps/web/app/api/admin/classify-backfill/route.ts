/**
 * POST /api/admin/classify-backfill
 *
 * Sweeps every doc that's parked in the catch-all "Other documents" bucket
 * (document_detail_id = 'master_document_register' or NULL) and re-runs the
 * AI classifier on each to land it in a specific bucket: engine logbook,
 * airframe logbook, propeller logbook, POH, AD compliance, etc.
 *
 * Bounded — runs at most BATCH_SIZE classifications per call (so the
 * function returns in a reasonable time and doesn't burn the whole OpenAI
 * quota on a single click). Operator clicks the button repeatedly until
 * the count reaches zero.
 *
 * Platform-admin only.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { autoClassifyDocument } from '@/lib/documents/auto-classify'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 800

// Per-request cap. Auto-classify is one OpenAI call per doc (~$0.01-0.02).
// 25 per click means ~$0.25-0.50 per backfill run — small, predictable.
const BATCH_SIZE = 25

export async function POST(_req: NextRequest) {
  // 1. Auth — platform-admin only.
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('is_platform_admin')
    .eq('id', user.id)
    .single()
  if (!profile?.is_platform_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const service = createServiceSupabase()

  // 2. Find docs that need (re-)classification: stuck in master_document_register
  //    or with NULL document_detail_id, AND already past parsing (so chunks
  //    exist for the classifier to read).
  const { data: candidates, error } = await service
    .from('documents')
    .select('id, title, document_detail_id')
    .in('parsing_status', ['completed', 'needs_ocr'])
    .or('document_detail_id.is.null,document_detail_id.eq.master_document_register')
    .limit(BATCH_SIZE)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 3. Count remaining for the UI's progress bar.
  const { count: totalRemaining } = await service
    .from('documents')
    .select('id', { count: 'exact', head: true })
    .in('parsing_status', ['completed', 'needs_ocr'])
    .or('document_detail_id.is.null,document_detail_id.eq.master_document_register')

  if (!candidates || candidates.length === 0) {
    return NextResponse.json({
      ok: true,
      classified: 0,
      remaining: 0,
      message: 'No uncategorized documents remain.',
    })
  }

  // 4. Run classifier sequentially. Sequential (not parallel) so we don't
  //    overrun OpenAI per-minute rate limits on a big backfill.
  type ClassifyResultRow = {
    doc_id: string
    title: string
    doc_type: string | null
    detail_id: string | null
    error?: string
  }
  const results: ClassifyResultRow[] = []
  for (const doc of candidates) {
    try {
      const result = await autoClassifyDocument(service, doc.id as string)
      // Re-read the row to capture the detail_id our classifier wrote.
      const { data: updated } = await service
        .from('documents')
        .select('doc_type, document_detail_id')
        .eq('id', doc.id)
        .maybeSingle()
      results.push({
        doc_id: doc.id as string,
        title: doc.title as string,
        doc_type: result?.doc_type ?? null,
        detail_id: (updated?.document_detail_id as string) ?? null,
      })
    } catch (err) {
      results.push({
        doc_id: doc.id as string,
        title: doc.title as string,
        doc_type: null,
        detail_id: null,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return NextResponse.json({
    ok: true,
    classified: results.filter((r) => !r.error).length,
    failed: results.filter((r) => r.error).length,
    remaining: Math.max(0, (totalRemaining ?? 0) - results.length),
    results,
  })
}
