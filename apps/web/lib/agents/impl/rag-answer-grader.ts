/**
 * rag.answer-grader
 *
 * Post-hoc faithfulness grade on /api/ask answers. Called fire-and-
 * forget after the answer ships so it doesn't add latency to the user
 * response.
 *
 * Grade is 0-5:
 *   - 5: every factual claim is supported by a cited chunk
 *   - 3-4: mostly supported, a few unhedged claims
 *   - 0-2: meaningful hallucination present
 *
 * If grade < 3, emits a `low_faithfulness_answer` recommendation
 * surfaced in /admin/agents so the founder can spot whether the bug
 * is retrieval (missing chunk) or generation (paraphrase-too-far).
 *
 * Heuristic fast-path: when there are zero citations and the answer
 * contains numbers/dates, we mark grade=1 without an LLM call. That
 * catches the common "model invented numbers" failure cheaply.
 *
 * Stores the grade in agent_runs.output for the /admin dashboards.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { runAgent } from '../runner'

export interface AnswerGrade {
  ask_log_id: string | null
  grade: number
  rationale: string
  flagged: boolean
  used_llm: boolean
}

interface GraderInput {
  supabase: SupabaseClient
  askLogId?: string | null
  question: string
  answer: string
  citations: Array<{ chunk_id?: string; preview?: string }>
}

function heuristicFastPath(args: GraderInput): AnswerGrade | null {
  const a = args.answer.trim()
  // No-answer text — neutral, don't bother grading
  if (a.length < 8) return null
  // Has numbers / dates but no citations → high-suspicion
  const hasFigures = /\b(\d{1,4}\.\d|\d{2,}-\d{2,}|\$\d|\d+\s?(hrs?|hours?|gph))/i.test(a)
  if (hasFigures && args.citations.length === 0) {
    return {
      ask_log_id: args.askLogId ?? null,
      grade: 1,
      rationale: 'Answer contains numeric or date claims but ships no citations.',
      flagged: true,
      used_llm: false,
    }
  }
  return null
}

export async function gradeAnswer(args: GraderInput): Promise<{
  ok: boolean
  output?: AnswerGrade
  runId?: string
  error?: string
}> {
  return runAgent<AnswerGrade>(
    'rag.answer-grader',
    {
      supabase: args.supabase,
      input: {
        ask_log_id: args.askLogId ?? null,
        question_len: args.question.length,
        citation_count: args.citations.length,
      },
    },
    async (logger) => {
      const fast = heuristicFastPath(args)
      if (fast) {
        return {
          output: fast,
          needsHuman: fast.flagged,
          recommendation: fast.flagged
            ? {
                kind: 'low_faithfulness_answer',
                ask_log_id: args.askLogId,
                grade: fast.grade,
                rationale: fast.rationale,
                source: 'heuristic',
              }
            : null,
        }
      }

      const apiKey = process.env.OPENAI_API_KEY
      if (!apiKey) {
        return {
          output: {
            ask_log_id: args.askLogId ?? null,
            grade: 3,
            rationale: 'OpenAI not configured; defaulting to neutral grade.',
            flagged: false,
            used_llm: false,
          },
        }
      }

      const citationPreview = args.citations
        .slice(0, 6)
        .map((c, i) => `[${i + 1}] ${(c.preview ?? '').slice(0, 300)}`)
        .join('\n\n')

      try {
        logger.recordModel('openai', 'gpt-4o-mini')
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            temperature: 0,
            max_tokens: 250,
            messages: [
              {
                role: 'system',
                content:
                  'You grade aviation-maintenance answers for faithfulness to the retrieved sources. Output JSON: {"grade": 0-5, "rationale": "..."}. 5 = every factual claim is supported by the sources; 0 = hallucinated. Only assess support, not style.',
              },
              {
                role: 'user',
                content: `QUESTION:\n${args.question}\n\nANSWER:\n${args.answer}\n\nSOURCES:\n${citationPreview || '(none)'}`,
              },
            ],
            response_format: { type: 'json_object' },
          }),
          signal: AbortSignal.timeout(4000),
        })
        if (!res.ok) {
          return {
            output: {
              ask_log_id: args.askLogId ?? null,
              grade: 3,
              rationale: `Grader HTTP ${res.status}; defaulted to neutral.`,
              flagged: false,
              used_llm: false,
            },
          }
        }
        const j = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>
          usage?: { prompt_tokens?: number; completion_tokens?: number }
        }
        logger.recordTokens(j.usage?.prompt_tokens ?? 0, j.usage?.completion_tokens ?? 0)
        const raw = j.choices?.[0]?.message?.content ?? '{}'
        const parsed = JSON.parse(raw) as { grade?: number; rationale?: string }
        const grade = Math.max(0, Math.min(5, Math.round(parsed.grade ?? 3)))
        const rationale = (parsed.rationale ?? '').slice(0, 500)
        const flagged = grade < 3
        return {
          output: {
            ask_log_id: args.askLogId ?? null,
            grade,
            rationale,
            flagged,
            used_llm: true,
          },
          needsHuman: flagged,
          recommendation: flagged
            ? {
                kind: 'low_faithfulness_answer',
                ask_log_id: args.askLogId,
                grade,
                rationale,
                source: 'llm',
              }
            : null,
        }
      } catch (err) {
        return {
          output: {
            ask_log_id: args.askLogId ?? null,
            grade: 3,
            rationale: `Grader exception: ${(err as Error).message}. Defaulted to neutral.`,
            flagged: false,
            used_llm: false,
          },
        }
      }
    },
  )
}
