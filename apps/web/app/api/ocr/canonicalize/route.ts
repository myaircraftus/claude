import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'

// POST /api/ocr/canonicalize
//
// Creates a canonical maintenance_event from an approved OCR extraction.
// Idempotent: if a canonical record already exists for this page, returns it.
//
// Body: { page_id: string, corrected_fields?: Record<string, string | null> }

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { page_id, corrected_fields } = body as {
    page_id: string
    corrected_fields?: Record<string, string | null>
  }
  if (!page_id) return NextResponse.json({ error: 'page_id required' }, { status: 400 })

  const service = createServiceSupabase()

  // ── Load page job + document context ─────────────────────────────────────
  const { data: page } = await supabase
    .from('ocr_page_jobs')
    .select(
      `*, document:document_id(id, title, organization_id, aircraft_id)`
    )
    .eq('id', page_id)
    .single()

  if (!page) return NextResponse.json({ error: 'Page not found' }, { status: 404 })

  const doc = (page as any).document
  const orgId: string = doc?.organization_id
  const aircraftId: string | null = doc?.aircraft_id ?? null
  const documentId: string | null = doc?.id ?? null

  if (!orgId) return NextResponse.json({ error: 'Cannot determine org' }, { status: 400 })

  // ── Idempotency: check if canonical record already exists ─────────────────
  const { data: existing } = await service
    .from('maintenance_events')
    .select('id')
    .eq('source_page_id', page_id)
    .eq('canonicalization_status', 'canonical')
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ maintenance_event_id: existing.id, created: false })
  }

  // ── Load the approved extracted event ────────────────────────────────────
  const { data: event } = await service
    .from('ocr_extracted_events')
    .select('*')
    .eq('ocr_page_job_id', page_id)
    .maybeSingle()

  // ── Merge corrected_fields over the event data ────────────────────────────
  const base = event ?? {}
  const merged = { ...base, ...(corrected_fields ?? {}) }

  // ── Parse ad_references ───────────────────────────────────────────────────
  let adRefs: string[] = []
  if (corrected_fields?.ad_reference) {
    adRefs = corrected_fields.ad_reference
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  } else if (Array.isArray(base.ad_references)) {
    adRefs = base.ad_references as string[]
  }

  // ── Build event_type ──────────────────────────────────────────────────────
  const eventType =
    corrected_fields?.event_type ??
    base.event_type ??
    base.logbook_type ??
    'maintenance'

  // ── Get arbitration confidence ────────────────────────────────────────────
  const recordConfidence =
    (page as any).arbitration_confidence ?? (page as any).ocr_confidence ?? null

  // ── Insert canonical maintenance_event ───────────────────────────────────
  const { data: newEvent, error: insertError } = await service
    .from('maintenance_events')
    .insert({
      organization_id: orgId,
      aircraft_id: aircraftId,
      document_id: documentId,
      source_page: page.page_number,
      source_page_id: page_id,
      event_date: merged.event_date ?? null,
      event_type: eventType,
      description: merged.work_description ?? merged.description ?? null,
      mechanic_name: merged.mechanic_name ?? null,
      mechanic_cert: merged.mechanic_cert_number ?? merged.mechanic_cert ?? null,
      ia_cert_number: merged.ia_number ?? merged.ia_cert_number ?? null,
      airframe_tt: merged.airframe_tt ? parseFloat(String(merged.airframe_tt)) : null,
      tach_time: merged.tach_time ? parseFloat(String(merged.tach_time)) : null,
      tsmoh: merged.tsmoh ? parseFloat(String(merged.tsmoh)) : null,
      ata_chapter: merged.ata_chapter ?? null,
      part_numbers: adRefs.length > 0 ? null : (base.part_numbers ?? null),
      ad_reference:
        adRefs.length > 0 ? adRefs[0] : (Array.isArray(base.ad_references) ? base.ad_references[0] : null),
      far_references: base.far_references ?? null,
      return_to_service: base.return_to_service ?? false,
      raw_text: base.raw_text ?? page.ocr_raw_text ?? null,
      confidence: recordConfidence,
      record_confidence: recordConfidence,
      is_verified: true,
      canonicalization_status: 'canonical',
    })
    .select('id')
    .single()

  if (insertError || !newEvent) {
    console.error('[canonicalize] insert error:', insertError)
    return NextResponse.json({ error: 'Failed to create canonical record' }, { status: 500 })
  }

  const eventId = newEvent.id

  // ── Mark extracted event as linked ───────────────────────────────────────
  if (event?.id) {
    await service
      .from('ocr_extracted_events')
      .update({
        review_status: 'approved',
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        linked_maintenance_event_id: eventId,
      })
      .eq('id', event.id)
  }

  // ── Insert evidence link ──────────────────────────────────────────────────
  await service.from('maintenance_entry_evidence').insert({
    maintenance_event_id: eventId,
    page_id,
    document_id: documentId,
    snippet: page.ocr_raw_text
      ? page.ocr_raw_text.slice(0, 500)
      : null,
    source_engine: 'primary_ocr',
    confidence: recordConfidence,
  })

  // ── Mark page as canonicalized ────────────────────────────────────────────
  await service
    .from('ocr_page_jobs')
    .update({
      extraction_status: 'approved',
      updated_at: new Date().toISOString(),
    })
    .eq('id', page_id)

  // ── Resolve the review queue item if present ──────────────────────────────
  await service
    .from('review_queue_items')
    .update({
      status: 'resolved',
      resolved_by: user.id,
      resolved_at: new Date().toISOString(),
      resolution_notes: 'Canonicalized by reviewer',
    })
    .eq('ocr_page_job_id', page_id)
    .eq('status', 'pending')

  return NextResponse.json({ maintenance_event_id: eventId, created: true })
}
