/**
 * Phase 16 Sprint 16.11 — Claude Code prompt generator tests.
 *
 * Verifies:
 *   - File path extraction from a stack pulls real paths.
 *   - Routes are turned into guessed page/route paths.
 *   - generateClaudeCodePrompt produces a prompt with all 7 sections
 *     when given a fake error event context.
 *   - The hard-rules block always names the sacred boundaries +
 *     commit format.
 *   - Non-existent source returns null.
 */
import { describe, it, expect, vi } from 'vitest'

import {
  generateClaudeCodePrompt,
  extractFilePaths,
} from './prompt-generator'

describe('extractFilePaths', () => {
  it('pulls apps/web/ paths from a stack', () => {
    const stack = `Error: boom
    at handler (apps/web/app/api/work-orders/route.ts:42:7)
    at /apps/web/lib/observability/error-capture.ts:99:13`
    const paths = extractFilePaths(stack, [])
    expect(paths).toContain('apps/web/app/api/work-orders/route.ts')
    expect(paths).toContain('apps/web/lib/observability/error-capture.ts')
  })

  it('normalizes leading-slash file refs', () => {
    const detail = 'Error in /lib/billing/tier-service.ts:33:5'
    const paths = extractFilePaths(detail, [])
    expect(paths).toContain('apps/web/lib/billing/tier-service.ts')
  })

  it('expands a route into a guessed page file + api route file', () => {
    const paths = extractFilePaths('', ['/aircraft/[id]', '/api/work-orders'])
    expect(paths).toContain('apps/web/app/(app)/aircraft/[id]/page.tsx')
    expect(paths).toContain('apps/web/app/api/work-orders/route.ts')
  })

  it('caps file candidates at 12', () => {
    const stack = Array.from({ length: 30 }, (_, i) => `at /lib/foo${i}.ts:1:1`).join('\n')
    const paths = extractFilePaths(stack, [])
    expect(paths.length).toBeLessThanOrEqual(12)
  })
})

// ──────────────────────────────────────────────────────────────────────
// generateClaudeCodePrompt — supabase mock + skip_file_read
// ──────────────────────────────────────────────────────────────────────

function makeSb(eventRow: Record<string, unknown> | null) {
  const builder: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: eventRow, error: null }),
  }
  // For listReplies in support_ticket flow.
  let secondaryRows: unknown[] = []
  builder.select = vi.fn().mockReturnValue(builder)
  Object.defineProperty(builder, 'data', { get: () => secondaryRows })
  builder.then = (cb: any) => Promise.resolve({ data: secondaryRows, error: null }).then(cb)
  return {
    sb: { from: vi.fn().mockReturnValue(builder) } as any,
    setSecondary: (rows: unknown[]) => { secondaryRows = rows },
  }
}

describe('generateClaudeCodePrompt', () => {
  it('returns null for unknown source', async () => {
    const { sb } = makeSb(null)
    const r = await generateClaudeCodePrompt(sb, 'support_ticket', 'tkt-missing', { skip_file_read: true })
    expect(r).toBeNull()
  })

  it('returns null for unsupported source types', async () => {
    const { sb } = makeSb({ id: 'fb-1' } as any)
    const r = await generateClaudeCodePrompt(sb, 'feedback_item', 'fb-1', { skip_file_read: true })
    expect(r).toBeNull()
  })

  it('produces a prompt with all 7 sections for an error_event', async () => {
    const eventRow = {
      id: 'err-1',
      message: 'TypeError: Cannot read properties of undefined (reading "id")',
      stack: `at handler (apps/web/app/api/work-orders/route.ts:42:7)`,
      route: '/api/work-orders',
      persona: 'mechanic',
      severity: 'P1',
      occurrence_count: 12,
      last_seen_at: '2026-05-10T05:00:00Z',
      build_sha: 'abc1234',
      organization_id: 'org-1',
    }
    const { sb } = makeSb(eventRow)
    const r = await generateClaudeCodePrompt(sb, 'error_event', 'err-1', { skip_file_read: true })
    expect(r).not.toBeNull()
    const text = r!.prompt_text
    // 7 sections per the brief.
    expect(text).toMatch(/^# Fix:/)
    expect(text).toMatch(/## Reproduction/)
    expect(text).toMatch(/## Affected/)
    expect(text).toMatch(/## Relevant files/)
    expect(text).toMatch(/## Suggested fix approach/)
    expect(text).toMatch(/## Test requirements/)
    expect(text).toMatch(/## Hard rules/)
    // Includes the file path mentioned in the stack.
    expect(text).toContain('apps/web/app/api/work-orders/route.ts')
    // Persona + route surfaced.
    expect(text).toMatch(/mechanic/)
    expect(text).toMatch(/`\/api\/work-orders`/)
  })

  it('Hard Rules block names sacred boundaries + commit format', async () => {
    const eventRow = {
      id: 'err-2',
      message: 'oops',
      stack: null,
      route: null,
      persona: null,
      severity: 'P3',
      occurrence_count: 1,
      last_seen_at: '2026-05-10T05:00:00Z',
      build_sha: null,
      organization_id: null,
    }
    const { sb } = makeSb(eventRow)
    const r = await generateClaudeCodePrompt(sb, 'error_event', 'err-2', { skip_file_read: true })
    const text = r!.prompt_text
    expect(text).toContain('apps/web/lib/ocr')
    expect(text).toContain('apps/web/lib/rag')
    expect(text).toContain('apps/web/lib/embeddings')
    expect(text).toMatch(/Commit format:.*type\(scope\)/i)
    expect(text).toMatch(/main/i)
  })

  it('captures context_files in the metadata', async () => {
    const eventRow = {
      id: 'err-3',
      message: 'boom in /lib/foo.ts',
      stack: 'at /lib/foo.ts:1:1',
      route: '/api/foo',
      persona: null,
      severity: 'P2',
      occurrence_count: 1,
      last_seen_at: '2026-05-10T05:00:00Z',
      build_sha: null,
      organization_id: null,
    }
    const { sb } = makeSb(eventRow)
    const r = await generateClaudeCodePrompt(sb, 'error_event', 'err-3', { skip_file_read: true })
    expect(r!.context_files.length).toBeGreaterThan(0)
    expect(r!.metadata.file_candidates).toBeDefined()
  })

  it('uses provided ai_analysis text instead of placeholder', async () => {
    const eventRow = {
      id: 'err-4', message: 'x', stack: null, route: null, persona: null,
      severity: 'P3', occurrence_count: 1, last_seen_at: '2026-05-10T05:00:00Z',
      build_sha: null, organization_id: null,
    }
    const { sb } = makeSb(eventRow)
    const r = await generateClaudeCodePrompt(sb, 'error_event', 'err-4', {
      skip_file_read: true,
      ai_analysis: 'Likely a missing null-check on req.body.id; defensive in handler.',
    })
    expect(r!.prompt_text).toContain('null-check on req.body.id')
  })
})
