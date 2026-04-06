import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()
  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let items: any[] = []
  try {
    const { data } = await supabase
      .from('review_queue_items')
      .select(`
        *,
        ocr_page_job:ocr_page_job_id(*),
        ocr_extracted_event:ocr_extracted_event_id(*)
      `)
      .eq('organization_id', membership.organization_id)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(30)
    items = data ?? []
  } catch {}

  return NextResponse.json({ items, count: items.length })
}

export async function PATCH(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()
  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { id, action, corrected_fields, extracted_event_id, notes } = body

  const statusMap: Record<string, string> = {
    approve: 'resolved',
    reject: 'resolved',
    unreadable: 'resolved',
    skip: 'skipped',
  }

  try {
    // 1. Update review queue item
    await supabase.from('review_queue_items').update({
      status: statusMap[action] ?? 'resolved',
      resolved_by: user.id,
      resolved_at: new Date().toISOString(),
      resolution_notes: notes ?? action,
    }).eq('id', id)

    if (action === 'approve') {
      // 2. Update ocr_extracted_event if provided
      if (extracted_event_id) {
        await supabase.from('ocr_extracted_events').update({
          review_status: 'approved',
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          ...(corrected_fields ?? {}),
        }).eq('id', extracted_event_id)
      }

      // 3. Fetch the review queue item to get the page job and review packet
      const { data: queueItem } = await supabase
        .from('review_queue_items')
        .select('ocr_page_job_id, review_packet, aircraft_id')
        .eq('id', id)
        .single()

      if (queueItem?.ocr_page_job_id && corrected_fields) {
        // 4. Fetch the page job for context
        const { data: pageJob } = await supabase
          .from('ocr_page_jobs')
          .select('document_id, page_number, page_classification, arbitration_score')
          .eq('id', queueItem.ocr_page_job_id)
          .single()

        if (pageJob) {
          const cf = corrected_fields as Record<string, any>

          // 5. Create canonical_maintenance_entry from reviewer-approved fields
          const { data: existingCanonical } = await supabase
            .from('canonical_maintenance_entries')
            .select('id')
            .eq('ocr_page_job_id', queueItem.ocr_page_job_id)
            .single()

          if (!existingCanonical) {
            await supabase.from('canonical_maintenance_entries').insert({
              organization_id: membership.organization_id,
              aircraft_id: queueItem.aircraft_id ?? null,
              document_id: pageJob.document_id,
              ocr_page_job_id: queueItem.ocr_page_job_id,
              source_page_number: pageJob.page_number,
              logbook_type: cf.logbook_type ?? null,
              entry_date: cf.event_date ?? cf.entry_date ?? null,
              tach_time: cf.tach_time != null ? parseFloat(String(cf.tach_time)) : null,
              total_time_airframe: cf.total_time_airframe != null ? parseFloat(String(cf.total_time_airframe)) : null,
              work_description: cf.work_description ?? null,
              work_type: cf.event_type ?? cf.work_type ?? null,
              mechanic_name: cf.mechanic_name ?? null,
              ap_cert_number: cf.mechanic_cert_number ?? cf.ap_cert_number ?? null,
              ia_cert_number: cf.ia_number ?? cf.ia_cert_number ?? null,
              return_to_service: cf.return_to_service === true || cf.return_to_service === 'true',
              ad_references: cf.ad_references
                ? (Array.isArray(cf.ad_references)
                    ? cf.ad_references
                    : typeof cf.ad_references === 'string'
                      ? cf.ad_references.split(',').map((s: string) => s.trim()).filter(Boolean)
                      : null)
                : null,
              inspection_type: cf.event_type === 'annual' || cf.event_type === '100hr'
                ? cf.event_type
                : null,
              confidence_overall: pageJob.arbitration_score ?? 1.0,
              review_status: 'human_approved',
              approved_by: user.id,
              approved_at: new Date().toISOString(),
              reviewer_notes: notes ?? null,
            })
          } else {
            // Update existing canonical entry with corrected fields
            await supabase.from('canonical_maintenance_entries').update({
              entry_date: cf.event_date ?? cf.entry_date ?? null,
              tach_time: cf.tach_time != null ? parseFloat(String(cf.tach_time)) : null,
              work_description: cf.work_description ?? null,
              work_type: cf.event_type ?? cf.work_type ?? null,
              mechanic_name: cf.mechanic_name ?? null,
              ap_cert_number: cf.mechanic_cert_number ?? cf.ap_cert_number ?? null,
              ia_cert_number: cf.ia_number ?? cf.ia_cert_number ?? null,
              return_to_service: cf.return_to_service === true || cf.return_to_service === 'true',
              ad_references: cf.ad_references
                ? (Array.isArray(cf.ad_references)
                    ? cf.ad_references
                    : typeof cf.ad_references === 'string'
                      ? cf.ad_references.split(',').map((s: string) => s.trim()).filter(Boolean)
                      : null)
                : null,
              review_status: 'human_approved',
              approved_by: user.id,
              approved_at: new Date().toISOString(),
              reviewer_notes: notes ?? null,
            }).eq('id', existingCanonical.id)
          }

          // 6. Update field_conflicts to resolved
          if (queueItem.ocr_page_job_id) {
            await supabase.from('field_conflicts')
              .update({ resolution_status: 'resolved', resolved_by: user.id, resolved_at: new Date().toISOString() })
              .eq('ocr_page_job_id', queueItem.ocr_page_job_id)
              .eq('resolution_status', 'pending')
          }

          // 7. Update ocr_page_job status to approved
          await supabase.from('ocr_page_jobs')
            .update({ extraction_status: 'approved' })
            .eq('id', queueItem.ocr_page_job_id)
        }
      }
    } else if (action === 'reject' || action === 'unreadable') {
      // Mark associated page job as rejected
      const { data: queueItem } = await supabase
        .from('review_queue_items')
        .select('ocr_page_job_id')
        .eq('id', id)
        .single()

      if (queueItem?.ocr_page_job_id) {
        await supabase.from('ocr_page_jobs')
          .update({ extraction_status: 'rejected' })
          .eq('id', queueItem.ocr_page_job_id)
      }

      if (extracted_event_id) {
        await supabase.from('ocr_extracted_events').update({
          review_status: 'rejected',
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          reviewer_notes: action === 'unreadable' ? 'Marked unreadable by reviewer' : (notes ?? 'Rejected by reviewer'),
        }).eq('id', extracted_event_id)
      }
    }
  } catch (err) {
    console.error('Review PATCH error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
