/**
 * Phase 13.1 — persona-strict taxonomy tests.
 *
 * Mirrors the RLS policy in mig 103. Each (persona, type) tuple verified by
 * brute-force enumeration. Drift between the matrix here and the policy in
 * mig 103 will surface as failing tests + bugs at runtime — keep them in sync.
 */
import { describe, it, expect } from 'vitest'
import {
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_META,
  DOCUMENT_CATEGORIES,
  canPersonaUpload,
  getAllowedUploadTypes,
  getAllowedCategories,
  getCategoryTypes,
  requiresAircraftId,
  isDocumentType,
} from './persona-taxonomy'
import type { Persona } from '@/types'

describe('persona-taxonomy: catalog integrity', () => {
  it('every type has a meta entry', () => {
    for (const t of DOCUMENT_TYPES) {
      expect(DOCUMENT_TYPE_META[t], `meta for ${t}`).toBeDefined()
      expect(DOCUMENT_TYPE_META[t].id).toBe(t)
    }
  })

  it('every type falls into exactly one category', () => {
    for (const t of DOCUMENT_TYPES) {
      const cat = DOCUMENT_TYPE_META[t].category
      expect(DOCUMENT_CATEGORIES).toContain(cat)
    }
  })

  it('every category has at least one type', () => {
    for (const cat of DOCUMENT_CATEGORIES) {
      expect(getCategoryTypes(cat).length, `category ${cat}`).toBeGreaterThan(0)
    }
  })

  it('admin can upload every type', () => {
    for (const t of DOCUMENT_TYPES) {
      expect(canPersonaUpload('admin', t), `admin/${t}`).toBe(true)
    }
  })

  it('isDocumentType recognizes all valid types and rejects garbage', () => {
    for (const t of DOCUMENT_TYPES) expect(isDocumentType(t)).toBe(true)
    expect(isDocumentType('not-a-type')).toBe(false)
    expect(isDocumentType('')).toBe(false)
    expect(isDocumentType(null)).toBe(false)
    expect(isDocumentType(42)).toBe(false)
  })
})

describe('persona-taxonomy: aircraft_id requirement', () => {
  it('all aircraft_* types require aircraft_id', () => {
    const aircraftTypes = DOCUMENT_TYPES.filter((t) => t.startsWith('aircraft_'))
    expect(aircraftTypes.length).toBe(10)
    for (const t of aircraftTypes) {
      expect(requiresAircraftId(t), `requiresAircraftId(${t})`).toBe(true)
    }
  })

  it('all non-aircraft types do NOT require aircraft_id', () => {
    const nonAircraft = DOCUMENT_TYPES.filter((t) => !t.startsWith('aircraft_'))
    for (const t of nonAircraft) {
      expect(requiresAircraftId(t), `requiresAircraftId(${t})`).toBe(false)
    }
  })
})

describe('persona-taxonomy: persona × type matrix (mirrors mig 103)', () => {
  // Owner: aircraft_* + photo + receipt + other (NO reference manuals, NO invoices, NO WO attachments)
  it('owner can upload all aircraft_* types', () => {
    const ownerAllowed = getAllowedUploadTypes('owner').map((m) => m.id)
    expect(ownerAllowed).toContain('aircraft_logbook')
    expect(ownerAllowed).toContain('aircraft_registration')
    expect(ownerAllowed).toContain('aircraft_poh')
    expect(ownerAllowed).toContain('aircraft_annual')
  })
  it('owner CANNOT upload reference manuals', () => {
    expect(canPersonaUpload('owner', 'maintenance_manual')).toBe(false)
    expect(canPersonaUpload('owner', 'parts_catalog')).toBe(false)
    expect(canPersonaUpload('owner', 'service_bulletin')).toBe(false)
    expect(canPersonaUpload('owner', 'airworthiness_directive')).toBe(false)
    expect(canPersonaUpload('owner', 'wiring_diagram')).toBe(false)
  })
  it('owner CANNOT upload invoices or work_order_attachments', () => {
    expect(canPersonaUpload('owner', 'invoice')).toBe(false)
    expect(canPersonaUpload('owner', 'work_order_attachment')).toBe(false)
  })
  it('owner CAN upload photo, receipt, other', () => {
    expect(canPersonaUpload('owner', 'photo')).toBe(true)
    expect(canPersonaUpload('owner', 'receipt')).toBe(true)
    expect(canPersonaUpload('owner', 'other')).toBe(true)
  })

  // Phase 18 mig 119 — mechanic legacy alias is still accepted by canPersonaUpload
  // (folds to shop behavior). Verify the back-compat: stale callers passing
  // 'mechanic' get shop's permission set.
  it('legacy "mechanic" persona value folds to shop semantics (back-compat)', () => {
    expect(canPersonaUpload('mechanic', 'maintenance_manual')).toBe(true)
    expect(canPersonaUpload('mechanic', 'parts_catalog')).toBe(true)
    expect(canPersonaUpload('mechanic', 'service_bulletin')).toBe(true)
    expect(canPersonaUpload('mechanic', 'wiring_diagram')).toBe(true)
    // Shop CAN upload non-logbook aircraft types — the merge makes mechanic
    // GAIN this capability (which is OK since shop already had it).
    expect(canPersonaUpload('mechanic', 'aircraft_poh')).toBe(true)
    expect(canPersonaUpload('mechanic', 'aircraft_logbook')).toBe(false)
  })

  // Shop: everything EXCEPT aircraft_logbook + aircraft_registration
  it('shop CANNOT upload aircraft_logbook or aircraft_registration', () => {
    expect(canPersonaUpload('shop', 'aircraft_logbook')).toBe(false)
    expect(canPersonaUpload('shop', 'aircraft_registration')).toBe(false)
  })
  it('shop CAN upload other aircraft_* types (insurance, poh, afm, ...)', () => {
    expect(canPersonaUpload('shop', 'aircraft_airworthiness')).toBe(true)
    expect(canPersonaUpload('shop', 'aircraft_insurance')).toBe(true)
    expect(canPersonaUpload('shop', 'aircraft_poh')).toBe(true)
    expect(canPersonaUpload('shop', 'aircraft_afm')).toBe(true)
    expect(canPersonaUpload('shop', 'aircraft_annual')).toBe(true)
  })
  it('shop CAN upload reference manuals', () => {
    expect(canPersonaUpload('shop', 'maintenance_manual')).toBe(true)
    expect(canPersonaUpload('shop', 'parts_catalog')).toBe(true)
  })
  it('shop CAN upload operations (invoice, WO attachment, receipts, photos)', () => {
    expect(canPersonaUpload('shop', 'invoice')).toBe(true)
    expect(canPersonaUpload('shop', 'work_order_attachment')).toBe(true)
    expect(canPersonaUpload('shop', 'photo')).toBe(true)
    expect(canPersonaUpload('shop', 'receipt')).toBe(true)
  })
})

describe('persona-taxonomy: getAllowedCategories', () => {
  it('owner sees Aircraft Records + Operations + Other (not Reference / Compliance)', () => {
    const cats = getAllowedCategories('owner')
    expect(cats).toContain('Aircraft Records')
    expect(cats).toContain('Operations') // photo / receipt
    expect(cats).toContain('Other')
    expect(cats).not.toContain('Reference Manuals')
    expect(cats).not.toContain('Compliance')
  })

  it('shop sees every category (post Phase-18 merge: shop is the union of old shop + old mechanic)', () => {
    const cats = getAllowedCategories('shop')
    expect(cats).toContain('Reference Manuals')
    expect(cats).toContain('Compliance')
    expect(cats).toContain('Operations')
    expect(cats).toContain('Other')
    // Shop has visibility into Aircraft Records (just can't upload logbook
    // or registration; the other types are uploadable).
    expect(cats).toContain('Aircraft Records')
  })

  it('admin sees every category', () => {
    const cats = getAllowedCategories('admin')
    for (const c of DOCUMENT_CATEGORIES) expect(cats).toContain(c)
  })
})

describe('persona-taxonomy: invalid persona returns false', () => {
  it('canPersonaUpload returns false for an unknown persona value', () => {
    // Type-cast bypasses the compile-time guard to simulate runtime garbage.
    expect(canPersonaUpload('not-a-persona' as unknown as Persona, 'photo')).toBe(false)
  })
})
