/**
 * Phase 14 Sprint 14.4 — handwriting detector tests.
 *
 * The Claude Vision call itself isn't unit-tested (it's an external API);
 * we cover the parser + the public contract.
 */
import { describe, it, expect } from 'vitest'
import { parseHandwritingPercent } from './handwriting-detector'

describe('parseHandwritingPercent', () => {
  it('parses bare integer', () => {
    expect(parseHandwritingPercent('30')).toBe(30)
  })
  it('parses with percent sign', () => {
    expect(parseHandwritingPercent('30%')).toBe(30)
  })
  it('parses prose with embedded number', () => {
    expect(parseHandwritingPercent('Approximately 75 percent')).toBe(75)
  })
  it('parses 0 and 100 boundaries', () => {
    expect(parseHandwritingPercent('0')).toBe(0)
    expect(parseHandwritingPercent('100')).toBe(100)
  })
  it('rejects out-of-range numbers', () => {
    expect(parseHandwritingPercent('150')).toBe(null)
    expect(parseHandwritingPercent('999')).toBe(null)
  })
  it('returns null for empty / non-numeric', () => {
    expect(parseHandwritingPercent('')).toBe(null)
    expect(parseHandwritingPercent('handwritten')).toBe(null)
    expect(parseHandwritingPercent('I cannot determine')).toBe(null)
  })
  it('takes the first integer when multiple are present', () => {
    // Conservative: model said "Pages 1-5 show ~25%..." → 1 is parsed
    // first. Acceptable for our v1 use case: detector is advisory only,
    // user confirms.
    expect(parseHandwritingPercent('Pages 1-5 show ~25%')).toBe(1)
  })
})
