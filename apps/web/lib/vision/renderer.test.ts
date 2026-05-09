/**
 * Sprint 8.2 — page renderer tests.
 *
 * Verifies the orchestration layer: PDF page-counting → vision_pages
 * row insertion → status transitions. The actual PNG rasterization
 * is stubbed (RENDER_MODE='stub' per the foundation gap), so these
 * tests confirm the row-creation path, not pixel output.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildVisionPagePath, VISION_PAGES_BUCKET } from './storage'
import { getStubPng, RENDERER_LIMITATION_NOTE, RENDER_MODE } from './renderer'

// ─── Pure helpers (no mocks needed) ──────────────────────────────────

describe('buildVisionPagePath', () => {
  it('produces the canonical path layout', () => {
    expect(buildVisionPagePath({
      organizationId: '00000000-0000-0000-0000-000000000001',
      sourceDocumentId: '00000000-0000-0000-0000-000000000002',
      pageNumber: 0,
    })).toBe('00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000002/page_0000.png')
  })

  it('zero-pads page numbers to 4 digits (lexicographic = numeric)', () => {
    expect(buildVisionPagePath({
      organizationId: 'A', sourceDocumentId: 'B', pageNumber: 5,
    })).toBe('A/B/page_0005.png')
    expect(buildVisionPagePath({
      organizationId: 'A', sourceDocumentId: 'B', pageNumber: 142,
    })).toBe('A/B/page_0142.png')
  })

  it('handles 4-digit page counts (1000+ page logbooks)', () => {
    expect(buildVisionPagePath({
      organizationId: 'A', sourceDocumentId: 'B', pageNumber: 9999,
    })).toBe('A/B/page_9999.png')
  })

  it('verifies path layout matches what the renderer + dispatcher expect', () => {
    // Sanity-check: the prefix is org-scoped, so deletePageImagesForDocument
    // can list-and-rm by `${orgId}/${docId}/`.
    const path = buildVisionPagePath({
      organizationId: 'org-A', sourceDocumentId: 'doc-1', pageNumber: 0,
    })
    expect(path.startsWith('org-A/doc-1/')).toBe(true)
  })
})

describe('VISION_PAGES_BUCKET', () => {
  it('is the canonical bucket name', () => {
    expect(VISION_PAGES_BUCKET).toBe('vision-pages')
  })
})

describe('getStubPng', () => {
  it('returns a valid 1×1 transparent PNG', () => {
    const png = getStubPng()
    // PNG signature: 89 50 4E 47 0D 0A 1A 0A
    expect(png[0]).toBe(0x89)
    expect(png[1]).toBe(0x50)
    expect(png[2]).toBe(0x4e)
    expect(png[3]).toBe(0x47)
  })

  it('contains an IEND chunk (well-formed PNG)', () => {
    const png = getStubPng()
    // The last 8 bytes encode the IEND chunk: 00 00 00 00 49 45 4E 44
    // followed by the CRC. Just check IEND presence.
    const tail = Array.from(png.slice(-12, -4))
    expect(tail).toContain(0x49)
    expect(tail).toContain(0x45)
    expect(tail).toContain(0x4e)
    expect(tail).toContain(0x44)
  })
})

describe('RENDER_MODE foundation marker', () => {
  it("is 'stub' until canvas binding lands in a future sprint", () => {
    expect(RENDER_MODE).toBe('stub')
  })

  it('limitation note is non-empty and explains the gap', () => {
    expect(RENDERER_LIMITATION_NOTE).toMatch(/canvas binding/i)
    expect(RENDERER_LIMITATION_NOTE.length).toBeGreaterThan(80)
  })
})

// ─── Orchestration tests with mocked supabase + pdf-lib ───────────────

vi.mock('pdf-lib', () => ({
  PDFDocument: {
    load: vi.fn().mockImplementation(async (_bytes: Uint8Array) => ({
      getPageCount: () => 3,
    })),
  },
}))

// Mock the registry so we don't pull schemas / hit DB in this test.
vi.mock('./registry', () => ({
  createVisionPage: vi.fn().mockImplementation(async (_s, payload) => ({
    id: `page-id-${payload.page_number}`,
    organization_id: payload.organization_id,
    source_document_id: payload.source_document_id,
    page_number: payload.page_number,
    page_image_path: payload.page_image_path,
    status: payload.status ?? 'pending',
    vision_model: null,
    vision_index_id: null,
    confidence_score: null,
    error_message: null,
    rendered_at: null,
    embedded_at: null,
    created_at: '2026-05-08T00:00:00Z',
    updated_at: '2026-05-08T00:00:00Z',
    deleted_at: null,
  })),
  updateVisionPage: vi.fn().mockResolvedValue({}),
  listVisionPages: vi.fn().mockResolvedValue([]),
  parseJsonBody: vi.fn(),
}))

import { renderDocumentToPages } from './renderer'
import * as registry from './registry'

beforeEach(() => {
  vi.clearAllMocks()
  ;(registry.listVisionPages as any).mockResolvedValue([])
  ;(registry.createVisionPage as any).mockImplementation(async (_s: any, payload: any) => ({
    id: `page-id-${payload.page_number}`,
    organization_id: payload.organization_id,
    source_document_id: payload.source_document_id,
    page_number: payload.page_number,
    page_image_path: payload.page_image_path,
    status: payload.status ?? 'pending',
  }))
  ;(registry.updateVisionPage as any).mockResolvedValue({})
})

const mockSupabase = {
  storage: {
    from: () => ({
      download: async () => ({
        data: { arrayBuffer: async () => new ArrayBuffer(8) },
        error: null,
      }),
    }),
  },
} as any

describe('renderDocumentToPages — happy path', () => {
  it('counts pages, creates a row per page, updates each to pending', async () => {
    const result = await renderDocumentToPages(mockSupabase, {
      organizationId: 'org-A',
      sourceDocumentId: 'doc-1',
      sourceFilePath: 'org-A/doc-1.pdf',
    })

    expect(result.pageCount).toBe(3)
    expect(result.pagesCreated).toBe(3)
    expect(result.pagesSkipped).toBe(0)
    expect(result.pagesFailed).toBe(0)
    expect(registry.createVisionPage).toHaveBeenCalledTimes(3)
    // Each page goes through 'rendering' (insert) → 'pending' (update).
    expect(registry.updateVisionPage).toHaveBeenCalledTimes(3)
  })

  it('uses the canonical path for each page', async () => {
    await renderDocumentToPages(mockSupabase, {
      organizationId: 'org-A',
      sourceDocumentId: 'doc-1',
      sourceFilePath: 'org-A/doc-1.pdf',
    })
    const calls = (registry.createVisionPage as any).mock.calls
    expect(calls[0][1].page_image_path).toBe('org-A/doc-1/page_0000.png')
    expect(calls[1][1].page_image_path).toBe('org-A/doc-1/page_0001.png')
    expect(calls[2][1].page_image_path).toBe('org-A/doc-1/page_0002.png')
  })

  it('inserts pages with status=rendering, then updates to pending', async () => {
    await renderDocumentToPages(mockSupabase, {
      organizationId: 'org-A', sourceDocumentId: 'doc-1', sourceFilePath: 'p.pdf',
    })
    const insertCalls = (registry.createVisionPage as any).mock.calls
    for (const [, payload] of insertCalls) {
      expect(payload.status).toBe('rendering')
    }
    const updateCalls = (registry.updateVisionPage as any).mock.calls
    for (const [, , patch] of updateCalls) {
      expect(patch.status).toBe('pending')
      expect(patch.rendered_at).toBeTruthy()
    }
  })
})

describe('renderDocumentToPages — idempotency', () => {
  it('skips pages that already exist (force=false default)', async () => {
    ;(registry.listVisionPages as any).mockResolvedValueOnce([
      { id: 'p0', page_number: 0 },
      { id: 'p1', page_number: 1 },
    ])

    const result = await renderDocumentToPages(mockSupabase, {
      organizationId: 'org-A', sourceDocumentId: 'doc-1', sourceFilePath: 'p.pdf',
    })

    expect(result.pagesCreated).toBe(1) // only page 2 created
    expect(result.pagesSkipped).toBe(2)  // pages 0 and 1 skipped
  })

  it('re-inserts every page when force=true', async () => {
    ;(registry.listVisionPages as any).mockResolvedValueOnce([
      { id: 'p0', page_number: 0 },
      { id: 'p1', page_number: 1 },
      { id: 'p2', page_number: 2 },
    ])

    const result = await renderDocumentToPages(mockSupabase, {
      organizationId: 'org-A', sourceDocumentId: 'doc-1', sourceFilePath: 'p.pdf',
      force: true,
    })

    expect(result.pagesCreated).toBe(3)
    expect(result.pagesSkipped).toBe(0)
  })
})

describe('renderDocumentToPages — error paths', () => {
  it('reports a top-level error if the source download fails', async () => {
    const failingSupabase = {
      storage: {
        from: () => ({
          download: async () => ({ data: null, error: { message: 'no such file' } }),
        }),
      },
    } as any

    const result = await renderDocumentToPages(failingSupabase, {
      organizationId: 'org-A', sourceDocumentId: 'doc-x', sourceFilePath: 'missing.pdf',
    })

    expect(result.pageCount).toBe(0)
    expect(result.errors[0].message).toMatch(/no such file/)
    expect(registry.createVisionPage).not.toHaveBeenCalled()
  })

  it('continues per-page if one page fails to insert', async () => {
    let callIdx = 0
    ;(registry.createVisionPage as any).mockImplementation(async (_s: any, payload: any) => {
      callIdx++
      if (payload.page_number === 1) throw new Error('insert failed for page 1')
      return {
        id: `page-id-${payload.page_number}`,
        page_number: payload.page_number,
      }
    })

    const result = await renderDocumentToPages(mockSupabase, {
      organizationId: 'org-A', sourceDocumentId: 'doc-1', sourceFilePath: 'p.pdf',
    })

    expect(result.pageCount).toBe(3)
    expect(result.pagesCreated).toBe(2)
    expect(result.pagesFailed).toBe(1)
    expect(result.errors[0].pageNumber).toBe(1)
    expect(result.errors[0].message).toMatch(/insert failed for page 1/)
  })
})
