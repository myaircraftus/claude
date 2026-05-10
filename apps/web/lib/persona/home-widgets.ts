/**
 * Phase 13.6 — persona-strict home page widget configuration.
 *
 * Single source of truth for which widgets each persona's home page renders.
 * Keeps home pages free of `if (persona === 'X')` branches and makes it easy
 * to A/B test new widgets per persona via config rather than code edits.
 *
 * Widget IDs are stable strings — UI components map them to actual React
 * components via a registry on the home page itself. New widgets must be
 * added here AND in the registry.
 */
import type { Persona } from '@/types'

/** Stable widget identifiers used across home surfaces. */
export type WidgetId =
  // Owner widgets
  | 'fleet-summary'
  | 'maintenance-status'
  | 'ingestion-progress-mine'
  | 'ask-aircraft'
  | 'economics-snapshot'
  // Mechanic widgets
  | 'my-wos-today'
  | 'time-clock'
  | 'scheduler-agenda'
  | 'parts-shortages'
  | 'recent-manuals'
  // Shop widgets
  | 'wo-queue'
  | 'scheduler-overview'
  | 'billing-summary'
  | 'customer-approvals'
  | 'low-stock'
  // Admin widgets
  | 'cross-org-metrics'
  | 'error-log'
  | 'worker-health'
  | 'review-queue-stats'
  | 'recent-uploads-global'

/**
 * Persona × widget matrix. Each persona's home page reads this config and
 * renders exactly these widgets in order. Adding a widget here flips it on
 * for that persona without touching any home page code, provided the widget
 * registry on the page knows how to render the ID.
 */
export const PERSONA_HOME_WIDGETS: Record<Persona, WidgetId[]> = {
  owner: [
    'fleet-summary',
    'maintenance-status',
    'ingestion-progress-mine',
    'ask-aircraft',
    'economics-snapshot',
  ],
  mechanic: [
    'my-wos-today',
    'time-clock',
    'scheduler-agenda',
    'parts-shortages',
    'recent-manuals',
  ],
  shop: [
    'wo-queue',
    'scheduler-overview',
    'billing-summary',
    'customer-approvals',
    'low-stock',
  ],
  admin: [
    'cross-org-metrics',
    'error-log',
    'worker-health',
    'review-queue-stats',
    'recent-uploads-global',
  ],
}

/** Friendly labels shown in widget headers and analytics. */
export const WIDGET_LABELS: Record<WidgetId, string> = {
  // Owner
  'fleet-summary': 'Your fleet',
  'maintenance-status': 'Maintenance status',
  'ingestion-progress-mine': "Documents you've uploaded",
  'ask-aircraft': 'Ask your aircraft',
  'economics-snapshot': 'Costs this month',
  // Mechanic
  'my-wos-today': "Today's work orders",
  'time-clock': 'Time clock',
  'scheduler-agenda': "Today's schedule",
  'parts-shortages': 'Parts shortages',
  'recent-manuals': 'Recent reference manuals',
  // Shop
  'wo-queue': 'Work order queue',
  'scheduler-overview': 'Scheduler overview',
  'billing-summary': 'Billing summary',
  'customer-approvals': 'Customer approvals',
  'low-stock': 'Low-stock parts',
  // Admin
  'cross-org-metrics': 'Cross-org metrics',
  'error-log': 'Recent errors',
  'worker-health': 'Worker health',
  'review-queue-stats': 'Review queue',
  'recent-uploads-global': 'Recent uploads (all orgs)',
}

/** Resolve the widget IDs for a persona. Returns a new array (safe to mutate). */
export function widgetsForPersona(persona: Persona): WidgetId[] {
  return [...(PERSONA_HOME_WIDGETS[persona] ?? [])]
}

/** Check if a specific widget is part of a persona's home. */
export function personaHasWidget(persona: Persona, widget: WidgetId): boolean {
  return PERSONA_HOME_WIDGETS[persona]?.includes(widget) ?? false
}

/** All known widget IDs (for the registry to validate against). */
export const ALL_WIDGET_IDS: WidgetId[] = Object.keys(WIDGET_LABELS) as WidgetId[]
