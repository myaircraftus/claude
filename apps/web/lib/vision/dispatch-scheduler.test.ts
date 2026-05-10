/**
 * Phase 14 Sprint 14.3 — tier-aware dispatch-scheduler tests.
 *
 * Locks the routing matrix:
 *   beta + small      → realtime (NOW)
 *   pro + small       → realtime (NOW)
 *   standard + small  → batch (next 02:00 UTC)
 *   any tier + >200pg → batch (next 02:00 UTC) — large-doc rule trumps tier
 */
import { describe, it, expect } from 'vitest'
import {
  computeScheduledFor,
  isReadyToClaim,
  explainScheduling,
} from './dispatch-scheduler'

const NOW = new Date('2026-05-09T16:00:00Z') // 4 PM UTC = before next batch window

describe('computeScheduledFor — tier matrix', () => {
  it('beta + small → realtime (now)', () => {
    expect(computeScheduledFor('beta', 50, NOW)).toBe(NOW.toISOString())
  })
  it('pro + small → realtime (now)', () => {
    expect(computeScheduledFor('pro', 50, NOW)).toBe(NOW.toISOString())
  })
  it('standard + small → batch (next 02:00 UTC)', () => {
    expect(computeScheduledFor('standard', 50, NOW)).toBe('2026-05-10T02:00:00.000Z')
  })
})

describe('computeScheduledFor — large doc rule trumps tier', () => {
  it('beta + 250 pages → batch (large-doc)', () => {
    expect(computeScheduledFor('beta', 250, NOW)).toBe('2026-05-10T02:00:00.000Z')
  })
  it('pro + 250 pages → batch (large-doc)', () => {
    expect(computeScheduledFor('pro', 250, NOW)).toBe('2026-05-10T02:00:00.000Z')
  })
  it('standard + 250 pages → batch (already would batch — same answer)', () => {
    expect(computeScheduledFor('standard', 250, NOW)).toBe('2026-05-10T02:00:00.000Z')
  })
  it('boundary: exactly 200 pages → tier-default (Pro stays realtime)', () => {
    expect(computeScheduledFor('pro', 200, NOW)).toBe(NOW.toISOString())
  })
  it('boundary: 201 pages → batch (just over threshold)', () => {
    expect(computeScheduledFor('pro', 201, NOW)).toBe('2026-05-10T02:00:00.000Z')
  })
})

describe('computeScheduledFor — UTC day boundary', () => {
  it('upload at 01:00 UTC → batch ready at 02:00 UTC SAME day', () => {
    const at = new Date('2026-05-09T01:00:00Z')
    expect(computeScheduledFor('standard', 50, at)).toBe('2026-05-09T02:00:00.000Z')
  })
  it('upload at 02:00 UTC → batch ready at 02:00 UTC NEXT day', () => {
    const at = new Date('2026-05-09T02:00:00Z')
    expect(computeScheduledFor('standard', 50, at)).toBe('2026-05-10T02:00:00.000Z')
  })
  it('upload at 23:59 UTC → batch ready at 02:00 UTC NEXT day', () => {
    const at = new Date('2026-05-09T23:59:00Z')
    expect(computeScheduledFor('standard', 50, at)).toBe('2026-05-10T02:00:00.000Z')
  })
})

describe('isReadyToClaim', () => {
  it('past timestamp → ready', () => {
    expect(isReadyToClaim('2026-05-09T15:00:00Z', NOW)).toBe(true)
  })
  it('future timestamp → not ready', () => {
    expect(isReadyToClaim('2026-05-10T02:00:00Z', NOW)).toBe(false)
  })
  it('exactly now → ready (<= comparison)', () => {
    expect(isReadyToClaim(NOW.toISOString(), NOW)).toBe(true)
  })
})

describe('explainScheduling', () => {
  it('beta + small → tier (realtime)', () => {
    expect(explainScheduling('beta', 50)).toEqual({ mode: 'realtime', reason: 'tier' })
  })
  it('standard + small → tier (batch)', () => {
    expect(explainScheduling('standard', 50)).toEqual({ mode: 'batch', reason: 'tier' })
  })
  it('pro + 250 pages → large-doc reason', () => {
    expect(explainScheduling('pro', 250)).toEqual({ mode: 'batch', reason: 'large-doc' })
  })
  it('beta + 500 pages → large-doc reason (despite Beta=realtime)', () => {
    expect(explainScheduling('beta', 500)).toEqual({ mode: 'batch', reason: 'large-doc' })
  })
})
