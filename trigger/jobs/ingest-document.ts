import { task, logger } from "@trigger.dev/sdk/v3";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import {
  extractMetadataInline,
  getUsableParserServiceUrl,
  parseScannedPdfWithFallbacks,
  parseTextNativePdf,
} from "../../apps/web/lib/ingestion/native-pdf";

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
  document_group_id?: string | null;
  document_detail_id?: string | null;
  record_family?: string | null;
  truth_role?: string | null;
  title: string;
  file_name: string;
  mime_type: string;
}

interface AircraftRecord {
  make: string | null;
  model: string | null;
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
  text_for_embedding?: string;
  display_text?: string;
  token_count?: number;
}

interface IngestResponse {
  is_text_native: boolean;
  page_count: number;
  pages: ParsedPage[];
  chunks: ParsedChunk[];
}

interface MetadataResponse {
  metadata?: {
    logbook?: {
      maintenance_events?: Array<{
        date?: string;
        type?: string;
        description?: string;
        mechanic?: string;
        airframe_tt?: string;
        ad_reference?: string;
      }>;
    };
  };
}

async function runInlinePdfParser(args: {
  supabase: ReturnType<typeof createClient>;
  documentId: string;
  document: DocumentRecord;
  aircraft: AircraftRecord | null;
  fileUrl: string;
}): Promise<IngestResponse> {
  const nativeData = await parseTextNativePdf({
    fileUrl: args.fileUrl,
    docType: args.document.doc_type,
    title: args.document.title,
    make: args.aircraft?.make ?? null,
    model: args.aircraft?.model ?? null,
  });

  if (nativeData.is_text_native) {
    return nativeData;
  }

  await args.supabase
    .from("documents")
    .update({
      is_text_native: false,
      page_count: nativeData.page_count,
      parsing_status: "ocr_processing",
      ocr_required: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", args.documentId);

  return parseScannedPdfWithFallbacks({
    fileUrl: args.fileUrl,
    docType: args.document.doc_type,
    title: args.document.title,
    pageCount: nativeData.page_count,
    make: args.aircraft?.make ?? null,
    model: args.aircraft?.model ?? null,
  });
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function createServiceClient() {
  const supabaseUrl =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function getMetadataExtractionDocType(doc: DocumentRecord): string {
  return doc.document_detail_id ?? doc.document_group_id ?? doc.doc_type;
}

function shouldPersistMaintenanceEvents(doc: DocumentRecord): boolean {
  if (doc.truth_role === "reference_only" || doc.truth_role === "derived_summary") {
    return false;
  }

  if (doc.doc_type === "logbook") {
    return true;
  }

  return [
    "logbooks_permanent_records",
    "work_orders_shop_execution",
    "recurring_compliance",
    "repairs_alterations_damage",
    "engine_prop_components",
    "avionics_electrical",
  ].includes(doc.record_family ?? "");
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

function isMissingColumnError(error: unknown, columnName: string): boolean {
  if (!error || typeof error !== "object") return false;
  const message = "message" in error ? String(error.message ?? "") : "";
  return new RegExp(`column .*${columnName}`, "i").test(message);
}

async function clearDerivedArtifacts(
  supabase: ReturnType<typeof createClient>,
  documentId: string
) {
  await supabase.from("document_metadata_extractions").delete().eq("document_id", documentId);
  await supabase.from("maintenance_events").delete().eq("document_id", documentId);
  await supabase.from("document_pages").delete().eq("document_id", documentId);
  await supabase.from("document_chunks").delete().eq("document_id", documentId);
}

async function insertEmbeddingsCompat(args: {
  supabase: ReturnType<typeof createClient>;
  embeddingModel: string;
  rows: Array<{
    document_id: string;
    chunk_id: string;
    organization_id: string;
    aircraft_id: string | null;
    embedding: number[];
    embedding_model: string;
  }>;
}) {
  const { error } = await args.supabase.from("document_embeddings").insert(args.rows);
  if (!error) return;

  if (isMissingColumnError(error, "embedding_model")) {
    const legacyRows = args.rows.map(({ embedding_model, ...row }) => ({
      ...row,
      model: embedding_model,
    }));

    const { error: legacyError } = await args.supabase
      .from("document_embeddings")
      .insert(legacyRows);

    if (!legacyError) return;
    throw new Error(`Failed to insert document embeddings: ${legacyError.message}`);
  }

  throw new Error(`Failed to insert document embeddings: ${error.message}`);
}

// ─── Task ──────────────────────────────────────────────────────────────────────

export const ingestDocument = task({
  id: "ingest-document",
  maxDuration: 600,
  retry: {
    maxAttempts: 3,
  },

  run: async (payload: IngestPayload) => {
    const { documentId } = payload;
    const startTime = Date.now();

    logger.info("Starting document ingestion", { documentId });

    // 1. Create Supabase service-role client
    const supabase = createServiceClient();

    // 2. Fetch document record
    const { data: doc, error: fetchError } = await supabase
      .from("documents")
      .select(
        "id, file_path, organization_id, aircraft_id, doc_type, document_group_id, document_detail_id, record_family, truth_role, title, file_name, mime_type"
      )
      .eq("id", documentId)
      .single<DocumentRecord>();

    if (fetchError || !doc) {
      throw new Error(
        `Document not found: ${documentId} — ${fetchError?.message ?? "unknown error"}`
      );
    }

    let aircraft: AircraftRecord | null = null;
    if (doc.aircraft_id) {
      const { data } = await supabase
        .from("aircraft")
        .select("make, model")
        .eq("id", doc.aircraft_id)
        .maybeSingle<AircraftRecord>();

      aircraft = data ?? null;
    }

    logger.info("Fetched document record", {
      documentId,
      docType: doc.doc_type,
      title: doc.title,
    });

    try {
      // 3. Update document status to 'parsing'
      await supabase
        .from("documents")
        .update({
          parsing_status: "parsing",
          parse_started_at: new Date().toISOString(),
          parse_error: null,
        })
        .eq("id", documentId);

      await clearDerivedArtifacts(supabase, documentId);

      // 4. Generate signed URL (60 min expiry) from the shared documents bucket
      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from("documents")
        .createSignedUrl(doc.file_path, 3600);

      if (signedUrlError || !signedUrlData?.signedUrl) {
        throw new Error(`Failed to generate signed URL: ${signedUrlError?.message ?? "no URL returned"}`);
      }

      const fileUrl = signedUrlData.signedUrl;
      logger.info("Generated signed URL", { documentId });

      // 5. Try parser service first, but fall back to inline parsing/OCR for resiliency.
      const parserServiceUrl = getUsableParserServiceUrl();
      const internalSecret =
        process.env.PARSER_SERVICE_SECRET ?? process.env.INTERNAL_SECRET;

      let ingestData: IngestResponse;
      let metaData: MetadataResponse = {};

      if (parserServiceUrl) {
        try {
          logger.info("Calling parser service /ingest", { documentId, parserServiceUrl });

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
              doc_type: getMetadataExtractionDocType(doc),
              title: doc.title,
              make: aircraft?.make ?? undefined,
              model: aircraft?.model ?? undefined,
            }),
          });

          if (!ingestRes.ok) {
            const errText = await ingestRes.text();
            throw new Error(`Parser /ingest returned ${ingestRes.status}: ${errText}`);
          }

          ingestData = await ingestRes.json();

          logger.info("Parser /ingest completed", {
            documentId,
            pageCount: ingestData.page_count,
            chunkCount: ingestData.chunks.length,
            isTextNative: ingestData.is_text_native,
          });

          if (!ingestData.is_text_native && ingestData.chunks.length === 0) {
            logger.warn("Parser returned OCR-needed payload without usable chunks; falling back inline", {
              documentId,
            });

            ingestData = await runInlinePdfParser({
              supabase,
              documentId,
              document: doc,
              aircraft,
              fileUrl,
            });
            metaData =
              (await extractMetadataInline({
                docType: doc.doc_type,
                make: aircraft?.make ?? null,
                model: aircraft?.model ?? null,
                chunks: ingestData.chunks,
              })) ?? {};
          } else {
            logger.info("Calling parser service /ingest/metadata", { documentId });

            const metaRes = await fetch(`${parserServiceUrl}/ingest/metadata`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(internalSecret ? { "X-Internal-Secret": internalSecret } : {}),
              },
              body: JSON.stringify({
                document_id: doc.id,
                chunks: ingestData.chunks,
                aircraft_id: doc.aircraft_id,
                doc_type: getMetadataExtractionDocType(doc),
                make: aircraft?.make ?? undefined,
                model: aircraft?.model ?? undefined,
              }),
            });

            if (metaRes.ok) {
              metaData = await metaRes.json();
              logger.info("Metadata extraction completed", { documentId });
            } else {
              const metaErr = await metaRes.text();
              logger.warn("Metadata extraction returned non-OK status", {
                documentId,
                status: metaRes.status,
                body: metaErr,
              });
            }
          }
        } catch (parserError) {
          const parserMessage =
            parserError instanceof Error ? parserError.message : String(parserError);
          logger.warn("External parser unavailable; falling back to inline parser", {
            documentId,
            error: parserMessage,
          });

          ingestData = await runInlinePdfParser({
            supabase,
            documentId,
            document: doc,
            aircraft,
            fileUrl,
          });
          metaData =
            (await extractMetadataInline({
              docType: doc.doc_type,
              make: aircraft?.make ?? null,
              model: aircraft?.model ?? null,
              chunks: ingestData.chunks,
            })) ?? {};
        }
      } else {
        logger.warn("Parser service unavailable; using inline parser", { documentId });
        ingestData = await runInlinePdfParser({
          supabase,
          documentId,
          document: doc,
          aircraft,
          fileUrl,
        });
        metaData =
          (await extractMetadataInline({
            docType: doc.doc_type,
            make: aircraft?.make ?? null,
            model: aircraft?.model ?? null,
            chunks: ingestData.chunks,
          })) ?? {};
      }

      // 6. Update document: is_text_native, page_count, status to 'chunking'
      await supabase
        .from("documents")
        .update({
          is_text_native: ingestData.is_text_native,
          page_count: ingestData.page_count,
          parsing_status: "chunking",
          ocr_required: !ingestData.is_text_native,
        })
        .eq("id", documentId);

      // 7. Store pages in document_pages table (batch insert, 50 per batch)
      if (ingestData.pages && ingestData.pages.length > 0) {
        const pageRows = ingestData.pages.map((page) => ({
          document_id: documentId,
          organization_id: doc.organization_id,
          aircraft_id: doc.aircraft_id,
          page_number: page.page_number,
          page_text: page.text,
          ocr_confidence: (page as any).ocr_confidence ?? null,
          word_count: (page as any).word_count ?? null,
          char_count: (page as any).char_count ?? page.text.length,
        }));

        await batchInsert(supabase, "document_pages", pageRows, 50);
        logger.info("Stored document pages", { documentId, count: pageRows.length });
      }

      if (ingestData.chunks.length === 0) {
        await supabase
          .from("documents")
          .update({
            parsing_status: "needs_ocr",
            ocr_required: true,
            parse_completed_at: new Date().toISOString(),
            parse_error: "Parser returned no extractable text; OCR review required.",
          })
          .eq("id", documentId);

        return {
          success: true,
          documentId,
          pageCount: ingestData.page_count,
          chunkCount: 0,
          durationMs: Date.now() - startTime,
        };
      }

      // 8. Store chunks in document_chunks table (batch insert, 50 per batch)
      const chunkRows = ingestData.chunks.map((chunk) => ({
        document_id: documentId,
        organization_id: doc.organization_id,
        aircraft_id: doc.aircraft_id,
        page_number: chunk.page_number,
        page_number_end: chunk.page_number_end ?? null,
        chunk_index: chunk.chunk_index,
        section_title: chunk.section_title ?? null,
        parent_section: null,
        chunk_text: chunk.display_text ?? chunk.text_for_embedding ?? "",
        token_count: chunk.token_count ?? null,
        char_count: (chunk.display_text ?? chunk.text_for_embedding ?? "").length,
        parser_confidence: null,
        metadata_json: {
          text_for_embedding: chunk.text_for_embedding ?? chunk.display_text ?? "",
        },
      }));

      await batchInsert(supabase, "document_chunks", chunkRows, 50);
      logger.info("Stored document chunks", { documentId, count: chunkRows.length });

      // Fetch inserted chunks to get their IDs
      const { data: insertedChunks, error: chunksQueryError } = await supabase
        .from("document_chunks")
        .select("id, chunk_index")
        .eq("document_id", documentId)
        .order("chunk_index", { ascending: true });

      if (chunksQueryError || !insertedChunks) {
        throw new Error(`Failed to fetch inserted chunks: ${chunksQueryError?.message}`);
      }

      const chunkTextByIndex = new Map(
        ingestData.chunks.map((chunk) => [
          chunk.chunk_index,
          chunk.text_for_embedding ?? chunk.display_text ?? "",
        ])
      );

      // Update status to 'embedding'
      await supabase
        .from("documents")
        .update({ parsing_status: "embedding" })
        .eq("id", documentId);

      // 9. Generate embeddings using OpenAI directly (batches of 100)
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const embeddingModel =
        process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-large";

      logger.info("Generating embeddings", {
        documentId,
        chunkCount: insertedChunks.length,
        model: embeddingModel,
      });

      const EMBEDDING_BATCH_SIZE = 100;

      for (let i = 0; i < insertedChunks.length; i += EMBEDDING_BATCH_SIZE) {
        const batch = insertedChunks.slice(i, i + EMBEDDING_BATCH_SIZE);
        const texts = batch.map((c) => chunkTextByIndex.get(c.chunk_index) ?? "");

        logger.info("Embedding batch", {
          documentId,
          batchStart: i,
          batchSize: batch.length,
        });

        const embeddingRes = await openai.embeddings.create({
          model: embeddingModel,
          input: texts,
          dimensions: 1536,
        });

        const embeddingRows = batch.map((chunk, idx) => ({
          document_id: documentId,
          chunk_id: chunk.id,
          organization_id: doc.organization_id,
          aircraft_id: doc.aircraft_id,
          embedding: embeddingRes.data[idx].embedding,
          embedding_model: embeddingModel,
        }));

        await insertEmbeddingsCompat({
          supabase,
          embeddingModel,
          rows: embeddingRows,
        });

        // 200ms pause between embedding batches to respect rate limits
        if (i + EMBEDDING_BATCH_SIZE < insertedChunks.length) {
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      }

      logger.info("Embeddings generated and stored", { documentId });

      // 10. Store maintenance events only for structured maintenance-evidence document families.
      if (metaData.metadata) {
        await supabase.from("document_metadata_extractions").insert({
          document_id: documentId,
          organization_id: doc.organization_id,
          aircraft_id: doc.aircraft_id,
          extraction_type: "document_metadata",
          extracted_data: metaData.metadata,
        });
      }

      const maintenanceEvents = metaData.metadata?.logbook?.maintenance_events ?? [];

      if (shouldPersistMaintenanceEvents(doc) && doc.aircraft_id && maintenanceEvents.length) {
        const maintenanceRows = maintenanceEvents.map((event) => ({
          organization_id: doc.organization_id,
          aircraft_id: doc.aircraft_id,
          document_id: documentId,
          source_page: null,
          event_date: event.date ?? null,
          event_type: event.type ?? null,
          description: event.description ?? null,
          mechanic_name: event.mechanic ?? null,
          mechanic_cert: null,
          shop_name: null,
          airframe_tt: event.airframe_tt ? Number(event.airframe_tt) || null : null,
          tach_time: null,
          parts_replaced: null,
          ad_reference: event.ad_reference ?? null,
          sb_reference: null,
          raw_text: null,
          confidence: null,
          is_verified: false,
        }));

        await batchInsert(supabase, "maintenance_events", maintenanceRows, 50);
        logger.info("Stored maintenance events", {
          documentId,
          count: maintenanceRows.length,
        });
      }

      // 11. Update document status to 'completed', set parse_completed_at
      await supabase
        .from("documents")
        .update({
          parsing_status: "completed",
          parse_completed_at: new Date().toISOString(),
          parse_error: null,
        })
        .eq("id", documentId);

      const durationMs = Date.now() - startTime;
      logger.info("Document ingestion completed", { documentId, durationMs });

      // 12. Write audit log entry
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
        pageCount: ingestData.page_count,
        chunkCount: insertedChunks.length,
        durationMs,
      };
    } catch (err) {
      // 14. On any error: update document status to 'failed', store parse_error
      const errorMessage = err instanceof Error ? err.message : String(err);

      logger.error("Document ingestion failed", { documentId, error: errorMessage });

      await supabase
        .from("documents")
        .update({
          parsing_status: "failed",
          parse_error: errorMessage,
        })
        .eq("id", documentId);

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
