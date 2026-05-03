/**
 * AI Prompt Library (Spec 0.3).
 *
 * Versioned prompts per task. Tasks are kept in one map so we can A/B
 * different versions and so model fine-tuning has a stable surface. The
 * orchestrator and tools both read from here.
 *
 * Conventions:
 *   - Each task is `<domain>.<action>` (e.g. `inbox.summarize`).
 *   - `current` is the version the runtime uses; older versions are kept
 *     so eval harnesses can compare regression.
 *   - Persona-conditioned wrapping is done by composePrompt() — it pulls
 *     the system prompt for the current persona from PERSONA_CONFIG and
 *     prepends it. Don't bake persona language into the task prompts.
 */

import { PERSONA_CONFIG } from '@/lib/persona/config'
import { getNotificationToneInstruction } from '@/lib/persona/defaults'
import type { Persona } from '@/types'

interface PromptVersion {
  version: string         // e.g. "v1", "v1.1"
  template: string
  notes?: string
}

interface PromptEntry {
  current: PromptVersion
  history: PromptVersion[]
}

export const AI_PROMPTS: Record<string, PromptEntry> = {
  /**
   * Used by the orchestrator's LLM pass to summarize a batch of recent
   * signals into a "what's worth surfacing" insight card.
   */
  'inbox.summarize': {
    current: {
      version: 'v1',
      template: `You are summarizing recent maintenance signals for an aviation operator.

Given the signals below, identify up to 3 items that warrant an ActionCard. For each, output:
- title (one sentence)
- body (1-2 sentences in plain English)
- evidence (bullet list of which signals support it)
- priority (urgent | high | normal | low)
- category (compliance | expiration | maintenance | approval | anomaly | insight)

Signals:
{{signals}}

Output as a JSON array. If nothing is worth surfacing, output an empty array.`,
    },
    history: [],
  },

  /**
   * Used to draft a logbook-entry ActionCard from a closed work order. Plugs
   * into the existing /api/ai/generate-logbook flow as a future migration
   * point — the prompt sits here so versioning is centralized.
   */
  'logbook.draft-from-wo': {
    current: {
      version: 'v1',
      template: `Draft an FAA-compliant logbook entry from the following work order. Use precise A&P language. Include corrective actions, parts replaced, and any continued items.

Work order:
{{work_order}}`,
    },
    history: [],
  },

  /**
   * Used to explain a single ActionCard back to the user (the "why does this
   * matter?" pull-down on a card). Keep it short — < 80 words.
   */
  'card.explain': {
    current: {
      version: 'v1',
      template: `Explain this maintenance ActionCard to the user in under 80 words. Be specific about why it matters and what action they should take.

Card:
{{card}}`,
    },
    history: [],
  },
} as const

/**
 * Compose the final prompt: persona system prompt + task template with vars
 * substituted. Variables in the template use {{name}} syntax.
 */
export function composePrompt(
  taskId: keyof typeof AI_PROMPTS,
  persona: Persona,
  variables: Record<string, string> = {},
): { system: string; user: string; version: string } {
  const entry = AI_PROMPTS[taskId]
  if (!entry) throw new Error(`Unknown prompt task: ${taskId}`)

  let user = entry.current.template
  for (const [key, value] of Object.entries(variables)) {
    user = user.replaceAll(`{{${key}}}`, value)
  }

  // Spec 5.8 — append the persona's notification-tone instruction to the
  // base aiSystemPrompt so generated text matches "plain English" /
  // "technical/FAR-aware" / "operations-focused" per persona.
  const tone = getNotificationToneInstruction(persona)
  return {
    system: `${PERSONA_CONFIG[persona].aiSystemPrompt}\n\n${tone}`,
    user,
    version: entry.current.version,
  }
}
