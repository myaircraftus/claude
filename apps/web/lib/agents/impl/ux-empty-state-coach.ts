/**
 * ux-help.empty-state-coach
 *
 * On-demand: given a route + persona, return 2-3 specific "next actions"
 * for a user staring at an empty page (no aircraft yet, no work orders
 * yet, etc.). Cheap LLM. Renders in the EmptyState component the UI
 * already uses across the app — the inbox empty state being the most
 * obvious immediate consumer.
 *
 * Input includes the page path so we can tailor: empty /aircraft page
 * suggests "Add your first aircraft" + "Upload a logbook PDF" rather
 * than the generic "Get started" copy.
 */
import OpenAI from 'openai'
import type { SupabaseClient } from '@supabase/supabase-js'
import { runAgent } from '../runner'

export type EmptyPersona = 'owner' | 'shop' | 'admin' | 'mechanic'

export interface EmptySuggestion {
  label: string
  href: string
  reason: string
}
export interface EmptyStateOutput {
  suggestions: EmptySuggestion[]
}

const SYSTEM_PROMPT = `You are myaircraft.us's empty-state coach. The user is staring at a blank page in the app. Suggest 2-3 next actions they could take RIGHT NOW.

Rules:
- Each action must point at a concrete in-app route (e.g. "/aircraft/new", "/documents/upload").
- Tailor to the persona (owner / shop / mechanic / admin).
- Keep the label under 6 words. The reason must be under 18 words.
- Return STRICT JSON: { "suggestions": [ { "label": "...", "href": "...", "reason": "..." } ] }`

export async function suggestEmptyStateActions(args: {
  supabase: SupabaseClient
  triggeredBy?: string | null
  /** The pathname the user is on, e.g. '/aircraft' */
  pathname: string
  persona: EmptyPersona
  /** Optional hint from the calling component about what's empty. */
  resource?: string
}): Promise<{ ok: boolean; output?: EmptyStateOutput; runId?: string; error?: string }> {
  return runAgent<EmptyStateOutput>(
    'ux-help.empty-state-coach',
    {
      supabase: args.supabase,
      triggeredBy: args.triggeredBy ?? null,
      input: { pathname: args.pathname, persona: args.persona, resource: args.resource ?? null },
    },
    async (logger) => {
      // Heuristic fallback — keep the UI usable when the LLM is off.
      const heuristicByPath: Record<string, EmptyStateOutput> = {
        '/aircraft': {
          suggestions: [
            { label: 'Add your first aircraft', href: '/aircraft/new', reason: 'Set up the tail you want to track.' },
            { label: 'Upload a logbook PDF', href: '/documents', reason: "We'll OCR + extract entries automatically." },
          ],
        },
        '/work-orders': {
          suggestions: [
            { label: 'Open a new work order', href: '/work-orders/new', reason: 'Track labor + parts + signoff in one place.' },
            { label: 'Browse estimates', href: '/estimates', reason: 'Convert an approved estimate into a WO.' },
          ],
        },
        '/communications': {
          suggestions: [
            { label: 'Copy your inbox email', href: '/settings/inbox', reason: 'Send vendors receipts here — AI will file them.' },
            { label: 'Wire up Flight Schedule Pro', href: '/settings/inbox', reason: 'Auto-sync tach hours via the nightly scraper.' },
          ],
        },
      }
      if (!process.env.OPENAI_API_KEY) {
        return { output: heuristicByPath[args.pathname] ?? { suggestions: [] } }
      }
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      logger.recordModel('openai', 'gpt-4o-mini')
      const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_EMPTY_STATE_MODEL || 'gpt-4o-mini',
        temperature: 0.2,
        max_tokens: 220,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `Persona: ${args.persona}\nPath: ${args.pathname}\nResource: ${args.resource ?? '(none)'}\n\nReturn JSON.`,
          },
        ],
      })
      const usage = completion.usage
      if (usage) logger.recordTokens(usage.prompt_tokens ?? 0, usage.completion_tokens ?? 0)
      let parsed: Partial<EmptyStateOutput> = {}
      try {
        parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}')
      } catch {
        /* ignore */
      }
      const suggestions = Array.isArray(parsed.suggestions)
        ? parsed.suggestions
            .filter(
              (s): s is EmptySuggestion =>
                !!s && typeof s.label === 'string' && typeof s.href === 'string',
            )
            .slice(0, 3)
            .map((s) => ({
              label: s.label.slice(0, 60),
              href: s.href.slice(0, 200),
              reason: (s.reason ?? '').slice(0, 140),
            }))
        : (heuristicByPath[args.pathname]?.suggestions ?? [])
      return { output: { suggestions } }
    },
  )
}
