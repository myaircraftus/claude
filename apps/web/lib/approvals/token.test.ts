/**
 * Unit tests for /lib/approvals/token.
 *
 * The token is the ONLY auth on customer-facing /approvals/<token> URLs,
 * so the entropy + alphabet + length contract are security-relevant —
 * regressions here would weaken the public-link guarantee.
 */
import { describe, it, expect } from 'vitest'
import { generateApprovalToken, isValidTokenShape } from './token'

const CROCKFORD_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789'

describe('generateApprovalToken', () => {
  it('produces a 32-character string', () => {
    const t = generateApprovalToken()
    expect(t).toHaveLength(32)
    expect(typeof t).toBe('string')
  })

  it('only uses Crockford base32 alphabet (no I/L/O/U, no 0/1)', () => {
    const t = generateApprovalToken()
    for (const ch of t) {
      expect(CROCKFORD_ALPHABET).toContain(ch)
    }
    // Belt-and-braces: explicitly assert the confusing-pair characters
    // never appear.
    expect(t).not.toMatch(/[ILOU01]/)
  })

  it('is non-deterministic (no two calls match)', () => {
    // Birthday-collision odds at 1024 samples on ~160-bit entropy are
    // astronomically low; if this fails twice, something is very wrong.
    const seen = new Set<string>()
    for (let i = 0; i < 1024; i++) {
      const t = generateApprovalToken()
      expect(seen.has(t)).toBe(false)
      seen.add(t)
    }
  })

  it('uses every alphabet character at least once across 1000 tokens', () => {
    // Cheap distribution sanity-check: with ~32k chars sampled (1000 × 32)
    // and a 30-char alphabet, the probability of any character never
    // appearing is essentially zero. If this fails, the modular projection
    // is biased to the point of breaking.
    const seen = new Set<string>()
    for (let i = 0; i < 1000; i++) {
      for (const ch of generateApprovalToken()) seen.add(ch)
    }
    expect(seen.size).toBe(CROCKFORD_ALPHABET.length)
  })
})

describe('isValidTokenShape', () => {
  it('accepts a real token', () => {
    expect(isValidTokenShape(generateApprovalToken())).toBe(true)
  })

  it('accepts a minimal 20-char token (older format compat)', () => {
    expect(isValidTokenShape('ABCDEFGHJKMNPQRSTVWX')).toBe(true)
  })

  it('rejects too-short tokens', () => {
    expect(isValidTokenShape('ABC')).toBe(false)
    expect(isValidTokenShape('A'.repeat(19))).toBe(false)
  })

  it('rejects too-long tokens', () => {
    expect(isValidTokenShape('A'.repeat(65))).toBe(false)
  })

  it('rejects lowercase / mixed case', () => {
    expect(isValidTokenShape('abcdefghjkmnpqrstvwx')).toBe(false)
    expect(isValidTokenShape('AbCdEfGhJkMnPqRsTvWx')).toBe(false)
  })

  it('rejects URL-unsafe characters', () => {
    expect(isValidTokenShape('AAAAAAAAAAAAAAAAAAA/')).toBe(false)
    expect(isValidTokenShape('AAAAAAAAAAAAAAAAAAA?')).toBe(false)
    expect(isValidTokenShape('AAAAAAAAAAAAAAAAAAA ')).toBe(false)
    expect(isValidTokenShape('AAAAAAAAAAAAAAAAAAA-')).toBe(false)
  })

  it('rejects non-string inputs', () => {
    expect(isValidTokenShape(undefined)).toBe(false)
    expect(isValidTokenShape(null)).toBe(false)
    expect(isValidTokenShape(0)).toBe(false)
    expect(isValidTokenShape({})).toBe(false)
    expect(isValidTokenShape([])).toBe(false)
  })

  // The current regex /^[A-Z0-9]{20,64}$/ permits I/L/O/U + 0/1 even
  // though the generator never emits them. That's intentional (the
  // validator is shape-only, not generator-equivalence) — capture it
  // explicitly so anyone tightening the regex later knows the prior
  // contract.
  it('shape-validator is intentionally looser than the generator alphabet', () => {
    expect(isValidTokenShape('A'.repeat(32))).toBe(true)
    expect(isValidTokenShape('I'.repeat(32))).toBe(true) // generator excludes I; validator allows
    expect(isValidTokenShape('0'.repeat(32))).toBe(true) // generator excludes 0; validator allows
  })
})
