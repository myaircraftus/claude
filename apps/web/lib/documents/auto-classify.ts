/**
 * Auto-classify a document using GPT-4o on its first ~12 chunks.
 *
 * Used by:
 *   - the inline ingestion pipeline (lib/ingestion/server.ts) — runs after
 *     embedding completes so newly uploaded docs land in the right bucket
 *   - POST /api/documents/[id]/classify — manual "Reclassify with AI" from
 *     the Aircraft Documents tab when the user wants to override the bucket
 *
 * Always uses service-role to bypass RLS. Read-mostly: reads chunks, writes
 * a single UPDATE on the documents row.
 */

import OpenAI from 'openai'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { DocType } from '@/types'

const VALID_DOC_TYPES: ReadonlyArray<DocType> = [
  'logbook',
  'poh',
  'afm',
  'afm_supplement',
  'maintenance_manual',
  'service_manual',
  'parts_catalog',
  'service_bulletin',
  'airworthiness_directive',
  'work_order',
  'inspection_report',
  'form_337',
  'form_8130',
  'lease_ownership',
  'insurance',
  'compliance',
  'miscellaneous',
] as const

const LOGBOOK_SUBTYPES = ['engine_logbook', 'airframe_logbook', 'prop_logbook'] as const
type LogbookSubtype = (typeof LOGBOOK_SUBTYPES)[number]

const SYSTEM_PROMPT = `You classify aircraft maintenance documents.

Given the title and a sample of OCR text from a PDF, pick the single best
DocType:

  logbook (with subtype: engine_logbook | airframe_logbook | prop_logbook)
  poh, afm, afm_supplement
  maintenance_manual, service_manual, parts_catalog
  service_bulletin, airworthiness_directive
  work_order, inspection_report, form_337, form_8130
  lease_ownership, insurance, compliance, miscellaneous

Engine logbooks reference cylinders, SMOH, oil changes, magnetos, valve
cover gaskets. Airframe logbooks cover annuals, ADs, Pitot-static,
transponder, ELT, weight & balance. Prop logbooks reference propeller
overhauls, blade dressings.

Respond as strict JSON: { "doc_type": "...", "subtype": "..." | null,
"reasoning": "1 short sentence" }
No extra text.`

export interface ClassifyResult {
  doc_type: DocType
  subtype: LogbookSubtype | null
  reasoning: string | null
}

export async function autoClassifyDocument(
  supabase: SupabaseClient,
  documentId: string,
): Promise<ClassifyResult | null> {
  if (!process.env.OPENAI_API_KEY) return null

  const { data: doc } = await supabase
    .from('documents')
    .select('id, title, file_name')
    .eq('id', documentId)
    .maybeSingle()
  if (!doc) return null

  const { data: chunks } = await supabase
    .from('document_chunks')
    .select('chunk_text')
    .eq('document_id', documentId)
    .order('chunk_index', { ascending: true })
    .limit(12)

  let combined = ''
  for (const c of chunks ?? []) {
    const s = (c.chunk_text ?? '').replace(/\s+/g, ' ').trim()
    if (!s) continue
    if (combined.length + s.length > 6000) break
    combined += (combined ? '\n---\n' : '') + s
  }
  if (!combined) return null

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  let parsed: { doc_type?: string; subtype?: string | null; reasoning?: string }
  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_CHAT_MODEL || 'gpt-4o',
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 200,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `TITLE: ${doc.title ?? doc.file_name ?? '(untitled)'}\nFILENAME: ${doc.file_name ?? ''}\n\nSAMPLE TEXT:\n${combined}`,
        },
      ],
    })
    parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}')
  } catch (err) {
    // 429 / network / parse failures are non-fatal — leave the row alone.
    console.warn(`[auto-classify] LLM call failed for ${documentId}:`, err)
    return null
  }

  const docType: DocType = VALID_DOC_TYPES.includes(parsed.doc_type as DocType)
    ? (parsed.doc_type as DocType)
    : 'miscellaneous'
  const subtype: LogbookSubtype | null =
    docType === 'logbook' && LOGBOOK_SUBTYPES.includes(parsed.subtype as LogbookSubtype)
      ? (parsed.subtype as LogbookSubtype)
      : null

  await supabase
    .from('documents')
    .update({
      doc_type: docType,
      document_subtype: subtype,
      updated_at: new Date().toISOString(),
    })
    .eq('id', documentId)

  return {
    doc_type: docType,
    subtype,
    reasoning: parsed.reasoning ?? null,
  }
}
