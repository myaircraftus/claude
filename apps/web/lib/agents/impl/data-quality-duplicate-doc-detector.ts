/**
 * data-quality.duplicate-doc-detector
 *
 * Nightly sweep over public.documents. Groups by (organization_id,
 * checksum_sha256). Any group with > 1 row is a duplicate cluster —
 * the same logbook PDF uploaded twice, or two paths to the same
 * Drive file. Emit a 'duplicate_documents' recommendation listing
 * the clusters; admin reviews and chooses which copies to soft-
 * delete from /admin/documents.
 *
 * Pure SQL. Doesn't auto-delete — humans approve.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { runAgent } from '../runner'

export interface DuplicateCluster {
  organization_id: string
  checksum_sha256: string
  copies: Array<{
    document_id: string
    title: string | null
    file_name: string | null
    uploaded_at: string
    uploaded_by: string | null
    aircraft_id: string | null
  }>
}

export interface DuplicateDocsReport {
  scanned: number
  cluster_count: number
  clusters: DuplicateCluster[]
}

export async function detectDuplicateDocs(args: {
  supabase: SupabaseClient
  /** Optional org filter for on-demand runs. */
  organizationId?: string
}): Promise<{ ok: boolean; output?: DuplicateDocsReport; runId?: string; error?: string }> {
  return runAgent<DuplicateDocsReport>(
    'data-quality.duplicate-doc-detector',
    {
      supabase: args.supabase,
      input: { organization_id_filter: args.organizationId ?? null },
    },
    async () => {
      let q = args.supabase
        .from('documents')
        .select(
          'id, organization_id, checksum_sha256, title, file_name, uploaded_at, uploaded_by, aircraft_id',
        )
        .not('checksum_sha256', 'is', null)
        .order('organization_id')
        .order('checksum_sha256')
        .limit(10000)
      if (args.organizationId) q = q.eq('organization_id', args.organizationId)
      const { data, error } = await q
      if (error) {
        return {
          output: { scanned: 0, cluster_count: 0, clusters: [] },
          recommendation: { kind: 'duplicate_scan_failed', reason: error.message },
        }
      }
      type Row = {
        id: string
        organization_id: string
        checksum_sha256: string
        title: string | null
        file_name: string | null
        uploaded_at: string
        uploaded_by: string | null
        aircraft_id: string | null
      }
      const rows = (data ?? []) as Row[]
      const groups = new Map<string, Row[]>()
      for (const row of rows) {
        const key = `${row.organization_id}:${row.checksum_sha256}`
        const arr = groups.get(key) ?? []
        arr.push(row)
        groups.set(key, arr)
      }
      const clusters: DuplicateCluster[] = []
      for (const [key, arr] of groups.entries()) {
        if (arr.length <= 1) continue
        const [orgId, sha] = key.split(':')
        // Sort copies oldest-first so the UI can suggest "keep first"
        arr.sort((a, b) => a.uploaded_at.localeCompare(b.uploaded_at))
        clusters.push({
          organization_id: orgId,
          checksum_sha256: sha,
          copies: arr.map((r) => ({
            document_id: r.id,
            title: r.title,
            file_name: r.file_name,
            uploaded_at: r.uploaded_at,
            uploaded_by: r.uploaded_by,
            aircraft_id: r.aircraft_id,
          })),
        })
      }
      clusters.sort((a, b) => b.copies.length - a.copies.length)
      return {
        output: { scanned: rows.length, cluster_count: clusters.length, clusters },
        needsHuman: clusters.length > 0,
        recommendation:
          clusters.length > 0
            ? {
                kind: 'duplicate_documents',
                cluster_count: clusters.length,
                clusters: clusters.slice(0, 50),
              }
            : null,
      }
    },
  )
}
