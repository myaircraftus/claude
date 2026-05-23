/**
 * safety.cross-tenant-leak-watchdog
 *
 * Sampled audit that catches the worst possible bug class in a
 * multi-tenant RAG system: data from org A leaking into org B's
 * answers because a retrieval forgot to scope by organization_id.
 *
 * Strategy: every Nth call to /api/ask attaches a `sample_audit=true`
 * flag in the retrieval ctx. When set, the answer-gen path also POSTs
 * the question + retrieved chunk_ids + the calling org_id here. We
 * then SELECT the actual organization_id of each chunk from the DB and
 * compare. ANY mismatch is a CRITICAL agent_run with needsHuman=true
 * and pages the founder.
 *
 * This file is the audit handler. The hook into /api/ask is a
 * follow-up — for now we expose the agent so an admin can POST a
 * one-shot audit from /admin/agents.
 *
 * Body: { calling_org_id, question, chunk_ids: string[] }
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { runAgent } from '../runner'

export interface CrossTenantAuditOutput {
  checked_chunks: number
  hallucinated_chunks: number  // chunk_id didn't exist at all
  cross_tenant_chunks: number  // chunk's org differs from caller's org
  details: Array<{ chunk_id: string; caller_org: string; actual_org: string | null }>
}

export async function auditRagRetrieval(args: {
  supabase: SupabaseClient
  triggeredBy?: string | null
  callingOrgId: string
  question: string
  chunkIds: string[]
}): Promise<{ ok: boolean; output?: CrossTenantAuditOutput; runId?: string; error?: string }> {
  return runAgent<CrossTenantAuditOutput>(
    'safety.cross-tenant-leak-watchdog',
    {
      supabase: args.supabase,
      triggeredBy: args.triggeredBy ?? null,
      input: {
        calling_org_id: args.callingOrgId,
        question_chars: args.question.length,
        chunk_count: args.chunkIds.length,
      },
    },
    async () => {
      if (args.chunkIds.length === 0) {
        return { output: { checked_chunks: 0, hallucinated_chunks: 0, cross_tenant_chunks: 0, details: [] } }
      }
      // Look up the organization_id for each chunk. The page_tree_nodes
      // table is the canonical home for OCR'd RAG chunks; if your RAG
      // index lives in a different table, swap this query.
      const { data: chunks } = await args.supabase
        .from('page_tree_nodes')
        .select('id, organization_id')
        .in('id', args.chunkIds)
      const rows = (chunks ?? []) as Array<{ id: string; organization_id: string }>
      const byId = new Map(rows.map((r) => [r.id, r.organization_id]))

      const details: CrossTenantAuditOutput['details'] = []
      let hallucinated = 0
      let crossTenant = 0
      for (const id of args.chunkIds) {
        const actual = byId.get(id) ?? null
        if (actual == null) {
          hallucinated += 1
          details.push({ chunk_id: id, caller_org: args.callingOrgId, actual_org: null })
        } else if (actual !== args.callingOrgId) {
          crossTenant += 1
          details.push({ chunk_id: id, caller_org: args.callingOrgId, actual_org: actual })
        }
      }

      const needsHuman = crossTenant > 0 // hallucinated alone is just a citation bug
      return {
        output: {
          checked_chunks: args.chunkIds.length,
          hallucinated_chunks: hallucinated,
          cross_tenant_chunks: crossTenant,
          details: details.slice(0, 50),
        },
        needsHuman,
        recommendation:
          crossTenant > 0
            ? {
                kind: 'cross_tenant_leak_detected',
                severity: 'critical',
                caller_org: args.callingOrgId,
                question: args.question.slice(0, 200),
                cross_tenant_count: crossTenant,
                leaked_from_orgs: Array.from(
                  new Set(details.filter((d) => d.actual_org).map((d) => d.actual_org!)),
                ),
              }
            : null,
      }
    },
  )
}
