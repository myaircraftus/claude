/**
 * Sprint 11.2 — dispatch-mode tests.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { dispatchMode, shouldDispatchSynchronously } from './dispatch-mode'

describe('dispatchMode', () => {
  let prev: string | undefined

  beforeEach(() => {
    prev = process.env.VISION_DISPATCH_MODE
    delete process.env.VISION_DISPATCH_MODE
  })
  afterEach(() => {
    if (prev !== undefined) process.env.VISION_DISPATCH_MODE = prev
    else delete process.env.VISION_DISPATCH_MODE
  })

  it("defaults to 'queue' when env is unset", () => {
    expect(dispatchMode()).toBe('queue')
  })

  it("returns 'queue' when env is 'queue'", () => {
    process.env.VISION_DISPATCH_MODE = 'queue'
    expect(dispatchMode()).toBe('queue')
  })

  it("returns 'direct' only when env is exactly 'direct' (case-insensitive)", () => {
    process.env.VISION_DISPATCH_MODE = 'direct'
    expect(dispatchMode()).toBe('direct')

    process.env.VISION_DISPATCH_MODE = 'DIRECT'
    expect(dispatchMode()).toBe('direct')

    process.env.VISION_DISPATCH_MODE = 'Direct'
    expect(dispatchMode()).toBe('direct')
  })

  it("returns 'queue' on typos / unknown values (fail-safe)", () => {
    process.env.VISION_DISPATCH_MODE = 'directx'
    expect(dispatchMode()).toBe('queue')

    process.env.VISION_DISPATCH_MODE = 'sync'
    expect(dispatchMode()).toBe('queue')

    process.env.VISION_DISPATCH_MODE = ''
    expect(dispatchMode()).toBe('queue')
  })

  it('explicit override beats env', () => {
    process.env.VISION_DISPATCH_MODE = 'queue'
    expect(dispatchMode('direct')).toBe('direct')

    process.env.VISION_DISPATCH_MODE = 'direct'
    expect(dispatchMode('queue')).toBe('queue')
  })
})

describe('shouldDispatchSynchronously', () => {
  it('true when direct, false when queue', () => {
    expect(shouldDispatchSynchronously('direct')).toBe(true)
    expect(shouldDispatchSynchronously('queue')).toBe(false)
  })
})
