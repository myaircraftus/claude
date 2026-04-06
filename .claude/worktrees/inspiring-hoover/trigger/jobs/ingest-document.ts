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
        "id, file_path, organization_id, aircraft_id, doc_type, title, file_name, mime_type"
      )
      .eq("id", documentId)
      .single<DocumentRecord>();

    if (fetchError || !doc) {
      throw new Error(
        `Document not found: ${documentId} — ${fetchError?.message ?? "unknown error"}`
      );
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

      // 4. Generate signed URL (60 min expiry) from aircraft-documents bucket
      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from("aircraft-documents")
        .createSignedUrl(doc.file_path, 3600);

      if (signedUrlError || !signedUrlData?.signedUrl) {
        throw new Error(`Failed to generate signed URL: ${signedUrlError?.message ?? "no URL returned"}`);
      }

      const fileUrl = signedUrlData.signedUrl;
      logger.info("Generated signed URL", { documentId });

      // 5. Call FastAPI parser service: POST /ingest
      const parserServiceUrl = process.env.PARSER_SERVICE_URL;
      const internalSecret = process.env.INTERNAL_SECRET;

      if (!parserServiceUrl) {
        throw new Error("PARSER_SERVICE_URL environment variable is required");
      }

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
          doc_type: doc.doc_type,
          title: doc.title,
        }),
      });

      if (!ingestRes.ok) {
        const errText = await ingestRes.text();
        throw new Error(`Parser /ingest returned ${ingestRes.status}: ${errText}`);
      }

      const ingestData: IngestResponse = await ingestRes.json();

      logger.info("Parser /ingest completed", {
        documentId,
        pageCount: ingestData.page_count,
        chunkCount: ingestData.chunks.length,
        isTextNative: ingestData.is_text_native,
      });

      // 6. Update document: is_text_native, page_count, status to 'chunking'
      await supabase
        .from("documents")
        .update({
          is_text_native: ingestData.is_text_native,
          page_count: ingestData.page_count,
          parsing_status: "chunking",
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
          width: page.width ?? null,
          height: page.height ?? null,
          is_ocr: page.is_ocr ?? false,
        }));

        await batchInsert(supabase, "document_pages", pageRows, 50);
        logger.info("Stored document pages", { documentId, count: pageRows.length });
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
        parent_section: chunk.parent_section ?? null,
        chunk_text: chunk.chunk_text,
        token_count: chunk.token_count ?? null,
        char_count: chunk.char_count ?? chunk.chunk_text.length,
        parser_confidence: chunk.parser_confidence ?? null,
        metadata_json: chunk.metadata_json ?? {},
      }));

      await batchInsert(supabase, "document_chunks", chunkRows, 50);
      logger.info("Stored document chunks", { documentId, count: chunkRows.length });

      // Fetch inserted chunks to get their IDs
      const { data: insertedChunks, error: chunksQueryError } = await supabase
        .from("document_chunks")
        .select("id, chunk_index, chunk_text")
        .eq("document_id", documentId)
        .order("chunk_index", { ascending: true });

      if (chunksQueryError || !insertedChunks) {
        throw new Error(`Failed to fetch inserted chunks: ${chunksQueryError?.message}`);
      }

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
        const texts = batch.map((c) => c.chunk_text);

        logger.info("Embedding batch", {
          documentId,
          batchStart: i,
          batchSize: batch.length,
        });

        const embeddingRes = await openai.embeddings.create({
          model: embeddingModel,
          input: texts,
        });

        const embeddingRows = batch.map((chunk, idx) => ({
          document_id: documentId,
          chunk_id: chunk.id,
          organization_id: doc.organization_id,
          aircraft_id: doc.aircraft_id,
          embedding: embeddingRes.data[idx].embedding,
          model: embeddingModel,
        }));

        // Insert embeddings (batch of 50 for safety with large vectors)
        await batchInsert(supabase, "document_embeddings", embeddingRows, 50);

        // 200ms pause between embedding batches to respect rate limits
        if (i + EMBEDDING_BATCH_SIZE < insertedChunks.length) {
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      }

      logger.info("Embeddings generated and stored", { documentId });

      // 10. Run metadata extraction: POST /ingest/metadata
      logger.info("Calling parser service /ingest/metadata", { documentId });

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
        logger.info("Metadata extraction completed", { documentId });
      } else {
        const metaErr = await metaRes.text();
        logger.warn("Metadata extraction returned non-OK status", {
          documentId,
          status: metaRes.status,
          body: metaErr,
        });
      }

      // 11. Store maintenance events if doc_type is 'logbook'
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
        logger.info("Stored maintenance events", {
          documentId,
          count: maintenanceRows.length,
        });
      }

      // 12. Update document status to 'completed', set parse_completed_at
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

      // 13. Write audit log entry
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
