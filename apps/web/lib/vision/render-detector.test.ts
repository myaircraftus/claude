/**
 * Phase 12 follow-up — render-detector tests.
 *
 * Two layers:
 *   1. needsRendering() — sync path-pattern check
 *   2. probePageImageExists() — async storage HEAD probe
 *
 * The auto-dispatch case (paths that look canonical but PNGs aren't
 * uploaded) requires the storage probe to detect; needsRendering()
 * alone returns false for that case (paths look real).
 */
import { describe, it, expect, vi } from 'vitest'
import { needsRendering, probePageImageExists } from './render-detector'
import type { VisionPage } from './types'

function p(overrides: Partial<VisionPage>): VisionPage {
  return {
    id: 'p-1',
    organization_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    source_document_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    page_number: 0,
    page_image_path: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/page_0.png',
    status: 'pending',
    vision_model: null,
    vision_index_id: null,
    confidence_score: null,
    error_message: null,
    rendered_at: null,
    embedded_at: null,
    created_at: '2026-05-09T00:00:00Z',
    updated_at: '2026-05-09T00:00:00Z',
    deleted_at: null,
    ...overrides,
  }
}

describe('needsRendering — sync path check', () => {
  it('empty array returns false', () => {
    expect(needsRendering([])).toBe(false)
  })

  it('all canonical paths returns false', () => {
    const pages = [
      p({ id: 'p-1', page_image_path: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/page_0.png' }),
      p({ id: 'p-2', page_image_path: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/page_42.png' }),
      p({ id: 'p-3', page_image_path: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/page_0001.png' }),
    ]
    expect(needsRendering(pages)).toBe(false)
  })

  it('any null path returns true', () => {
    const pages = [
      p({ id: 'p-1' }),
      p({ id: 'p-2', page_image_path: '' }),
    ]
    // empty string is falsy → triggers needsRendering
    expect(needsRendering(pages)).toBe(true)
  })

  it('any empty string path returns true', () => {
    const pages = [p({ page_image_path: '' })]
    expect(needsRendering(pages)).toBe(true)
  })

  it('non-canonical path returns true (e.g. just filename, no UUID prefix)', () => {
    const pages = [p({ page_image_path: 'page_0.png' })]
    expect(needsRendering(pages)).toBe(true)
  })

  it('mixed canonical + null returns true (conservative)', () => {
    const pages = [
      p({ id: 'p-1' }), // canonical default
      p({ id: 'p-2', page_image_path: '' }),
    ]
    expect(needsRendering(pages)).toBe(true)
  })
})

describe('probePageImageExists — async storage HEAD probe', () => {
  function makeMockSupabase(signedUrlResult: { data?: { signedUrl: string } | null; error?: any } = {}) {
    return {
      storage: {
        from: vi.fn().mockReturnValue({
          createSignedUrl: vi.fn().mockResolvedValue(signedUrlResult),
        }),
      },
    } as any
  }

  it('returns false when page_image_path is empty', async () => {
    const sb = makeMockSupabase()
    const fetchFn = vi.fn() as unknown as typeof fetch
    const result = await probePageImageExists(sb, p({ page_image_path: '' }), fetchFn)
    expect(result).toBe(false)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('returns false when createSignedUrl returns an error', async () => {
    const sb = makeMockSupabase({ error: { message: 'bucket missing' } })
    const fetchFn = vi.fn() as unknown as typeof fetch
    const result = await probePageImageExists(sb, p({}), fetchFn)
    expect(result).toBe(false)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('returns true when HEAD on signed URL returns 200', async () => {
    const sb = makeMockSupabase({ data: { signedUrl: 'https://test/signed?token=x' } })
    const fetchFn = vi.fn().mockResolvedValue(new Response(null, { status: 200 })) as unknown as typeof fetch
    const result = await probePageImageExists(sb, p({}), fetchFn)
    expect(result).toBe(true)
    expect(fetchFn).toHaveBeenCalledWith('https://test/signed?token=x', { method: 'HEAD' })
  })

  it('returns false when HEAD on signed URL returns 404', async () => {
    const sb = makeMockSupabase({ data: { signedUrl: 'https://test/signed?token=x' } })
    const fetchFn = vi.fn().mockResolvedValue(new Response(null, { status: 404 })) as unknown as typeof fetch
    const result = await probePageImageExists(sb, p({}), fetchFn)
    expect(result).toBe(false)
  })

  it('returns false on network exception (catches and returns false)', async () => {
    const sb = makeMockSupabase({ data: { signedUrl: 'https://test/signed?token=x' } })
    const fetchFn = vi.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch
    const result = await probePageImageExists(sb, p({}), fetchFn)
    expect(result).toBe(false)
  })
})
