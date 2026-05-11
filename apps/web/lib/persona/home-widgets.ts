/**
 * Phase 13.6 — per-persona home widget configuration.
 *
 * Phase 18 mig 119 — mechanic persona was merged into shop. The widget
 * list for shop now includes the previously-mechanic-only entries
 * (my-wos-today, time-clock, scheduler-agenda) so a shop user who used
 * to log in as mechanic gets the same home surface they're used to.
 *
 * Each persona's home page reads this config and renders exactly these
 * widgets in order. Adding a widget here flips it on for that persona
 * without touching any home page code, provided the widget registry on
 * the page knows how to render the ID.
 */
import type { Persona } from '@/types'

export type WidgetId =
  // Owner
  | 'fleet-summary'
  | 'maintenance-status'
  | 'ingestion-progress-mine'
  | 'ask-aircraft'
  | 'economics-snapshot'
  // Shop (post-merge: incorporates legacy mechanic widgets)
  | 'my-wos-today'
  | 'time-clock'
  | 'scheduler-agenda'
  | 'parts-shortages'
  | 'recent-manuals'
  | 'wo-queue'
  | 'scheduler-overview'
  | 'billing-summary'
  | 'customer-approvals'
  | 'low-stock'
  // Admin
  | 'cross-org-metrics'
  | 'error-log'
  | 'worker-health'
  | 'review-queue-stats'
  | 'recent-uploads-global'

export const ALL_WIDGET_IDS: readonly WidgetId[] = [
  'fleet-summary',
  'maintenance-status',
  'ingestion-progress-mine',
  'ask-aircraft',
  'economics-snapshot',
  'my-wos-today',
  'time-clock',
  'scheduler-agenda',
  'parts-shortages',
  'recent-manuals',
  'wo-queue',
  'scheduler-overview',
  'billing-summary',
  'customer-approvals',
  'low-stock',
  'cross-org-metrics',
  'error-log',
  'worker-health',
  'review-queue-stats',
  'recent-uploads-global',
] as const

export const PERSONA_HOME_WIDGETS: Record<Persona, WidgetId[]> = {
  owner: [
    'fleet-summary',
    'maintenance-status',
    'ingestion-progress-mine',
    'ask-aircraft',
    'economics-snapshot',
  ],
  // Phase 18: shop = union of the old shop + old mechanic widget sets.
  // The union is large; future tuning should trim duplicates (e.g.
  // scheduler-agenda vs scheduler-overview) once UX preferences are clear.
  shop: [
    'my-wos-today',
    'wo-queue',
    'scheduler-agenda',
    'time-clock',
    'billing-summary',
    'parts-shortages',
    'low-stock',
    'customer-approvals',
    'recent-manuals',
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
  // Shop (includes former mechanic widgets)
  'my-wos-today': "Today's work orders",
  'time-clock': 'Time clock',
  'scheduler-agenda': "Today's schedule",
  'parts-shortages': 'Parts shortages',
  'recent-manuals': 'Recent reference manuals',
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

/**
 * Resolve the widget IDs for a persona. Returns a new array (safe to mutate).
 *
 * Phase 18 back-compat: a stale 'mechanic' input is folded to 'shop'.
 */
export function widgetsForPersona(persona: Persona | 'mechanic'): WidgetId[] {
  const key: Persona = persona === 'mechanic' ? 'shop' : persona
  return [...(PERSONA_HOME_WIDGETS[key] ?? [])]
}

/** Check if a specific widget is part of a persona's home. */
export function personaHasWidget(persona: Persona | 'mechanic', widget: WidgetId): boolean {
  const key: Persona = persona === 'mechanic' ? 'shop' : persona
  return PERSONA_HOME_WIDGETS[key]?.includes(widget) ?? false
}
