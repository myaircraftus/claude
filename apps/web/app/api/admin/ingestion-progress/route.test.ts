/**
 * Phase 13.3 — admin ingestion-progress route auth tests.
 *
 * Verifies the route returns 401 for anon, 403 for non-platform-admin, and
 * 200 with rows for is_platform_admin=true. Mocks the supabase clients so
 * no DB is touched.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: vi.fn(),
  createServiceSupabase: vi.fn(),
}))

import { GET } from './route'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'

interface MockSession {
  user: { id: string } | null
  isPlatformAdmin?: boolean
}

function mockServerSupabase(session: MockSession) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: session.user },
      }),
    },
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'user_profiles') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: session.isPlatformAdmin
              ? { is_platform_admin: true }
              : { is_platform_admin: false },
          }),
        }
      }
      return {} as any
    }),
  }
}

function mockServiceSupabase(rows: any[] = []) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: rows, error: null }),
    }),
  }
}

beforeEach(() => {
  vi.resetAllMocks()
})

function makeReq() {
  return new Request('http://test/api/admin/ingestion-progress')
}

describe('GET /api/admin/ingestion-progress', () => {
  it('returns 401 when no user in session', async () => {
    vi.mocked(createServerSupabase).mockReturnValue(
      mockServerSupabase({ user: null }) as any,
    )
    const res = await GET(makeReq() as any)
    expect(res.status).toBe(401)
  })

  it('returns 403 when user is NOT platform admin', async () => {
    vi.mocked(createServerSupabase).mockReturnValue(
      mockServerSupabase({ user: { id: 'u1' }, isPlatformAdmin: false }) as any,
    )
    const res = await GET(makeReq() as any)
    expect(res.status).toBe(403)
  })

  it('returns 200 with rows when user IS platform admin', async () => {
    vi.mocked(createServerSupabase).mockReturnValue(
      mockServerSupabase({ user: { id: 'u1' }, isPlatformAdmin: true }) as any,
    )
    const fakeRows = [
      {
        id: 'r1',
        document_id: 'd1',
        organization_id: 'o1',
        stage: 'ocr',
        stage_started_at: '2026-05-09T15:00:00Z',
        stage_completed_at: null,
        error_message: null,
      },
    ]
    vi.mocked(createServiceSupabase).mockReturnValue(
      mockServiceSupabase(fakeRows) as any,
    )

    const res = await GET(makeReq() as any)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.rows).toHaveLength(1)
    expect(body.rows[0].stage).toBe('ocr')
  })
})
