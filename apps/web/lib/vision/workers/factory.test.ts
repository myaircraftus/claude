/**
 * Sprint 8.3 — factory routing tests.
 *
 * Lives in its own file (not dispatcher.test.ts) because the
 * dispatcher tests vi.mock() the factory module to control which
 * worker the dispatcher receives; the factory's own behavior tests
 * need to import the real module.
 */
import { describe, it, expect } from 'vitest'
import { getGpuWorker } from './factory'

describe('getGpuWorker — routing', () => {
  it('returns the stub when VISION_GPU_HOST is unset', () => {
    const w = getGpuWorker({ envHost: undefined })
    expect(w.id).toBe('stub')
  })

  it('returns the stub when VISION_GPU_HOST=stub', () => {
    expect(getGpuWorker({ envHost: 'stub' }).id).toBe('stub')
  })

  it('returns the stub when VISION_GPU_HOST=modal-stub', () => {
    expect(getGpuWorker({ envHost: 'modal-stub' }).id).toBe('stub')
  })

  it('returns replicate worker (TODO placeholder) when VISION_GPU_HOST=replicate', () => {
    const w = getGpuWorker({ envHost: 'replicate' })
    expect(w.id).toBe('replicate')
    // The placeholder's embed() throws — confirms it's the TODO file, not stub.
    expect(w.embed([])).rejects.toThrow(/replicateWorker not implemented/)
  })

  it('returns runpod worker (TODO placeholder) when VISION_GPU_HOST=runpod', () => {
    const w = getGpuWorker({ envHost: 'runpod' })
    expect(w.id).toBe('runpod')
  })

  it('returns colab worker (TODO placeholder) when VISION_GPU_HOST=colab', () => {
    const w = getGpuWorker({ envHost: 'colab' })
    expect(w.id).toBe('colab')
  })

  it('falls back to stub on unknown host string', () => {
    expect(getGpuWorker({ envHost: 'azure' }).id).toBe('stub')
    expect(getGpuWorker({ envHost: '' }).id).toBe('stub')
  })

  it('is case-insensitive on host', () => {
    expect(getGpuWorker({ envHost: 'STUB' }).id).toBe('stub')
    expect(getGpuWorker({ envHost: 'Modal-Stub' }).id).toBe('stub')
  })
})
