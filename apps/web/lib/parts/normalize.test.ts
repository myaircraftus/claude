import { describe, it, expect } from 'vitest'
import { normalizeQuery, classifySearchMode, extractPartNumber, buildProviderQuery } from './normalize'

describe('normalizeQuery', () => {
  it('collapses whitespace and trims', () => {
    expect(normalizeQuery('  oil    filter\n')).toBe('oil filter')
  })
  it('normalizes en/em dashes to hyphens', () => {
    expect(normalizeQuery('CH48110–1')).toBe('CH48110-1') // en dash
    expect(normalizeQuery('CH48110—1')).toBe('CH48110-1') // em dash
  })
})

describe('classifySearchMode', () => {
  it('detects an exact part number', () => {
    expect(classifySearchMode('CH48110-1')).toBe('exact_part')
    expect(classifySearchMode('MS20470AD4-5')).toBe('exact_part')
  })
  it('treats 1-3 plain words as keyword', () => {
    expect(classifySearchMode('oil filter')).toBe('keyword')
    expect(classifySearchMode('spark plugs')).toBe('keyword')
  })
  it('treats 4+ plain words as general', () => {
    expect(classifySearchMode('left main landing gear actuator')).toBe('general')
  })
  it('detects contextual phrasing ("for"/"fits"/"compatible" + 4+ words)', () => {
    expect(classifySearchMode('oil filter for Cessna 172')).toBe('contextual')
    expect(classifySearchMode('brake pads compatible with Piper Warrior')).toBe('contextual')
  })
  it('heuristic is literal: singular "fit" (not "fits") falls through to general', () => {
    // documents a known limitation of the keyword list, not a bug
    expect(classifySearchMode('brake pads that fit a Piper Warrior')).toBe('general')
  })
  it('does NOT call a long PN-containing phrase exact_part when the PN is <50% of it', () => {
    expect(classifySearchMode('CH48110-1 oil filter for my cessna')).toBe('contextual')
  })
})

describe('extractPartNumber', () => {
  it('extracts and uppercases a part number', () => {
    expect(extractPartNumber('need a CH48110-1 please')).toBe('CH48110-1')
    expect(extractPartNumber('ch48110-1')).toBe('CH48110-1')
    expect(extractPartNumber('MS20470AD4-5')).toBe('MS20470AD4-5')
  })
  it('returns null for plain descriptions', () => {
    expect(extractPartNumber('oil filter')).toBeNull()
    expect(extractPartNumber('spark plugs')).toBeNull()
  })
})

describe('buildProviderQuery', () => {
  it('passes an exact-part query through untouched', () => {
    expect(buildProviderQuery('CH48110-1', { mode: 'exact_part' })).toBe('CH48110-1')
  })
  it('appends aircraft make/model + engine context', () => {
    expect(
      buildProviderQuery('oil filter', {
        mode: 'keyword',
        aircraftMakeModel: 'Cessna 152',
        engineModel: 'Lycoming O-235',
      }),
    ).toBe('oil filter Cessna 152 Lycoming O-235')
  })
  it('appends "aircraft" for a bare keyword/general query with no usable context', () => {
    expect(buildProviderQuery('oil filter', { mode: 'keyword' })).toBe('oil filter aircraft')
  })
  it('strips "Unknown"/"N/A" garbage from context (then falls back to "aircraft")', () => {
    expect(
      buildProviderQuery('oil filter', {
        mode: 'keyword',
        aircraftMakeModel: 'Unknown',
        engineModel: 'N/A',
      }),
    ).toBe('oil filter aircraft')
  })
})
