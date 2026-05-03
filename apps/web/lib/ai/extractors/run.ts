/**
 * Extraction orchestrator (Spec 7.3).
 *
 * Pipeline:
 *   1. Load intake_documents row + storage object → base64 attachment
 *   2. Cost cap: refuse > 20MB or unsupported mime
 *   3. Router classify (small Claude call)
 *   4. Specialist extract (cost-receipt | maintenance-invoice |
 *      insurance-declaration), retry once with strict prompt on
 *      schema-validation failure
 *   5. Aircraft match: regex tail-number → org's aircraft list
 *   6. Build extraction_results row + cost_entries rows
 *   7. Update intake_documents.status: extracted | review | rejected
 *
 * Idempotent: each call inserts a NEW extraction_results row + the
 * latest by created_at is canonical; the cost_entries it creates link
 * to that row via extraction_result_id, so a re-extraction creates
 * a new set of cost_entries the operator approves separately.
 *
 * NEVER blocks the upload response — the API routes call this with
 * `void runExtraction(...)`.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceSupabase } from '@/lib/supabase/server'
import { classifyDocument } from './router'
import { extractCostReceipt } from './cost-receipt'
import { extractMaintenanceInvoice } from './maintenance-invoice'
import { extractInsuranceDeclaration } from './insurance-declaration'
import { categorizeLineItem } from '@/lib/costs/categorizer'
import { DEFAULT_BUCKET, type CostBucket, type CostCategory } from '@/lib/costs/categories'
import type {
  CostReceipt,
  MaintenanceInvoice,
  InsuranceDeclaration,
  LineItem,
} from './schema'
import type { AnthropicAttachment } from '@/lib/ai/anthropic'

/** Auto-approve threshold per spec. */
const AUTO_APPROVE_EXTRACTION = 0.85
const AUTO_APPROVE_AIRCRAFT = 0.85
const MAX_BYTES = 20 * 1024 * 1024
const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg', 'image/png', 'image/webp', 'image/heic',
])

interface RunResult {
  ok: boolean
  intake_id: string
  status: 'extracted' | 'review' | 'rejected'
  extraction_result_id?: string
  cost_entries_created?: number
  error?: string
}

export async function runExtraction(args: { intake_document_id: string }): Promise<RunResult> {
  const service = createServiceSupabase()

  // 1. Load intake row.
  const { data: intakeRaw } = await service
    .from('intake_documents')
    .select('id, organization_id, storage_path, mime_type, file_size_bytes, status')
    .eq('id', args.intake_document_id)
    .maybeSingle()
  if (!intakeRaw) {
    return { ok: false, intake_id: args.intake_document_id, status: 'rejected', error: 'intake not found' }
  }
  const intake = intakeRaw as {
    id: string; organization_id: string; storage_path: string | null;
    mime_type: string | null; file_size_bytes: number | null; status: string;
  }

  if (!intake.storage_path) {
    await markRejected(service, intake.id, 'no storage_path on intake row')
    return { ok: false, intake_id: intake.id, status: 'rejected', error: 'no storage_path' }
  }
  if ((intake.file_size_bytes ?? 0) > MAX_BYTES) {
    await markRejected(service, intake.id, `file too large for extraction (${intake.file_size_bytes} bytes > ${MAX_BYTES})`)
    return { ok: false, intake_id: intake.id, status: 'rejected', error: 'too-large' }
  }
  if (intake.mime_type && !ALLOWED_MIME.has(intake.mime_type)) {
    await markRejected(service, intake.id, `unsupported mime ${intake.mime_type}`)
    return { ok: false, intake_id: intake.id, status: 'rejected', error: 'unsupported-mime' }
  }

  // Mark extracting (best-effort; ignore stale-state races).
  await service
    .from('intake_documents')
    .update({ status: 'extracting', extraction_started_at: new Date().toISOString() })
    .eq('id', intake.id)
    .eq('status', intake.status)

  // 2. Download + base64-encode the file. The bucket is private so we
  // can't pass a URL to Anthropic — base64 is the right path.
  const { data: blob, error: dlErr } = await service
    .storage.from('cost-receipts').download(intake.storage_path)
  if (dlErr || !blob) {
    await markFailed(service, intake.id, `download failed: ${dlErr?.message ?? 'unknown'}`)
    return { ok: false, intake_id: intake.id, status: 'rejected', error: 'download-failed' }
  }
  const base64 = Buffer.from(await blob.arrayBuffer()).toString('base64')
  const attachment: AnthropicAttachment = {
    kind: intake.mime_type === 'application/pdf' ? 'document' : 'image',
    media_type: intake.mime_type ?? 'application/pdf',
    data: base64,
  }

  // 3. Classify.
  let classification: Awaited<ReturnType<typeof classifyDocument>>
  try {
    classification = await classifyDocument(service, {
      organization_id: intake.organization_id,
      intake_document_id: intake.id,
      attachment,
    })
  } catch (e) {
    await markFailed(service, intake.id, `router error: ${msg(e)}`)
    return { ok: false, intake_id: intake.id, status: 'rejected', error: msg(e) }
  }

  if (classification.doc_kind === 'unknown' || classification.confidence < 0.4) {
    // Log a router-only extraction_results row for the audit trail, then
    // mark the intake rejected. Operator can re-classify manually.
    await service.from('extraction_results').insert({
      organization_id: intake.organization_id,
      intake_document_id: intake.id,
      extractor: 'router-only',
      model_used: 'claude-sonnet-4-5',
      parsed_fields: { classification },
      extraction_confidence: classification.confidence,
      status: 'manual_review_needed',
      error_message: `Classified as ${classification.doc_kind} (conf ${classification.confidence.toFixed(2)})`,
    })
    await markReview(service, intake.id, 'router classification below threshold')
    return { ok: true, intake_id: intake.id, status: 'review' }
  }

  // 4. Specialist extract (with one retry on schema mismatch).
  const specialist = classification.doc_kind
  type SpecialistRun =
    | Awaited<ReturnType<typeof extractCostReceipt>>
    | Awaited<ReturnType<typeof extractMaintenanceInvoice>>
    | Awaited<ReturnType<typeof extractInsuranceDeclaration>>

  let run: SpecialistRun
  try {
    run = await runSpecialist(service, specialist, {
      organization_id: intake.organization_id,
      intake_document_id: intake.id,
      attachment,
    })
    if (!run.data) {
      run = await runSpecialist(service, specialist, {
        organization_id: intake.organization_id,
        intake_document_id: intake.id,
        attachment,
        strict: true,
      })
    }
  } catch (e) {
    await markFailed(service, intake.id, `specialist error: ${msg(e)}`)
    return { ok: false, intake_id: intake.id, status: 'rejected', error: msg(e) }
  }

  if (!run.data) {
    // Persist an extraction_results row so the operator can see what
    // Claude returned + retry manually.
    const { data: ex } = await service
      .from('extraction_results')
      .insert({
        organization_id: intake.organization_id,
        intake_document_id: intake.id,
        extractor: specialist,
        model_used: 'claude-sonnet-4-5',
        raw_text: run.raw.slice(0, 4000),
        parsed_fields: {},
        extraction_confidence: 0,
        input_tokens: run.tokens.input,
        output_tokens: run.tokens.output,
        cost_usd_cents: run.tokens.cost_cents,
        duration_ms: run.tokens.duration_ms,
        status: 'manual_review_needed',
        error_message: 'Schema validation failed twice',
      })
      .select('id')
      .single()
    await markReview(service, intake.id, 'extractor schema mismatch')
    return {
      ok: true,
      intake_id: intake.id,
      status: 'review',
      extraction_result_id: (ex as { id: string } | null)?.id,
    }
  }

  // 5. Aircraft match.
  const tail = (run.data as { tail_number?: string | null }).tail_number ?? null
  const { aircraftId, aircraftMatchConfidence } = await matchAircraft(
    service,
    intake.organization_id,
    tail,
  )

  // 6. Total sanity check (cost-receipt + maintenance-invoice only).
  const sanity = sanityCheck(specialist, run.data)

  // Compose extraction_results row.
  const extractionConfidence = clamp01(
    (run.data as { extraction_confidence?: number }).extraction_confidence ?? 0.6,
  ) * (sanity.ok ? 1 : 0.7)

  const overallOk = extractionConfidence >= AUTO_APPROVE_EXTRACTION
    && (aircraftMatchConfidence ?? 1) >= (tail ? AUTO_APPROVE_AIRCRAFT : 0)
    && sanity.ok

  const status: 'success' | 'partial' | 'manual_review_needed' =
    overallOk ? 'success' : sanity.ok ? 'manual_review_needed' : 'partial'

  const { data: exRow, error: exErr } = await service
    .from('extraction_results')
    .insert({
      organization_id: intake.organization_id,
      intake_document_id: intake.id,
      extractor: specialist,
      model_used: 'claude-sonnet-4-5',
      raw_text: null,
      parsed_fields: run.data as object,
      extraction_confidence: extractionConfidence,
      aircraft_match_confidence: aircraftMatchConfidence,
      aircraft_id: aircraftId,
      input_tokens: run.tokens.input,
      output_tokens: run.tokens.output,
      cost_usd_cents: run.tokens.cost_cents,
      duration_ms: run.tokens.duration_ms,
      status,
      error_message: sanity.ok ? null : sanity.reason,
    })
    .select('id')
    .single()
  if (exErr || !exRow) {
    await markFailed(service, intake.id, `extraction_results insert failed: ${exErr?.message}`)
    return { ok: false, intake_id: intake.id, status: 'rejected', error: 'insert-failed' }
  }
  const extractionId = (exRow as { id: string }).id

  // 7. Build cost_entries rows. Insurance is a single line; receipts +
  // invoices generate one row per line item (categorized via heuristics).
  const costRows = buildCostEntries(specialist, run.data, {
    organization_id: intake.organization_id,
    aircraft_id: aircraftId,
    intake_document_id: intake.id,
    extraction_result_id: extractionId,
    auto_approve: overallOk,
  })

  let createdCount = 0
  if (costRows.length > 0) {
    const { error: ceErr, data: ceIns } = await service
      .from('cost_entries')
      .insert(costRows)
      .select('id')
    if (ceErr) {
      console.error('[extract] cost_entries insert error:', ceErr.message)
    } else if (ceIns) {
      createdCount = ceIns.length
      const ids = (ceIns as Array<{ id: string }>).map((r) => r.id)
      await service
        .from('intake_documents')
        .update({ resulting_cost_entry_ids: ids })
        .eq('id', intake.id)

      // Spec 7.8 — record an override row whenever the freshly-inserted
      // cost_entry replaces an older same-aircraft same-category 'estimated'
      // entry for the same month. Audit-only — we don't delete the older
      // row; the calculator picks up the higher-priority entry naturally
      // because cost_entries are summed independently.
      try {
        const { recordOverride } = await import('@/lib/source-priority/audit')
        for (let i = 0; i < costRows.length; i++) {
          const inserted = costRows[i]
          const newId = ids[i]
          if (!newId) continue
          const date = inserted.cost_date as string
          const month = date.slice(0, 7) // 'YYYY-MM'
          const { data: priorEstimates } = await service
            .from('cost_entries')
            .select('id, source, source_priority, amount, cost_date, category')
            .eq('organization_id', intake.organization_id)
            .eq('aircraft_id', aircraftId)
            .eq('category', inserted.category as string)
            .eq('source', 'estimated')
            .gte('cost_date', `${month}-01`)
            .lte('cost_date', `${month}-31`)
          for (const prior of (priorEstimates ?? [])) {
            const p = prior as { id: string; source: string; source_priority: number; amount: number; cost_date: string }
            if (p.id === newId) continue
            await recordOverride(service, {
              organization_id: intake.organization_id,
              entity_type: 'cost_entry',
              entity_id: newId,
              field_name: 'amount',
              old_value: { id: p.id, amount: p.amount, cost_date: p.cost_date },
              new_value: { amount: inserted.amount, cost_date: inserted.cost_date },
              old_source: p.source,
              old_priority: p.source_priority,
              new_source: 'extracted',
              document_id: intake.id,
              triggered_by: null,
              notes: `Receipt-extracted entry replaces estimated ${inserted.category} for ${month}`,
            })
          }
        }
      } catch (e) {
        console.warn('[source-priority] override audit failed:', e)
      }
    }
  }

  // 8. Final intake status.
  const finalStatus: 'extracted' | 'review' = overallOk ? 'extracted' : 'review'
  await service
    .from('intake_documents')
    .update({
      status: finalStatus,
      extraction_completed_at: new Date().toISOString(),
      error_message: null,
    })
    .eq('id', intake.id)

  return {
    ok: true,
    intake_id: intake.id,
    status: finalStatus,
    extraction_result_id: extractionId,
    cost_entries_created: createdCount,
  }
}

/* ─── Helpers ──────────────────────────────────────────────────────── */

function runSpecialist(
  supabase: SupabaseClient,
  kind: 'cost-receipt' | 'maintenance-invoice' | 'insurance-declaration',
  args: { organization_id: string; intake_document_id: string; attachment: AnthropicAttachment; strict?: boolean },
) {
  switch (kind) {
    case 'cost-receipt':           return extractCostReceipt(supabase, args)
    case 'maintenance-invoice':    return extractMaintenanceInvoice(supabase, args)
    case 'insurance-declaration':  return extractInsuranceDeclaration(supabase, args)
  }
}

async function matchAircraft(
  supabase: SupabaseClient,
  orgId: string,
  tail: string | null,
): Promise<{ aircraftId: string | null; aircraftMatchConfidence: number | null }> {
  if (!tail) return { aircraftId: null, aircraftMatchConfidence: null }
  const normalized = tail.replace(/[^A-Z0-9-]/gi, '').toUpperCase()
  if (!normalized) return { aircraftId: null, aircraftMatchConfidence: null }

  // Exact match preferred.
  const { data: exact } = await supabase
    .from('aircraft')
    .select('id, tail_number')
    .eq('organization_id', orgId)
    .ilike('tail_number', normalized)
    .maybeSingle()
  if (exact) return { aircraftId: (exact as { id: string }).id, aircraftMatchConfidence: 1.0 }

  // Loose match: strip leading 'N' (US default) and compare.
  const stripped = normalized.replace(/^N/, '')
  const { data: rows } = await supabase
    .from('aircraft')
    .select('id, tail_number')
    .eq('organization_id', orgId)
    .limit(50)
  for (const a of (rows ?? []) as Array<{ id: string; tail_number: string }>) {
    const cmp = a.tail_number.replace(/[^A-Z0-9]/gi, '').toUpperCase().replace(/^N/, '')
    if (cmp === stripped) return { aircraftId: a.id, aircraftMatchConfidence: 0.9 }
  }
  return { aircraftId: null, aircraftMatchConfidence: 0.0 }
}

function sanityCheck(
  kind: 'cost-receipt' | 'maintenance-invoice' | 'insurance-declaration',
  data: CostReceipt | MaintenanceInvoice | InsuranceDeclaration,
): { ok: boolean; reason?: string } {
  if (kind === 'insurance-declaration') return { ok: true }
  const total = (data as { total_amount?: number | null }).total_amount ?? null
  const lines = (data as { line_items?: LineItem[] }).line_items ?? []
  if (total == null || lines.length === 0) return { ok: true } // can't check
  const sum = lines.reduce((s, li) => s + Number(li.amount ?? 0), 0)
  const diff = Math.abs(sum - total)
  if (diff > 1) return { ok: false, reason: `line-item sum $${sum.toFixed(2)} differs from total $${total.toFixed(2)} by $${diff.toFixed(2)}` }
  return { ok: true }
}

function buildCostEntries(
  kind: 'cost-receipt' | 'maintenance-invoice' | 'insurance-declaration',
  data: CostReceipt | MaintenanceInvoice | InsuranceDeclaration,
  ctx: {
    organization_id: string
    aircraft_id: string | null
    intake_document_id: string
    extraction_result_id: string
    auto_approve: boolean
  },
): Array<Record<string, unknown>> {
  const approved = false  // always queued for one-click approve, even at high confidence
  const source: 'extracted' = 'extracted'
  const source_priority = ctx.auto_approve ? 4 : 3

  if (kind === 'insurance-declaration') {
    const d = data as InsuranceDeclaration
    if (!d.annual_premium) return []
    const date = d.policy_period_start ?? new Date().toISOString().slice(0, 10)
    return [{
      organization_id: ctx.organization_id,
      aircraft_id: ctx.aircraft_id,
      category: 'insurance' as CostCategory,
      bucket: DEFAULT_BUCKET.insurance,
      vendor_id: null,
      description: `${d.carrier ?? 'Insurance'} — annual premium${d.policy_number ? ` · ${d.policy_number}` : ''}`,
      amount: round2(d.annual_premium),
      currency: d.currency ?? 'USD',
      cost_date: date,
      is_estimate: false,
      source,
      source_priority,
      intake_document_id: ctx.intake_document_id,
      extraction_result_id: ctx.extraction_result_id,
      approved,
      notes: d.notes ?? null,
    }]
  }

  // cost-receipt and maintenance-invoice both use line_items + a date.
  const r = data as CostReceipt | MaintenanceInvoice
  const date = r.date ?? new Date().toISOString().slice(0, 10)
  const baseDesc = (data as MaintenanceInvoice).invoice_number
    ? `${r.vendor ?? 'Vendor'} · ${(data as MaintenanceInvoice).invoice_number}`
    : (r.vendor ?? null)

  const out: Array<Record<string, unknown>> = []
  for (const li of r.line_items ?? []) {
    if (li.amount == null || li.amount <= 0) continue
    const { category, bucket } = categorizeLineItem({ description: li.description, hint: li.category_hint })
    out.push({
      organization_id: ctx.organization_id,
      aircraft_id: ctx.aircraft_id,
      category,
      bucket,
      vendor_id: null,
      description: baseDesc ? `${baseDesc} — ${li.description}` : li.description,
      amount: round2(li.amount),
      currency: r.currency ?? 'USD',
      cost_date: date,
      is_estimate: false,
      source,
      source_priority,
      intake_document_id: ctx.intake_document_id,
      extraction_result_id: ctx.extraction_result_id,
      approved,
      notes: r.notes ?? null,
    })
  }
  return out
}

async function markRejected(supabase: SupabaseClient, intakeId: string, reason: string) {
  await supabase
    .from('intake_documents')
    .update({ status: 'rejected', error_message: reason, extraction_completed_at: new Date().toISOString() })
    .eq('id', intakeId)
}

async function markFailed(supabase: SupabaseClient, intakeId: string, reason: string) {
  await supabase
    .from('intake_documents')
    .update({ status: 'rejected', error_message: reason, extraction_completed_at: new Date().toISOString() })
    .eq('id', intakeId)
}

async function markReview(supabase: SupabaseClient, intakeId: string, reason: string) {
  await supabase
    .from('intake_documents')
    .update({ status: 'review', error_message: reason, extraction_completed_at: new Date().toISOString() })
    .eq('id', intakeId)
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(1, n))
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
