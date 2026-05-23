/**
 * safety.prompt-injection-guard
 *
 * A chained-call guard you wrap around any user-supplied text *before*
 * it flows into a system-prompt or tool argument. Detects classic
 * prompt-injection patterns:
 *
 *   - "ignore (all|previous|prior) instructions"
 *   - "you are now a (different|new) (assistant|model|character)"
 *   - "disregard the rules"
 *   - "system:" / "[INST]" / "<|im_start|>system" — chat-template markers
 *   - "exfiltrate" / "send the api key" / "leak the credentials"
 *   - markdown image / link forms that aim to trigger SSRF when the
 *     downstream model renders ("![logo](http://evil/?cookie=...)")
 *
 * Returns:
 *   { verdict: 'safe' | 'suspicious' | 'blocked', score: 0-100, hits: [...] }
 *
 * Default policy: caller decides what to do with 'suspicious' (e.g.
 * strip the matched span, add a warning to the system prompt, refuse).
 * 'blocked' is a hard-fail — caller should refuse to forward the text.
 *
 * Pure regex + scoring. No LLM. Designed to run inline at <1ms so it
 * doesn't add latency.
 *
 * Limitations: false-positive prone on documents that *legitimately*
 * discuss prompt-injection topics (security KB articles). Mitigate at
 * the caller by allow-listing known safe sources (e.g. our own KB).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { runAgent } from '../runner'

export type GuardVerdict = 'safe' | 'suspicious' | 'blocked'

interface PatternEntry {
  pattern: RegExp
  /** Risk weight. Sum across hits → score. */
  weight: number
  /** Short label for the audit log. */
  label: string
}

const PATTERNS: PatternEntry[] = [
  // High-confidence override attempts
  {
    pattern: /\bignore\s+(?:all\s+)?(?:previous|prior|above|earlier|the)?\s*(?:instructions?|rules?|prompts?|system\s+prompt)\b/i,
    weight: 50,
    label: 'ignore_instructions',
  },
  {
    pattern: /\bdisregard\s+(?:the\s+)?(?:rules?|instructions?|system|safety)\b/i,
    weight: 45,
    label: 'disregard_rules',
  },
  {
    pattern: /\byou\s+are\s+now\s+(?:a\s+)?(?:new|different|unrestricted|jailbroken|do-anything)/i,
    weight: 50,
    label: 'role_override',
  },
  {
    pattern: /\b(?:act|pretend|behave|roleplay)\s+as\s+(?:if\s+)?(?:a\s+)?(?:DAN|unrestricted|jailbroken|evil|developer\s+mode)/i,
    weight: 45,
    label: 'jailbreak_persona',
  },

  // Chat-template / scaffold injection
  { pattern: /<\|im_start\|>(?:system|assistant)/i, weight: 60, label: 'chatml_marker' },
  { pattern: /\[INST\]/i, weight: 30, label: 'llama_inst_tag' },
  { pattern: /^system:\s/im, weight: 20, label: 'system_role_marker' },

  // Exfiltration cues
  {
    pattern: /\b(?:exfiltrate|send|leak|paste|email)\s+(?:the\s+)?(?:api\s*key|secret|token|credential|password)/i,
    weight: 60,
    label: 'exfiltration_request',
  },
  {
    pattern: /\b(?:print|reveal|show|output)\s+(?:the\s+)?(?:system\s+prompt|hidden\s+instructions?|your\s+prompt)/i,
    weight: 55,
    label: 'reveal_system_prompt',
  },

  // Markdown SSRF
  {
    pattern: /!\[.*?\]\((?:https?:\/\/[^)]*\?[^)]*(?:cookie|token|secret|password|key)[^)]*)\)/i,
    weight: 55,
    label: 'markdown_image_exfil',
  },

  // Tool / function-call hijacking
  {
    pattern: /\b(?:call|invoke|use)\s+the\s+(?:tool|function)\s+["']?(?:exec|shell|eval|system|admin)/i,
    weight: 40,
    label: 'tool_hijack',
  },
]

export interface GuardHit {
  label: string
  weight: number
  preview: string
}

export interface GuardOutput {
  verdict: GuardVerdict
  score: number
  hits: GuardHit[]
  text_length: number
}

export interface GuardInput {
  supabase: SupabaseClient
  /** The text to scan — user-supplied document, chat message, etc. */
  text: string
  /** Optional context for the audit row. */
  source?: { kind: string; id: string }
  /** Score threshold for 'blocked'. Default 60. */
  blockThreshold?: number
  /** Score threshold for 'suspicious'. Default 25. */
  suspiciousThreshold?: number
}

export async function guardPromptInjection(args: GuardInput): Promise<{
  ok: boolean
  output?: GuardOutput
  runId?: string
  error?: string
}> {
  const block = args.blockThreshold ?? 60
  const sus = args.suspiciousThreshold ?? 25
  return runAgent<GuardOutput>(
    'safety.prompt-injection-guard',
    {
      supabase: args.supabase,
      input: { text_length: args.text.length, source: args.source ?? null },
      target: args.source,
    },
    async () => {
      const hits: GuardHit[] = []
      let score = 0
      for (const p of PATTERNS) {
        const m = args.text.match(p.pattern)
        if (m) {
          score += p.weight
          const start = Math.max(0, (m.index ?? 0) - 12)
          const end = Math.min(args.text.length, (m.index ?? 0) + m[0].length + 12)
          hits.push({
            label: p.label,
            weight: p.weight,
            preview: args.text.slice(start, end).replace(/\s+/g, ' '),
          })
        }
      }
      const verdict: GuardVerdict =
        score >= block ? 'blocked' : score >= sus ? 'suspicious' : 'safe'
      return {
        output: { verdict, score, hits, text_length: args.text.length },
        needsHuman: verdict !== 'safe',
        recommendation:
          verdict === 'blocked'
            ? {
                kind: 'prompt_injection_blocked',
                score,
                hits,
                source: args.source ?? null,
              }
            : verdict === 'suspicious'
              ? {
                  kind: 'prompt_injection_suspicious',
                  score,
                  hits,
                  source: args.source ?? null,
                }
              : null,
      }
    },
  )
}
