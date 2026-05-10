'use client'

/**
 * Phase 13.6 — persona home widget grid.
 *
 * Renders the canonical widget IDs from PERSONA_HOME_WIDGETS for the active
 * persona. Each home page defines its own widget→component mapping via the
 * `registry` prop and can fall back to a placeholder for IDs it doesn't
 * implement yet. This keeps the home pages free of `if (persona === ...)`
 * branches: change the widget set in lib/persona/home-widgets.ts and the
 * home page picks it up automatically.
 *
 * Typical usage (server-rendered home page):
 *
 *   <PersonaHomeWidgetGrid
 *     persona="admin"
 *     registry={{
 *       'cross-org-metrics': () => <CrossOrgMetricsCard ... />,
 *       'error-log':         () => <ErrorLogCard ... />,
 *       'worker-health':     () => <WorkerHealthCard ... />,
 *     }}
 *   />
 */
import type { ReactNode } from 'react'
import type { Persona } from '@/types'
import {
  WIDGET_LABELS,
  widgetsForPersona,
  type WidgetId,
} from '@/lib/persona/home-widgets'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export interface PersonaHomeWidgetGridProps {
  persona: Persona
  /** Map of widget ID → render function. Missing IDs render a placeholder. */
  registry: Partial<Record<WidgetId, () => ReactNode>>
  className?: string
}

export function PersonaHomeWidgetGrid({
  persona,
  registry,
  className,
}: PersonaHomeWidgetGridProps) {
  const widgets = widgetsForPersona(persona)
  return (
    <div className={`grid gap-3 sm:grid-cols-2 lg:grid-cols-3 ${className ?? ''}`}>
      {widgets.map((id) => {
        const render = registry[id]
        if (render) return <div key={id}>{render()}</div>
        return (
          <Card key={id} className="opacity-60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{WIDGET_LABELS[id]}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Coming soon — declared for {persona} but no renderer registered
              on this page yet.
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
