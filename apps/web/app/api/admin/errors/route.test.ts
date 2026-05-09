/**
 * Phase 13.4 — admin errors route auth tests. Mirrors the
 * ingestion-progress route test pattern.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: vi.fn(),
  createServiceSupabase: vi.fn(),
}))

import { GET } from './route'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'

function mockServerSupabase(opts: { user: { id: string } | null; isAdmin?: boolean }) {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: opts.user } }) },
    from: vi.fn().mockImplementation((t: string) => {
      if (t === 'user_profiles') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { is_platform_admin: opts.isAdmin ?? false },
          }),
        }
      }
      return {} as any
    }),
  }
}

function mockServiceSupabase(failedRows: any[] = [], docs: any[] = []) {
  let callCount = 0
  return {
    from: vi.fn().mockImplementation((t: string) => {
      if (t === 'ingestion_progress') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: failedRows, error: null }),
        }
      }
      if (t === 'documents') {
        callCount++
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({ data: docs, error: null }),
        }
      }
      return {} as any
    }),
  }
}

beforeEach(() => {
  vi.resetAllMocks()
})

function makeReq() {
  return new Request('http://test/api/admin/errors')
}

describe('GET /api/admin/errors', () => {
  it('returns 401 with no user', async () => {
    vi.mocked(createServerSupabase).mockReturnValue(mockServerSupabase({ user: null }) as any)
    const res = await GET(makeReq() as any)
    expect(res.status).toBe(401)
  })

  it('returns 403 for non-admin', async () => {
    vi.mocked(createServerSupabase).mockReturnValue(
      mockServerSupabase({ user: { id: 'u1' }, isAdmin: false }) as any,
    )
    const res = await GET(makeReq() as any)
    expect(res.status).toBe(403)
  })

  it('returns rows joined with doc context for platform admin', async () => {
    vi.mocked(createServerSupabase).mockReturnValue(
      mockServerSupabase({ user: { id: 'u1' }, isAdmin: true }) as any,
    )
    vi.mocked(createServiceSupabase).mockReturnValue(
      mockServiceSupabase(
        [
          {
            id: 'p1',
            document_id: 'd1',
            organization_id: 'o1',
            stage_started_at: '2026-05-09T15:00:00Z',
            error_message: 'render failed',
            metadata: { resolved: false },
          },
        ],
        [
          {
            id: 'd1',
            title: 'Test doc',
            doc_type: 'logbook',
            document_type: 'aircraft_logbook',
            uploaded_by_persona: 'owner',
          },
        ],
      ) as any,
    )
    const res = await GET(makeReq() as any)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.rows).toHaveLength(1)
    expect(body.rows[0].doc_title).toBe('Test doc')
    expect(body.rows[0].uploaded_by_persona).toBe('owner')
    expect(body.rows[0].doc_type).toBe('aircraft_logbook')
  })
})
