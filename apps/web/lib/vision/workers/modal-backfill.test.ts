/**
 * Phase 12 follow-up — Modal /backfill client tests.
 *
 * The /backfill endpoint isn't part of the GpuWorker interface — it's
 * a Modal-specific capability invoked by the fallback cron. Test the
 * factory + the request/response shape contract.
 */
import { describe, it, expect, vi } from 'vitest'
import { createModalBackfillClient } from './modal'
import type { SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_STUB = {} as unknown as SupabaseClient

const ENV_OK = {
  MODAL_API_KEY: 'sk-test',
  MODAL_ENDPOINT_URL: 'https://info-12345--embed.modal.run',
}

describe('createModalBackfillClient — URL derivation', () => {
  it('throws if MODAL_API_KEY is missing', async () => {
    const fetchFn = vi.fn() as unknown as typeof fetch
    const client = createModalBackfillClient({
      supabase: SUPABASE_STUB,
      env: { MODAL_ENDPOINT_URL: ENV_OK.MODAL_ENDPOINT_URL },
      fetchFn,
    })
    await expect(
      client.backfillDocuments({ sourceDocumentIds: ['d1'], organizationId: 'o1' }),
    ).rejects.toThrow(/MODAL_API_KEY/i)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('throws if MODAL_ENDPOINT_URL is missing', async () => {
    const fetchFn = vi.fn() as unknown as typeof fetch
    const client = createModalBackfillClient({
      supabase: SUPABASE_STUB,
      env: { MODAL_API_KEY: 'sk' },
      fetchFn,
    })
    await expect(
      client.backfillDocuments({ sourceDocumentIds: ['d1'], organizationId: 'o1' }),
    ).rejects.toThrow(/Cannot derive .* MODAL_ENDPOINT_URL/i)
  })

  it('throws if MODAL_ENDPOINT_URL has no "embed" segment to swap', async () => {
    const fetchFn = vi.fn() as unknown as typeof fetch
    const client = createModalBackfillClient({
      supabase: SUPABASE_STUB,
      env: { MODAL_API_KEY: 'sk', MODAL_ENDPOINT_URL: 'https://wrong.modal.run/foo' },
      fetchFn,
    })
    await expect(
      client.backfillDocuments({ sourceDocumentIds: ['d1'], organizationId: 'o1' }),
    ).rejects.toThrow(/Cannot derive/i)
  })
})

describe('createModalBackfillClient — request shape', () => {
  it('POSTs to the derived /backfill URL with the correct body and headers', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          document_results: [
            { source_document_id: 'd1', pages_processed: 5, pages_failed: 0, errors: [] },
          ],
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch

    const client = createModalBackfillClient({
      supabase: SUPABASE_STUB,
      env: ENV_OK,
      fetchFn,
    })

    const result = await client.backfillDocuments({
      sourceDocumentIds: ['d1', 'd2'],
      organizationId: 'org-A',
    })

    expect(fetchFn).toHaveBeenCalledTimes(1)
    const [url, init] = (fetchFn as any).mock.calls[0]
    expect(url).toBe('https://info-12345--backfill.modal.run')
    expect(init.method).toBe('POST')
    expect(init.headers.authorization).toBe('Bearer sk-test')
    expect(init.headers['content-type']).toBe('application/json')
    const body = JSON.parse(init.body)
    expect(body).toEqual({
      source_document_ids: ['d1', 'd2'],
      organization_id: 'org-A',
    })
    expect(result).toHaveLength(1)
    expect(result[0].source_document_id).toBe('d1')
    expect(result[0].pages_processed).toBe(5)
  })
})

describe('createModalBackfillClient — error handling', () => {
  it('throws on non-2xx HTTP status', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response('upstream broken', { status: 502 }),
    ) as unknown as typeof fetch
    const client = createModalBackfillClient({
      supabase: SUPABASE_STUB,
      env: ENV_OK,
      fetchFn,
    })
    await expect(
      client.backfillDocuments({ sourceDocumentIds: ['d1'], organizationId: 'o1' }),
    ).rejects.toThrow(/modal \/backfill 502/)
  })

  it('throws on top-level error in response body (auth/payload failure)', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ document_results: [], error: 'unauthorized' }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch
    const client = createModalBackfillClient({
      supabase: SUPABASE_STUB,
      env: ENV_OK,
      fetchFn,
    })
    await expect(
      client.backfillDocuments({ sourceDocumentIds: ['d1'], organizationId: 'o1' }),
    ).rejects.toThrow(/modal \/backfill: unauthorized/)
  })

  it('throws on malformed body (no document_results array)', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 }),
    ) as unknown as typeof fetch
    const client = createModalBackfillClient({
      supabase: SUPABASE_STUB,
      env: ENV_OK,
      fetchFn,
    })
    await expect(
      client.backfillDocuments({ sourceDocumentIds: ['d1'], organizationId: 'o1' }),
    ).rejects.toThrow(/no document_results/)
  })
})
