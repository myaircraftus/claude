/**
 * Support KB curator — nightly cron.
 *
 * Reads recent first-responder runs whose recommendation kind is
 * `kb_draft_candidate` (i.e. the AI flagged its own answer as low-
 * confidence). Groups them by category, and for any category with
 * ≥3 distinct questions in the last 30 days, drafts a single new
 * support_kb_entry with status='draft' for an admin to review.
 *
 * Status='draft' is RLS-gated to admin-only reads, so a curator
 * mistake never leaks to users. The admin publishes by flipping to
 * status='published' on the /admin/support/kb page.
 *
 * Runs through the standard agent runner — every invocation gets an
 * audit row in agent_runs.
 */
import OpenAI from 'openai'
import type { SupabaseClient } from '@supabase/supabase-js'
import { runAgent } from '../runner'

export interface KbCuratorReport {
  scanned: number
  clusters: number
  drafted: number
  draft_ids: string[]
}

const SYSTEM_PROMPT = `You are myaircraft.us's knowledge-base curator.

Given a category and 3-10 user questions that the AI couldn't answer with confidence, write a single draft KB entry that would cover all of them.

Rules:
- Title is short and starts with how/what/why if user-facing.
- Body is 2-4 paragraphs of markdown. No fluff.
- Suggest 6-10 keywords (one or two words each).
- If the cluster is actually multiple distinct topics, pick the most common one and note in "skip_reason" why the others should be deferred.

Return STRICT JSON:
{
  "title": "...",
  "body_md": "...",
  "keywords": ["..."],
  "skip_reason": null | "..."
}`

export async function curateKbDrafts(args: {
  supabase: SupabaseClient
  /** Min cluster size to draft. Default 3. */
  minClusterSize?: number
  /** Days to scan back. Default 30. */
  daysBack?: number
}): Promise<{ ok: boolean; output?: KbCuratorReport; runId?: string; error?: string }> {
  const minClusterSize = args.minClusterSize ?? 3
  const daysBack = args.daysBack ?? 30

  return runAgent<KbCuratorReport>(
    'support.kb-curator',
    {
      supabase: args.supabase,
      input: { min_cluster_size: minClusterSize, days_back: daysBack },
    },
    async (logger) => {
      // 1. Pull candidate runs.
      const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString()
      const { data: runs, error: runsErr } = await args.supabase
        .from('agent_runs')
        .select('id, input, recommendation, target_id')
        .eq('agent_id', 'support.first-responder')
        .gte('created_at', since)
        .not('recommendation', 'is', null)
        .limit(500)

      if (runsErr) {
        throw new Error(`Failed to read agent_runs: ${runsErr.message}`)
      }

      type Candidate = { question: string; category: string; ticket_id: string | null }
      const candidates: Candidate[] = (runs ?? [])
        .filter((r: any) => r.recommendation?.kind === 'kb_draft_candidate')
        .map((r: any) => ({
          question: String(r.recommendation?.question ?? r.input?.question ?? '').trim(),
          category: String(r.recommendation?.category ?? 'other'),
          ticket_id: r.target_id ?? null,
        }))
        .filter((c) => c.question.length > 4)

      // 2. Cluster by category. Deduplicate near-identical questions
      // (case-insensitive, whitespace-collapsed) so a single repeated user
      // doesn't dominate.
      const byCategory = new Map<string, Map<string, Candidate>>()
      for (const c of candidates) {
        const key = c.question.toLowerCase().replace(/\s+/g, ' ').trim()
        let bucket = byCategory.get(c.category)
        if (!bucket) {
          bucket = new Map()
          byCategory.set(c.category, bucket)
        }
        if (!bucket.has(key)) bucket.set(key, c)
      }

      const clusters = Array.from(byCategory.entries())
        .map(([category, m]) => ({ category, items: Array.from(m.values()) }))
        .filter((c) => c.items.length >= minClusterSize)

      const report: KbCuratorReport = {
        scanned: candidates.length,
        clusters: clusters.length,
        drafted: 0,
        draft_ids: [],
      }

      if (clusters.length === 0) {
        return { output: report }
      }

      if (!process.env.OPENAI_API_KEY) {
        // No LLM → log the clusters as a recommendation but don't write drafts.
        return {
          output: report,
          recommendation: {
            kind: 'kb_curator_skipped_no_llm',
            clusters: clusters.map((c) => ({
              category: c.category,
              count: c.items.length,
              sample_questions: c.items.slice(0, 3).map((i) => i.question),
            })),
          },
        }
      }

      // 3. For each cluster, draft a KB entry.
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      logger.recordModel('openai', 'gpt-4o-mini')

      for (const cluster of clusters) {
        try {
          const completion = await openai.chat.completions.create({
            model: process.env.OPENAI_CURATOR_MODEL || 'gpt-4o-mini',
            temperature: 0.2,
            max_tokens: 600,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              {
                role: 'user',
                content: `Category: ${cluster.category}\n\nQuestions:\n${cluster.items
                  .slice(0, 10)
                  .map((c, i) => `${i + 1}. ${c.question}`)
                  .join('\n')}\n\nReturn JSON.`,
              },
            ],
          })
          const usage = completion.usage
          if (usage) logger.recordTokens(usage.prompt_tokens ?? 0, usage.completion_tokens ?? 0)

          const raw = completion.choices[0]?.message?.content ?? '{}'
          let draft: {
            title?: string
            body_md?: string
            keywords?: string[]
            skip_reason?: string | null
          } = {}
          try {
            draft = JSON.parse(raw)
          } catch {
            continue
          }
          if (draft.skip_reason) continue
          if (!draft.title || !draft.body_md) continue

          const sourceTicketIds = cluster.items
            .map((c) => c.ticket_id)
            .filter((t): t is string => !!t)

          const { data: inserted, error: insertErr } = await args.supabase
            .from('support_kb_entry')
            .insert({
              title: draft.title.slice(0, 200),
              body_md: draft.body_md.slice(0, 8000),
              category: cluster.category,
              keywords: (draft.keywords ?? []).slice(0, 12).map((k) => String(k).slice(0, 40)),
              status: 'draft',
              source_ticket_ids: sourceTicketIds,
            })
            .select('id')
            .single()

          if (insertErr || !inserted) {
            console.warn('[kb-curator] insert failed:', insertErr?.message)
            continue
          }
          report.drafted += 1
          report.draft_ids.push((inserted as { id: string }).id)
        } catch (err) {
          console.warn(
            '[kb-curator] cluster failed:',
            err instanceof Error ? err.message : String(err),
          )
          // Continue with the next cluster.
        }
      }

      return {
        output: report,
        // Surface a single human-readable summary so the /admin/agents
        // page can show "drafted 3 entries" without parsing the output.
        recommendation:
          report.drafted > 0
            ? {
                kind: 'kb_drafts_ready_for_review',
                drafted: report.drafted,
                draft_ids: report.draft_ids,
              }
            : null,
      }
    },
  )
}
