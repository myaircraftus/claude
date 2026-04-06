import { createServiceSupabase } from '@/lib/supabase/server';
import type { RetrievedChunk, DocType } from '@/types';

/**
 * Retrieve semantically relevant chunks from the aircraft documents index.
 * Uses the search_aircraft_documents RPC function which performs hybrid
 * vector + keyword search and joins with the aircraft table for tail_number.
 */
export async function retrieveChunks(params: {
  organizationId: string;
  aircraftId?: string;
  queryEmbedding: number[];
  queryText: string;
  docTypeFilter?: DocType[];
  limit?: number;
}): Promise<RetrievedChunk[]> {
  const {
    organizationId,
    aircraftId,
    queryEmbedding,
    queryText,
    docTypeFilter,
    limit = 20,
  } = params;

  const supabase = createServiceSupabase();

  const { data, error } = await supabase.rpc('search_aircraft_documents', {
    p_organization_id: organizationId,
    p_aircraft_id: aircraftId ?? null,
    p_query_embedding: queryEmbedding,
    p_query_text: queryText,
    p_doc_type_filter: docTypeFilter && docTypeFilter.length > 0 ? docTypeFilter : null,
    p_limit: limit,
  });

  if (error) {
    throw new Error(`search_aircraft_documents RPC failed: ${error.message}`);
  }

  if (!data || !Array.isArray(data)) {
    return [];
  }

  // Map the RPC response rows to typed RetrievedChunk objects
  const chunks: RetrievedChunk[] = data.map((row: Record<string, unknown>) => ({
    chunk_id: row.chunk_id as string,
    document_id: row.document_id as string,
    document_title: row.document_title as string,
    doc_type: row.doc_type as DocType,
    aircraft_id: (row.aircraft_id as string | undefined) ?? undefined,
    aircraft_tail: (row.tail_number as string | undefined) ?? undefined,
    page_number: row.page_number as number,
    page_number_end: (row.page_number_end as number | undefined) ?? undefined,
    section_title: (row.section_title as string | undefined) ?? undefined,
    chunk_text: row.chunk_text as string,
    metadata_json: (row.metadata_json as Record<string, unknown>) ?? {},
    vector_score: row.vector_score as number,
    keyword_score: row.keyword_score as number,
    combined_score: row.combined_score as number,
  }));

  return chunks;
}
