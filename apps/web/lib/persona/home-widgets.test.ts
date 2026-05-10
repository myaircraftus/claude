/**
 * Phase 13.6 — persona home widget config tests.
 */
import { describe, it, expect } from 'vitest'
import {
  PERSONA_HOME_WIDGETS,
  WIDGET_LABELS,
  ALL_WIDGET_IDS,
  widgetsForPersona,
  personaHasWidget,
  type WidgetId,
} from './home-widgets'
import { PERSONA_CONFIG } from './config'

describe('PERSONA_HOME_WIDGETS coverage', () => {
  it('every persona has a widget list with ≥3 entries', () => {
    for (const persona of ['owner', 'mechanic', 'shop', 'admin'] as const) {
      expect(PERSONA_HOME_WIDGETS[persona].length).toBeGreaterThanOrEqual(3)
    }
  })

  it('every widget ID has a friendly label', () => {
    const labelKeys = new Set(Object.keys(WIDGET_LABELS))
    for (const persona of ['owner', 'mechanic', 'shop', 'admin'] as const) {
      for (const w of PERSONA_HOME_WIDGETS[persona]) {
        expect(labelKeys.has(w), `label missing for ${w}`).toBe(true)
      }
    }
  })

  it('ALL_WIDGET_IDS is comprehensive', () => {
    const referenced = new Set<string>()
    for (const persona of ['owner', 'mechanic', 'shop', 'admin'] as const) {
      for (const w of PERSONA_HOME_WIDGETS[persona]) referenced.add(w)
    }
    for (const w of referenced) {
      expect(ALL_WIDGET_IDS).toContain(w as WidgetId)
    }
  })
})

describe('persona-specific widget sets', () => {
  it('owner home is owner-themed (fleet, maintenance, economics)', () => {
    const ws = widgetsForPersona('owner')
    expect(ws).toContain('fleet-summary')
    expect(ws).toContain('economics-snapshot')
    expect(ws).toContain('ingestion-progress-mine')
    // Should NOT contain mechanic/admin widgets
    expect(ws).not.toContain('my-wos-today')
    expect(ws).not.toContain('cross-org-metrics')
  })

  it('mechanic home is mechanic-themed (wos, scheduler, parts)', () => {
    const ws = widgetsForPersona('mechanic')
    expect(ws).toContain('my-wos-today')
    expect(ws).toContain('scheduler-agenda')
    expect(ws).toContain('parts-shortages')
    expect(ws).not.toContain('fleet-summary')
    expect(ws).not.toContain('economics-snapshot')
    expect(ws).not.toContain('cross-org-metrics')
  })

  it('shop home is shop-themed (queue, billing, low-stock)', () => {
    const ws = widgetsForPersona('shop')
    expect(ws).toContain('wo-queue')
    expect(ws).toContain('billing-summary')
    expect(ws).toContain('low-stock')
    expect(ws).not.toContain('fleet-summary')
    expect(ws).not.toContain('cross-org-metrics')
  })

  it('admin home is admin-themed (cross-org, errors, workers)', () => {
    const ws = widgetsForPersona('admin')
    expect(ws).toContain('cross-org-metrics')
    expect(ws).toContain('error-log')
    expect(ws).toContain('worker-health')
    expect(ws).not.toContain('fleet-summary')
    expect(ws).not.toContain('my-wos-today')
  })
})

describe('homeRoute integrity', () => {
  it('owner.homeRoute is /my-aircraft', () => {
    expect(PERSONA_CONFIG.owner.homeRoute).toBe('/my-aircraft')
  })
  it('mechanic.homeRoute is /my-day', () => {
    expect(PERSONA_CONFIG.mechanic.homeRoute).toBe('/my-day')
  })
  it('shop.homeRoute is /workflow', () => {
    expect(PERSONA_CONFIG.shop.homeRoute).toBe('/workflow')
  })
  it('admin.homeRoute is /admin/command-center (Phase 16 Sprint 16.7)', () => {
    expect(PERSONA_CONFIG.admin.homeRoute).toBe('/admin/command-center')
  })
})

describe('personaHasWidget', () => {
  it('returns true for owner + fleet-summary', () => {
    expect(personaHasWidget('owner', 'fleet-summary')).toBe(true)
  })
  it('returns false for owner + cross-org-metrics', () => {
    expect(personaHasWidget('owner', 'cross-org-metrics')).toBe(false)
  })
  it('returns true for admin + error-log', () => {
    expect(personaHasWidget('admin', 'error-log')).toBe(true)
  })
})
