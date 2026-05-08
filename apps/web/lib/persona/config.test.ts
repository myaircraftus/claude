/**
 * Unit tests for /lib/persona/config.
 *
 * Persona is the pivot the entire UI branches on. A regression here
 * (typo in PERSONA_CONFIG, wrong fallback in resolvePersona, broken
 * isModuleHidden) leaks shop-only modules to owners, breaks the home
 * route, or silently coerces invalid personas to the wrong default.
 */
import { describe, it, expect } from 'vitest'
import {
  PERSONA_CONFIG,
  DEFAULT_PERSONA,
  isPersona,
  resolvePersona,
  isModuleHidden,
} from './config'
import type { Persona } from '@/types'

// Canonical persona enum — config.ts doesn't export this as an array,
// it's encoded in the Persona type. Mirrored here so the test breaks
// loudly if the Record<Persona, …> definition drifts.
const PERSONAS = ['owner', 'mechanic', 'shop', 'admin'] as const satisfies readonly Persona[]

describe('persona enum coverage', () => {
  it('Record<Persona, …> has exactly 4 keys (matches the enum)', () => {
    expect(Object.keys(PERSONA_CONFIG)).toHaveLength(4)
    expect(new Set(Object.keys(PERSONA_CONFIG))).toEqual(new Set(PERSONAS))
  })
})

describe('PERSONA_CONFIG', () => {
  it('has an entry for every persona in the enum', () => {
    for (const p of PERSONAS) {
      expect(PERSONA_CONFIG[p]).toBeDefined()
    }
  })

  it.each(['owner', 'mechanic', 'shop', 'admin'] as const)(
    '%s config has all required keys',
    (p) => {
      const c = PERSONA_CONFIG[p]
      expect(c.homeRoute).toBeTruthy()
      expect(c.homeRoute.startsWith('/')).toBe(true)
      expect(Array.isArray(c.sidebarSections)).toBe(true)
      expect(c.sidebarSections.length).toBeGreaterThan(0)
      expect(Array.isArray(c.hiddenModules)).toBe(true)
      expect(c.aiSystemPrompt.length).toBeGreaterThan(20)
      expect(Array.isArray(c.homeCardPriorities)).toBe(true)
      expect(c.label).toBeTruthy()
    },
  )

  it('owner hides the financial / labor-rate modules per spec 5.8', () => {
    expect(PERSONA_CONFIG.owner.hiddenModules).toContain('work-orders-financials')
    expect(PERSONA_CONFIG.owner.hiddenModules).toContain('labor-rates')
  })

  it('mechanic hides org-billing + owner-finances', () => {
    expect(PERSONA_CONFIG.mechanic.hiddenModules).toContain('org-billing')
    expect(PERSONA_CONFIG.mechanic.hiddenModules).toContain('owner-finances')
  })

  it('shop and admin have full visibility (no hidden modules)', () => {
    // Spec 5.8 + comments in config.ts: shop/admin are full-access personas.
    expect(PERSONA_CONFIG.shop.hiddenModules).toEqual([])
    expect(PERSONA_CONFIG.admin.hiddenModules).toEqual([])
  })

  it('every homeRoute is an absolute path', () => {
    for (const p of PERSONAS) {
      expect(PERSONA_CONFIG[p].homeRoute).toMatch(/^\/[^/]/)
    }
  })

  it('hiddenModules entries are kebab-case strings', () => {
    for (const p of PERSONAS) {
      for (const m of PERSONA_CONFIG[p].hiddenModules) {
        expect(m).toMatch(/^[a-z0-9-]+$/)
      }
    }
  })
})

describe('isPersona', () => {
  it.each(['owner', 'mechanic', 'shop', 'admin'])('accepts %s', (v) => {
    expect(isPersona(v)).toBe(true)
  })

  it.each(['Owner', 'OWNER', 'pilot', 'auditor', 'viewer', '', '  owner'])(
    'rejects similar-but-wrong: %s',
    (v) => {
      expect(isPersona(v)).toBe(false)
    },
  )

  it.each([null, undefined, 0, 1, true, false, {}, [], () => 'owner'])(
    'rejects non-string %s',
    (v) => {
      expect(isPersona(v)).toBe(false)
    },
  )
})

describe('resolvePersona fallback chain', () => {
  it('uses membership when valid', () => {
    expect(resolvePersona('mechanic', 'owner')).toBe('mechanic')
    expect(resolvePersona('shop', null)).toBe('shop')
  })

  it('falls through to user_profile when membership is invalid', () => {
    expect(resolvePersona(null, 'owner')).toBe('owner')
    expect(resolvePersona(undefined, 'admin')).toBe('admin')
    expect(resolvePersona('garbage', 'mechanic')).toBe('mechanic')
  })

  it('falls through to DEFAULT_PERSONA when both are invalid', () => {
    expect(resolvePersona(null, null)).toBe(DEFAULT_PERSONA)
    expect(resolvePersona('a', 'b')).toBe(DEFAULT_PERSONA)
    expect(resolvePersona(undefined, undefined)).toBe(DEFAULT_PERSONA)
  })

  it('DEFAULT_PERSONA itself is a valid persona', () => {
    expect(isPersona(DEFAULT_PERSONA)).toBe(true)
  })

  it('never returns an invalid string (caller-trust contract)', () => {
    // Brute-force: every (membership, profile) pair from a chaotic
    // input set still yields a valid Persona on output.
    const garbage = ['owner', 'OWNER', null, undefined, '', 'pilot', 0, true, ' admin']
    for (const m of garbage) {
      for (const u of garbage) {
        const out = resolvePersona(m as any, u as any)
        expect(isPersona(out)).toBe(true)
      }
    }
  })
})

describe('isModuleHidden', () => {
  it('returns true when persona has the module in hiddenModules', () => {
    expect(isModuleHidden('owner', 'work-orders-financials')).toBe(true)
    expect(isModuleHidden('mechanic', 'org-billing')).toBe(true)
  })

  it('returns false when persona does not hide the module', () => {
    expect(isModuleHidden('shop', 'work-orders-financials')).toBe(false)
    expect(isModuleHidden('admin', 'org-billing')).toBe(false)
    expect(isModuleHidden('owner', 'parts')).toBe(false) // not in any hiddenModules list
  })

  it('returns false for shop and admin on every module key (full-access contract)', () => {
    const keys = [
      'work-orders-financials',
      'labor-rates',
      'shop-pricing',
      'org-billing',
      'owner-finances',
      'arbitrary-future-key',
    ]
    for (const k of keys) {
      expect(isModuleHidden('shop', k)).toBe(false)
      expect(isModuleHidden('admin', k)).toBe(false)
    }
  })

  it('returns false for any module key not in any hiddenModules list', () => {
    expect(isModuleHidden('owner', 'totally-new-module')).toBe(false)
    expect(isModuleHidden('mechanic', 'totally-new-module')).toBe(false)
  })
})
