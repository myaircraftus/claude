import { task, logger } from "@trigger.dev/sdk/v3";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface IngestPayload {
  documentId: string;
}

interface DocumentRecord {
  id: string;
  file_path: string;
  organization_id: string;
  aircraft_id: string | null;
  doc_type: string;
  title: string;
  file_name: string;
  mime_type: string;
}

interface ParsedPage {
  page_number: number;
  text: string;
  width?: number;
  height?: number;
  is_ocr?: boolean;
}

interface ParsedChunk {
  chunk_index: number;
  page_number: number;
  page_number_end?: number;
  section_title?: string;
  parent_section?: string;
  chunk_text: string;
  token_count?: number;
  char_count?: number;
  parser_confidence?: number;
  metadata_json?: Record<string, unknown>;
}

interface IngestResponse {
  is_text_native: boolean;
  page_count: number;
  pages: ParsedPage[];
  chunks: ParsedChunk[];
}

interface MetadataResponse {
  maintenance_events?: Array<{
    event_date?: string;
    event_type?: string;
    description?: string;
    mechanic_name?: string;
    mechanic_cert?: string;
    shop_name?: string;
    airframe_tt?: number;
    tach_time?: number;
    parts_replaced?: Record<string, unknown>;
    ad_reference?: string;
    sb_reference?: string;
    raw_text?: string;
    confidence?: number;
    source_page?: number;
  }>;
}

// ─── Godmode Pipeline Types ───────────────────────────────────────────────────

interface PagePipelineResult {
  page_number: number;
  page_type: string;
  classification_confidence: number;
  extraction_strategy: string;
  is_compliance_critical: boolean;
  page_quality_score: number;
  is_blank: boolean;
  is_double_spread: boolean;
  preprocessing_metadata: Record<string, unknown>;
  extraction_runs: Array<{
    engine_name: string;
    engine_type: string;
    raw_text: string;
    raw_output: Record<string, unknown>;
    confidence_score: number;
    field_candidates: Record<string, unknown>;
    processing_ms: number;
    error_message: string | null;
  }>;
  combined_candidates: Record<string, Array<{engine: string; value: unknown; confidence: number}>>;
  validation_results: Record<string, {
    validation_status: string;
    validation_notes: string;
    confidence_adjustment: number;
    normalized_value: unknown;
  }>;
  conflicts: Array<{
    field_name: string;
    candidate_values: unknown[];
    conflict_reason: string;
    severity: string;
    resolution_status: string;
  }>;
  disposition: string;
  arbitration_score: number;
  review_reasons: string[];
  needs_human_review: boolean;
  recommended_fields: Record<string, unknown>;
  review_packet: Record<string, unknown>;
  best_text: string;
}

interface PipelineResponse {
  document_id: string;
  is_text_native: boolean;
  total_pages: number;
  processed_pages: number;
  page_results: PagePipelineResult[];
  auto_accepted_count: number;
  review_required_count: number;
  rejected_count: number;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function createServiceClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function batchInsert<T extends Record<string, unknown>>(
  supabase: ReturnType<typeof createClient>,
  table: string,
  rows: T[],
  batchSize = 50
): Promise<void> {
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase.from(table).insert(batch);
    if (error) {
      throw new Error(`Failed to insert into ${table}: ${error.message}`);
    }
  }
}

// Determine if a doc_type should run through the godmode pipeline
function shouldUsePipeline(docType: string): boolean {
  const pipelineTypes = ["logbook", "maintenance_log", "airframe_log", "engine_log", "prop_log", "avionics_log", "work_order", "ad", "airworthiness_directive", "faa_form"];
  return pipelineTypes.some(t => docType.toLowerCase().includes(t));
}

// ─── Task ──────────────────────────────────────────────────────────────────────

export const ingestDocument = task({
  id: "ingest-document",
  maxDuration: 900,  // increased for godmode pipeline
  retry: {
    maxAttempts: 3,
  },

  run: async (payload: IngestPayload) => {
    const { documentId } = payload;
    const startTime = Date.now();

    logger.info("Starting document ingestion", { documentId });

    const supabase = createServiceClient();

    // 1. Fetch document record
    const { data: doc, error: fetchError } = await supabase
      .from("documents")
      .select("id, file_path, organization_id, aircraft_id, doc_type, title, file_name, mime_type")
      .eq("id", documentId)
      .single<DocumentRecord>();

    if (fetchError || !doc) {
      throw new Error(`Document not found: ${documentId} — ${fetchError?.message ?? "unknown error"}`);
    }

    logger.info("Fetched document record", { documentId, docType: doc.doc_type, title: doc.title });

    try {
      // 2. Update status to 'parsing'
      await supabase
        .from("documents")
        .update({ parsing_status: "parsing", parse_started_at: new Date().toISOString(), parse_error: null })
        .eq("id", documentId);

      // 3. Generate signed URL
      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from("aircraft-documents")
        .createSignedUrl(doc.file_path, 3600);

      if (signedUrlError || !signedUrlData?.signedUrl) {
        throw new Error(`Failed to generate signed URL: ${signedUrlError?.message ?? "no URL returned"}`);
      }

      const fileUrl = signedUrlData.signedUrl;
      const parserServiceUrl = process.env.PARSER_SERVICE_URL;
      const internalSecret = process.env.INTERNAL_SECRET;

      if (!parserServiceUrl) throw new Error("PARSER_SERVICE_URL is required");

      // ─── GODMODE PIPELINE PATH ────────────────────────────────────────────
      if (shouldUsePipeline(doc.doc_type)) {
        logger.info("Using godmode accuracy pipeline", { documentId, docType: doc.doc_type });

        await supabase.from("documents").update({ parsing_status: "parsing" }).eq("id", documentId);

        // Fetch aircraft context for validation
        let aircraftContext: Record<string, unknown> | null = null;
        if (doc.aircraft_id) {
          const { data: aircraft } = await supabase
            .from("aircraft")
            .select("make, model, year, total_time_airframe, last_maintenance_date")
            .eq("id", doc.aircraft_id)
            .single();
          if (aircraft) {
            aircraftContext = {
              manufacture_year: aircraft.year,
              last_known_tach: aircraft.total_time_airframe,
            };
          }
        }

        // Call POST /pipeline
        const pipelineRes = await fetch(`${parserServiceUrl}/pipeline`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(internalSecret ? { "X-Internal-Secret": internalSecret } : {}),
          },
          body: JSON.stringify({
            document_id: doc.id,
            file_url: fileUrl,
            org_id: doc.organization_id,
            aircraft_id: doc.aircraft_id,
            doc_type: doc.doc_type,
            title: doc.title,
            aircraft_context: aircraftContext,
          }),
        });

        if (!pipelineRes.ok) {
          const errText = await pipelineRes.text();
          throw new Error(`Pipeline /pipeline returned ${pipelineRes.status}: ${errText}`);
        }

        const pipelineData: PipelineResponse = await pipelineRes.json();

        logger.info("Pipeline completed", {
          documentId,
          totalPages: pipelineData.total_pages,
          autoAccepted: pipelineData.auto_accepted_count,
          reviewRequired: pipelineData.review_required_count,
          rejected: pipelineData.rejected_count,
        });

        // Update document metadata
        await supabase.from("documents").update({
          is_text_native: pipelineData.is_text_native,
          page_count: pipelineData.total_pages,
          parsing_status: "chunking",
        }).eq("id", documentId);

        // Store ocr_page_jobs + extraction results
        for (const pageResult of pipelineData.page_results) {
          // 1. Upsert ocr_page_job
          const { data: pageJob, error: pageJobError } = await supabase
            .from("ocr_page_jobs")
            .upsert({
              document_id: documentId,
              organization_id: doc.organization_id,
              aircraft_id: doc.aircraft_id,
              page_number: pageResult.page_number,
              page_classification: pageResult.page_type,
              classification_confidence: pageResult.classification_confidence,
              ocr_raw_text: pageResult.best_text,
              ocr_confidence: pageResult.extraction_runs.length > 0
                ? Math.max(...pageResult.extraction_runs.map(r => r.confidence_score))
                : null,
              page_quality_score: pageResult.page_quality_score,
              preprocessing_metadata: pageResult.preprocessing_metadata,
              arbitration_result: pageResult.disposition,
              arbitration_score: pageResult.arbitration_score,
              arbitration_metadata: {
                review_reasons: pageResult.review_reasons,
                conflict_count: pageResult.conflicts.length,
                extraction_strategy: pageResult.extraction_strategy,
              },
              extraction_status: pageResult.needs_human_review ? "needs_review" : "extracted",
              needs_human_review: pageResult.needs_human_review,
              review_reason: pageResult.review_reasons.length > 0
                ? pageResult.review_reasons.join("; ")
                : null,
              processed_at: new Date().toISOString(),
            }, { onConflict: "document_id,page_number" })
            .select("id")
            .single();

          if (pageJobError || !pageJob) {
            logger.warn("Failed to upsert ocr_page_job", { documentId, pageNumber: pageResult.page_number, error: pageJobError?.message });
            continue;
          }

          const pageJobId = pageJob.id;

          // 2. Store extraction_runs
          if (pageResult.extraction_runs.length > 0) {
            const runRows = pageResult.extraction_runs.map(run => ({
              ocr_page_job_id: pageJobId,
              document_id: documentId,
              organization_id: doc.organization_id,
              engine_name: run.engine_name,
              engine_type: run.engine_type,
              raw_text: run.raw_text || null,
              raw_output: run.raw_output || {},
              confidence_score: run.confidence_score,
              processing_ms: run.processing_ms,
              error_message: run.error_message || null,
            }));
            try {
              await batchInsert(supabase, "extraction_runs", runRows, 10);
            } catch (e) {
              logger.warn("Failed to insert extraction_runs", { pageJobId, error: String(e) });
            }
          }

          // 3. Store extracted_field_candidates
          const fieldCandidateRows: Record<string, unknown>[] = [];
          for (const [fieldName, candidates] of Object.entries(pageResult.combined_candidates)) {
            const candArray = candidates as Array<{engine: string; value: unknown; confidence: number}>;
            for (const cand of candArray) {
              const valResult = pageResult.validation_results[fieldName];
              fieldCandidateRows.push({
                ocr_page_job_id: pageJobId,
                document_id: documentId,
                organization_id: doc.organization_id,
                field_name: fieldName,
                raw_value: cand.value !== null ? String(cand.value) : null,
                normalized_value: valResult?.normalized_value !== undefined
                  ? String(valResult.normalized_value)
                  : (cand.value !== null ? String(cand.value) : null),
                source_engine: cand.engine,
                confidence: cand.confidence,
                validation_status: valResult?.validation_status ?? "unchecked",
                validation_notes: valResult?.validation_notes ?? null,
              });
            }
          }
          if (fieldCandidateRows.length > 0) {
            try {
              await batchInsert(supabase, "extracted_field_candidates", fieldCandidateRows, 50);
            } catch (e) {
              logger.warn("Failed to insert field_candidates", { pageJobId, error: String(e) });
            }
          }

          // 4. Store field_conflicts
          if (pageResult.conflicts.length > 0) {
            const conflictRows = pageResult.conflicts.map(c => ({
              ocr_page_job_id: pageJobId,
              document_id: documentId,
              organization_id: doc.organization_id,
              field_name: c.field_name,
              candidate_values: c.candidate_values,
              conflict_reason: c.conflict_reason,
              severity: c.severity,
              resolution_status: "pending",
            }));
            try {
              await batchInsert(supabase, "field_conflicts", conflictRows, 20);
            } catch (e) {
              logger.warn("Failed to insert field_conflicts", { pageJobId, error: String(e) });
            }
          }

          // 5. Store ocr_extracted_events (for auto-accepted pages)
          if (!pageResult.needs_human_review && !pageResult.is_blank) {
            const rf = pageResult.recommended_fields;
            const adRefs = rf.ad_references;
            const partNums = rf.part_numbers;
            const serNums = rf.serial_numbers;
            const farRefs = rf.far_references;
            const manRefs = rf.manual_references;

            const { data: extractedEvent } = await supabase
              .from("ocr_extracted_events")
              .insert({
                ocr_page_job_id: pageJobId,
                document_id: documentId,
                organization_id: doc.organization_id,
                aircraft_id: doc.aircraft_id,
                page_number: pageResult.page_number,
                event_type: rf.work_type as string ?? rf.inspection_type as string ?? "maintenance",
                logbook_type: rf.logbook_type as string ?? null,
                event_date: rf.entry_date as string ?? null,
                tach_time: rf.tach_time != null ? parseFloat(String(rf.tach_time)) : null,
                airframe_tt: rf.total_time_airframe != null ? parseFloat(String(rf.total_time_airframe)) : null,
                tsmoh: rf.tsmoh != null ? parseFloat(String(rf.tsmoh)) : null,
                work_description: rf.work_description as string ?? pageResult.best_text.substring(0, 1000),
                ata_chapter: rf.ata_chapter as string ?? null,
                part_numbers: Array.isArray(partNums) ? partNums : (partNums ? [partNums] : null),
                serial_numbers: Array.isArray(serNums) ? serNums : (serNums ? [serNums] : null),
                ad_references: Array.isArray(adRefs) ? adRefs : (adRefs ? [adRefs] : null),
                far_references: Array.isArray(farRefs) ? farRefs : (farRefs ? [farRefs] : null),
                manual_references: Array.isArray(manRefs) ? manRefs : (manRefs ? [manRefs] : null),
                mechanic_name: rf.mechanic_name as string ?? null,
                mechanic_cert_number: rf.ap_cert_number as string ?? null,
                ia_number: rf.ia_cert_number as string ?? null,
                repair_station_cert: rf.repair_station_cert as string ?? null,
                return_to_service: rf.return_to_service === true || rf.return_to_service === "true",
                confidence_overall: pageResult.arbitration_score,
                raw_text: pageResult.best_text.substring(0, 5000),
                review_status: pageResult.disposition === "auto_accept" ? "approved" : "pending",
              })
              .select("id")
              .single();

            // 6. For auto-accepted pages: create canonical entry immediately
            if (pageResult.disposition === "auto_accept" && extractedEvent?.id) {
              await supabase.from("canonical_maintenance_entries").insert({
                organization_id: doc.organization_id,
                aircraft_id: doc.aircraft_id,
                document_id: documentId,
                ocr_page_job_id: pageJobId,
                source_page_number: pageResult.page_number,
                logbook_type: rf.logbook_type as string ?? null,
                entry_date: rf.entry_date as string ?? null,
                tach_time: rf.tach_time != null ? parseFloat(String(rf.tach_time)) : null,
                total_time_airframe: rf.total_time_airframe != null ? parseFloat(String(rf.total_time_airframe)) : null,
                tsoh: rf.tsoh != null ? parseFloat(String(rf.tsoh)) : null,
                tsmoh: rf.tsmoh != null ? parseFloat(String(rf.tsmoh)) : null,
                work_description: rf.work_description as string ?? null,
                work_type: rf.work_type as string ?? null,
                ata_chapter: rf.ata_chapter as string ?? null,
                mechanic_name: rf.mechanic_name as string ?? null,
                ap_cert_number: rf.ap_cert_number as string ?? null,
                ia_cert_number: rf.ia_cert_number as string ?? null,
                return_to_service: rf.return_to_service === true || rf.return_to_service === "true",
                part_numbers: Array.isArray(partNums) ? partNums : null,
                ad_references: Array.isArray(adRefs) ? adRefs : null,
                inspection_type: rf.inspection_type as string ?? null,
                confidence_overall: pageResult.arbitration_score,
                review_status: "auto_accepted",
              });
            }
          }

          // 7. Create review_queue_item for pages needing human review
          if (pageResult.needs_human_review) {
            const criticalConflicts = pageResult.conflicts.filter(c => c.severity === "critical").length;
            await supabase.from("review_queue_items").insert({
              organization_id: doc.organization_id,
              aircraft_id: doc.aircraft_id,
              ocr_page_job_id: pageJobId,
              queue_type: "ocr_page",
              priority: criticalConflicts > 0 ? "high" : pageResult.arbitration_score < 0.5 ? "high" : "normal",
              reason: pageResult.review_reasons.join("; "),
              status: "pending",
              review_packet: pageResult.review_packet,
              arbitration_result: pageResult.disposition,
              arbitration_score: pageResult.arbitration_score,
              conflict_count: pageResult.conflicts.length,
              critical_fields_count: criticalConflicts,
            });
          }
        }

        // Also run standard text chunking + embedding for RAG
        await supabase.from("documents").update({ parsing_status: "chunking" }).eq("id", documentId);

        // Call original /ingest endpoint for chunking (reuse existing logic)
        const ingestRes = await fetch(`${parserServiceUrl}/ingest`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(internalSecret ? { "X-Internal-Secret": internalSecret } : {}),
          },
          body: JSON.stringify({
            document_id: doc.id,
            file_url: fileUrl,
            org_id: doc.organization_id,
            aircraft_id: doc.aircraft_id,
            doc_type: doc.doc_type,
            title: doc.title,
          }),
        });

        let chunkCount = 0;
        if (ingestRes.ok) {
          const ingestData = await ingestRes.json();

          if (ingestData.pages?.length) {
            const pageRows = ingestData.pages.map((page: ParsedPage) => ({
              document_id: documentId,
              organization_id: doc.organization_id,
              aircraft_id: doc.aircraft_id,
              page_number: page.page_number,
              page_text: page.text,
              width: page.width ?? null,
              height: page.height ?? null,
              is_ocr: page.is_ocr ?? false,
            }));
            await batchInsert(supabase, "document_pages", pageRows, 50);
          }

          const chunkRows = ingestData.chunks.map((chunk: ParsedChunk) => ({
            document_id: documentId,
            organization_id: doc.organization_id,
            aircraft_id: doc.aircraft_id,
            page_number: chunk.page_number,
            page_number_end: chunk.page_number_end ?? null,
            chunk_index: chunk.chunk_index,
            section_title: chunk.section_title ?? null,
            parent_section: chunk.parent_section ?? null,
            chunk_text: chunk.chunk_text,
            token_count: chunk.token_count ?? null,
            char_count: chunk.char_count ?? chunk.chunk_text.length,
            metadata_json: chunk.metadata_json ?? {},
          }));
          await batchInsert(supabase, "document_chunks", chunkRows, 50);

          const { data: insertedChunks } = await supabase
            .from("document_chunks")
            .select("id, chunk_index, chunk_text")
            .eq("document_id", documentId)
            .order("chunk_index", { ascending: true });

          if (insertedChunks?.length) {
            chunkCount = insertedChunks.length;
            await supabase.from("documents").update({ parsing_status: "embedding" }).eq("id", documentId);

            const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
            const embeddingModel = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-large";
            const EMBEDDING_BATCH_SIZE = 100;

            for (let i = 0; i < insertedChunks.length; i += EMBEDDING_BATCH_SIZE) {
              const batch = insertedChunks.slice(i, i + EMBEDDING_BATCH_SIZE);
              const embeddingRes = await openai.embeddings.create({
                model: embeddingModel,
                input: batch.map(c => c.chunk_text),
              });
              const embRows = batch.map((chunk, idx) => ({
                document_id: documentId,
                chunk_id: chunk.id,
                organization_id: doc.organization_id,
                aircraft_id: doc.aircraft_id,
                embedding: embeddingRes.data[idx].embedding,
                model: embeddingModel,
              }));
              await batchInsert(supabase, "document_embeddings", embRows, 50);
              if (i + EMBEDDING_BATCH_SIZE < insertedChunks.length) {
                await new Promise(r => setTimeout(r, 200));
              }
            }
          }
        } else {
          logger.warn("Standard ingest failed; pipeline data still stored", {
            documentId, status: ingestRes.status,
          });
        }

        // Mark completed
        await supabase.from("documents").update({
          parsing_status: "completed",
          parse_completed_at: new Date().toISOString(),
          parse_error: null,
        }).eq("id", documentId);

        const durationMs = Date.now() - startTime;
        logger.info("Godmode pipeline document ingestion completed", { documentId, durationMs });

        await supabase.from("audit_logs").insert({
          organization_id: doc.organization_id,
          user_id: null,
          action: "document.pipeline_completed",
          resource_type: "document",
          resource_id: documentId,
          metadata_json: {
            doc_type: doc.doc_type,
            title: doc.title,
            total_pages: pipelineData.total_pages,
            auto_accepted: pipelineData.auto_accepted_count,
            review_required: pipelineData.review_required_count,
            rejected: pipelineData.rejected_count,
            chunk_count: chunkCount,
            duration_ms: durationMs,
          },
        });

        return {
          success: true,
          documentId,
          pipeline: "godmode",
          totalPages: pipelineData.total_pages,
          autoAccepted: pipelineData.auto_accepted_count,
          reviewRequired: pipelineData.review_required_count,
          rejected: pipelineData.rejected_count,
          chunkCount,
          durationMs,
        };
      }

      // ─── STANDARD PIPELINE PATH (non-logbook docs) ────────────────────────
      logger.info("Using standard ingest pipeline", { documentId, docType: doc.doc_type });

      const ingestRes = await fetch(`${parserServiceUrl}/ingest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(internalSecret ? { "X-Internal-Secret": internalSecret } : {}),
        },
        body: JSON.stringify({
          document_id: doc.id,
          file_url: fileUrl,
          org_id: doc.organization_id,
          aircraft_id: doc.aircraft_id,
          doc_type: doc.doc_type,
          title: doc.title,
        }),
      });

      if (!ingestRes.ok) {
        const errText = await ingestRes.text();
        throw new Error(`Parser /ingest returned ${ingestRes.status}: ${errText}`);
      }

      const ingestData: IngestResponse = await ingestRes.json();

      await supabase.from("documents").update({
        is_text_native: ingestData.is_text_native,
        page_count: ingestData.page_count,
        parsing_status: "chunking",
      }).eq("id", documentId);

      if (ingestData.pages?.length) {
        const pageRows = ingestData.pages.map((page) => ({
          document_id: documentId,
          organization_id: doc.organization_id,
          aircraft_id: doc.aircraft_id,
          page_number: page.page_number,
          page_text: page.text,
          width: page.width ?? null,
          height: page.height ?? null,
          is_ocr: page.is_ocr ?? false,
        }));
        await batchInsert(supabase, "document_pages", pageRows, 50);
      }

      const chunkRows = ingestData.chunks.map((chunk) => ({
        document_id: documentId,
        organization_id: doc.organization_id,
        aircraft_id: doc.aircraft_id,
        page_number: chunk.page_number,
        page_number_end: chunk.page_number_end ?? null,
        chunk_index: chunk.chunk_index,
        section_title: chunk.section_title ?? null,
        parent_section: chunk.parent_section ?? null,
        chunk_text: chunk.chunk_text,
        token_count: chunk.token_count ?? null,
        char_count: chunk.char_count ?? chunk.chunk_text.length,
        metadata_json: chunk.metadata_json ?? {},
      }));
      await batchInsert(supabase, "document_chunks", chunkRows, 50);

      const { data: insertedChunks, error: chunksQueryError } = await supabase
        .from("document_chunks")
        .select("id, chunk_index, chunk_text")
        .eq("document_id", documentId)
        .order("chunk_index", { ascending: true });

      if (chunksQueryError || !insertedChunks) {
        throw new Error(`Failed to fetch inserted chunks: ${chunksQueryError?.message}`);
      }

      await supabase.from("documents").update({ parsing_status: "embedding" }).eq("id", documentId);

      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const embeddingModel = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-large";
      const EMBEDDING_BATCH_SIZE = 100;

      for (let i = 0; i < insertedChunks.length; i += EMBEDDING_BATCH_SIZE) {
        const batch = insertedChunks.slice(i, i + EMBEDDING_BATCH_SIZE);
        const embeddingRes = await openai.embeddings.create({
          model: embeddingModel,
          input: batch.map(c => c.chunk_text),
        });
        const embRows = batch.map((chunk, idx) => ({
          document_id: documentId,
          chunk_id: chunk.id,
          organization_id: doc.organization_id,
          aircraft_id: doc.aircraft_id,
          embedding: embeddingRes.data[idx].embedding,
          model: embeddingModel,
        }));
        await batchInsert(supabase, "document_embeddings", embRows, 50);
        if (i + EMBEDDING_BATCH_SIZE < insertedChunks.length) {
          await new Promise(r => setTimeout(r, 200));
        }
      }

      // Metadata extraction for non-pipeline docs
      const metaRes = await fetch(`${parserServiceUrl}/ingest/metadata`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(internalSecret ? { "X-Internal-Secret": internalSecret } : {}),
        },
        body: JSON.stringify({
          document_id: doc.id,
          org_id: doc.organization_id,
          aircraft_id: doc.aircraft_id,
          doc_type: doc.doc_type,
        }),
      });

      let metaData: MetadataResponse = {};
      if (metaRes.ok) {
        metaData = await metaRes.json();
      }

      if (doc.doc_type === "logbook" && metaData.maintenance_events?.length) {
        const maintenanceRows = metaData.maintenance_events.map((event) => ({
          organization_id: doc.organization_id,
          aircraft_id: doc.aircraft_id,
          document_id: documentId,
          source_page: event.source_page ?? null,
          event_date: event.event_date ?? null,
          event_type: event.event_type ?? null,
          description: event.description ?? null,
          mechanic_name: event.mechanic_name ?? null,
          mechanic_cert: event.mechanic_cert ?? null,
          shop_name: event.shop_name ?? null,
          airframe_tt: event.airframe_tt ?? null,
          tach_time: event.tach_time ?? null,
          parts_replaced: event.parts_replaced ?? null,
          ad_reference: event.ad_reference ?? null,
          sb_reference: event.sb_reference ?? null,
          raw_text: event.raw_text ?? null,
          confidence: event.confidence ?? null,
          is_verified: false,
        }));
        await batchInsert(supabase, "maintenance_events", maintenanceRows, 50);
      }

      await supabase.from("documents").update({
        parsing_status: "completed",
        parse_completed_at: new Date().toISOString(),
        parse_error: null,
      }).eq("id", documentId);

      const durationMs = Date.now() - startTime;

      await supabase.from("audit_logs").insert({
        organization_id: doc.organization_id,
        user_id: null,
        action: "document.ingestion_completed",
        resource_type: "document",
        resource_id: documentId,
        metadata_json: {
          doc_type: doc.doc_type,
          title: doc.title,
          page_count: ingestData.page_count,
          chunk_count: insertedChunks.length,
          duration_ms: durationMs,
        },
      });

      return {
        success: true,
        documentId,
        pipeline: "standard",
        pageCount: ingestData.page_count,
        chunkCount: insertedChunks.length,
        durationMs,
      };

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error("Document ingestion failed", { documentId, error: errorMessage });

      await supabase.from("documents").update({
        parsing_status: "failed",
        parse_error: errorMessage,
      }).eq("id", documentId);

      await supabase.from("audit_logs").insert({
        organization_id: doc.organization_id,
        user_id: null,
        action: "document.ingestion_failed",
        resource_type: "document",
        resource_id: documentId,
        metadata_json: {
          doc_type: doc.doc_type,
          title: doc.title,
          error: errorMessage,
          duration_ms: Date.now() - startTime,
        },
      });

      throw err;
    }
  },
});
