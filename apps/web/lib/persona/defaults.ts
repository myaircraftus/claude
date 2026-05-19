/**
 * Persona defaults (Spec 5.8).
 *
 * PERSONA_CONFIG (sprint 0.2) is the immutable definition of homeRoute /
 * sidebarSections / hiddenModules / aiSystemPrompt / homeCardPriorities.
 * This module ADDS the defaults that the UI applies when surfacing data
 * lists — date range, group-by column, sort order — and exposes the
 * combined config + per-user overrides as a single shape.
 *
 * Per-user overrides live on `organization_memberships.persona_overrides`
 * (JSONB, added in migration 084). They patch the per-persona defaults
 * without changing the shared config.
 */

import { PERSONA_CONFIG, type PersonaConfig } from './config'
import type { Persona } from '@/types'

/** Date-range presets the UI's view-shell maps to a Date object pair. */
export type DefaultDateRange = '7d' | '30d' | '90d' | '365d' | 'ytd'

/** Sort direction shorthand. */
export type DefaultSortDirection = 'asc' | 'desc'

export interface PersonaDefaults {
  /** Default lookback window for list views (cost ledger, WO history, etc.). */
  defaultDateRange: DefaultDateRange
  /** Column key to group lists by when no explicit user view is active. */
  defaultGroupBy: string | null
  /** Default sort column + direction when no user view is active. */
  defaultSort: { field: string; direction: DefaultSortDirection }
  /**
   * Notification tone profile — passed through to lib/ai/prompts.ts when
   * generating notification copy. Maps to `Notification tone` row of the
   * spec table: "Plain English" / "Technical / FAR-aware" / "Operations-focused".
   */
  notificationTone: 'plain' | 'technical' | 'operations'
  /**
   * Voice intent priors — what the operator is most likely to ask. Used
   * by future voice-input layers (Spec 5.4) to seed a small intent
   * classifier. Storing here as plain strings keeps the source of truth
   * out of the voice module.
   */
  voiceIntentPriors: string[]
}

const PERSONA_DEFAULTS: Record<Persona, PersonaDefaults> = {
  owner: {
    defaultDateRange: '90d',
    defaultGroupBy: 'aircraft_id',
    defaultSort: { field: 'cost_date', direction: 'desc' },
    notificationTone: 'plain',
    voiceIntentPriors: ["What's due?", 'How much will it cost?', 'When is my annual?', 'Show me my receipts'],
  },
  shop: {
    defaultDateRange: '30d',
    defaultGroupBy: 'status',
    defaultSort: { field: 'opened_at', direction: 'desc' },
    notificationTone: 'operations',
    voiceIntentPriors: ['Pipeline', 'Status', 'Reports', 'Low stock', 'Today schedule'],
  },
  admin: {
    defaultDateRange: '30d',
    defaultGroupBy: null,
    defaultSort: { field: 'created_at', direction: 'desc' },
    notificationTone: 'operations',
    voiceIntentPriors: ['Org settings', 'User roles', 'Billing', 'Audit log'],
  },
}

/**
 * Combined persona config — base PERSONA_CONFIG (immutable) + the new
 * 5.8 defaults — with optional per-user JSON overrides patched on top.
 *
 * `overrides` is the raw shape stored in
 * organization_memberships.persona_overrides. Unknown keys are ignored
 * silently so a future override can land in the DB without breaking
 * older clients.
 */
export interface ResolvedPersonaPrefs extends PersonaConfig, PersonaDefaults {
  persona: Persona
}

export function getDefaultsForPersona(persona: Persona): PersonaDefaults {
  return PERSONA_DEFAULTS[persona]
}

export function resolvePersonaPrefs(
  persona: Persona,
  overrides?: Partial<PersonaDefaults> | null,
): ResolvedPersonaPrefs {
  const base = PERSONA_CONFIG[persona]
  const defaults = PERSONA_DEFAULTS[persona]
  const ov = (overrides ?? {}) as Partial<PersonaDefaults>
  return {
    ...base,
    ...defaults,
    ...ov,
    persona,
  }
}

/**
 * Notification-tone-aware system-prompt prefix. Composes with
 * PERSONA_CONFIG[persona].aiSystemPrompt — caller concatenates with a
 * newline. Future: replace with a small templating layer if multiple
 * sub-prompts need coordination.
 */
export function getNotificationToneInstruction(persona: Persona): string {
  const tone = PERSONA_DEFAULTS[persona].notificationTone
  switch (tone) {
    case 'plain':
      return 'Tone: plain English. Translate maintenance jargon. No FAR/AD references unless the user asks.'
    case 'technical':
      return 'Tone: technical and FAR-aware. Reference FARs, ADs, SBs by number when relevant.'
    case 'operations':
      return 'Tone: operations-focused. Lead with throughput, profitability, and exceptions.'
  }
}
