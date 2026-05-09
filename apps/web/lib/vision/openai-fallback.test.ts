/**
 * Sprint 8.6 — OpenAI Vision fallback tests.
 *
 * Verifies:
 *   - parseConfidence: HIGH/MEDIUM/LOW tag, fuzzy keywords, default
 *   - parseCitations: comma-separated page numbers, missing line
 *   - isFallbackEnabled: env-driven gating
 *   - stubFallbackAnswer: deterministic shape
 *   - openAiVisionAnswer orchestration:
 *     - capped at FALLBACK_MAX_PAGES
 *     - missing OPENAI_API_KEY → stub answer
 *     - VISION_FALLBACK_MODE=stub → stub answer (even with key set)
 *     - empty pages → invoked=false, confidence=0
 *     - happy path → calls OpenAI, parses confidence/citations,
 *       logs ai_activity_log
 *     - OpenAI error → logs failure row, throws
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  parseConfidence,
  parseCitations,
  isFallbackEnabled,
  stubFallbackAnswer,
  readFallbackThreshold,
  DEFAULT_FALLBACK_THRESHOLD,
  FALLBACK_MAX_PAGES,
} from './openai-fallback'

// ─── Pure helpers ────────────────────────────────────────────────────

describe('parseConfidence', () => {
  it.each([
    ['CONFIDENCE: HIGH', 0.9],
    ['CONFIDENCE: MEDIUM', 0.7],
    ['CONFIDENCE: LOW', 0.4],
    ['confidence: high', 0.9],            // case-insensitive
    ['confidence: HIGH', 0.9],
  ])('parses %s → %s', (input, expected) => {
    expect(parseConfidence(`Some answer.\n${input}`)).toBe(expected)
  })

  it('falls through to fuzzy keywords on missing tag', () => {
    expect(parseConfidence('I am highly confident this is N12345.')).toBe(0.9)
    expect(parseConfidence('I am very confident in the date.')).toBe(0.9)
    expect(parseConfidence('I am not sure about this.')).toBe(0.4)
    expect(parseConfidence("I don't know.")).toBe(0.4)
    expect(parseConfidence('It is unclear.')).toBe(0.4)
    expect(parseConfidence('Cannot determine from these images.')).toBe(0.4)
  })

  it('returns default 0.7 when no signal present', () => {
    expect(parseConfidence('The answer is 42.')).toBe(0.7)
    expect(parseConfidence('')).toBe(0.7)
  })
})

describe('parseCitations', () => {
  it('extracts comma-separated page numbers', () => {
    expect(parseCitations('Some answer.\nPAGES: 0, 2, 5')).toEqual([0, 2, 5])
  })

  it('handles single page', () => {
    expect(parseCitations('PAGES: 3')).toEqual([3])
  })

  it('case-insensitive', () => {
    expect(parseCitations('pages: 1, 2')).toEqual([1, 2])
  })

  it('handles extra whitespace', () => {
    expect(parseCitations('PAGES:  0 ,  2')).toEqual([0, 2])
  })

  it('returns empty when line missing', () => {
    expect(parseCitations('Just an answer.')).toEqual([])
  })

  it('skips negative / non-numeric tokens', () => {
    expect(parseCitations('PAGES: 0, abc, -1, 5')).toEqual([0, 5])
  })
})

describe('isFallbackEnabled', () => {
  beforeEach(() => {
    delete process.env.VISION_FALLBACK_MODE
    delete process.env.OPENAI_API_KEY
  })

  it('returns false when OPENAI_API_KEY unset', () => {
    expect(isFallbackEnabled()).toBe(false)
  })

  it('returns false when VISION_FALLBACK_MODE=stub even with key set', () => {
    process.env.OPENAI_API_KEY = 'sk-xxx'
    process.env.VISION_FALLBACK_MODE = 'stub'
    expect(isFallbackEnabled()).toBe(false)
  })

  it('returns true when key set + mode unset', () => {
    process.env.OPENAI_API_KEY = 'sk-xxx'
    expect(isFallbackEnabled()).toBe(true)
  })
})

describe('stubFallbackAnswer', () => {
  it('returns invoked=false', () => {
    const r = stubFallbackAnswer('q', [])
    expect(r.invoked).toBe(false)
  })

  it('cites the first page when pages provided', () => {
    const pages = [
      { id: 'vp-1', page_number: 5, page_image_path: 'x' } as any,
      { id: 'vp-2', page_number: 10 } as any,
    ]
    const r = stubFallbackAnswer('q', pages)
    expect(r.citations).toEqual([5])
  })

  it('confidence is the neutral 0.5 stub value', () => {
    expect(stubFallbackAnswer('q', []).confidence).toBe(0.5)
  })

  it('mentions stub mode in the answer text', () => {
    expect(stubFallbackAnswer('q', []).answer).toMatch(/stub fallback/i)
  })
})

describe('readFallbackThreshold', () => {
  beforeEach(() => { delete process.env.VISION_FALLBACK_THRESHOLD })

  it('default = 0.3', () => {
    expect(readFallbackThreshold()).toBe(DEFAULT_FALLBACK_THRESHOLD)
    expect(DEFAULT_FALLBACK_THRESHOLD).toBe(0.3)
  })

  it('respects valid env value', () => {
    process.env.VISION_FALLBACK_THRESHOLD = '0.5'
    expect(readFallbackThreshold()).toBe(0.5)
  })

  it('rejects out-of-range env values', () => {
    process.env.VISION_FALLBACK_THRESHOLD = '1.5'
    expect(readFallbackThreshold()).toBe(0.3)
    process.env.VISION_FALLBACK_THRESHOLD = '-0.1'
    expect(readFallbackThreshold()).toBe(0.3)
  })

  it('rejects garbage env values', () => {
    process.env.VISION_FALLBACK_THRESHOLD = 'not a number'
    expect(readFallbackThreshold()).toBe(0.3)
  })
})

describe('FALLBACK_MAX_PAGES constant', () => {
  it('is the spec-mandated 5-page cap', () => {
    expect(FALLBACK_MAX_PAGES).toBe(5)
  })
})

// ─── openAiVisionAnswer orchestration ────────────────────────────────

vi.mock('@/lib/ai/openai-vision', () => ({
  callOpenAiVision: vi.fn(),
  logVisionActivity: vi.fn().mockResolvedValue(undefined),
  DEFAULT_VISION_MODEL: 'gpt-4o',
}))

vi.mock('./storage', () => ({
  getPageImageUrl: vi.fn().mockImplementation(async (_s, path) => `https://signed.example/${path}`),
  VISION_PAGES_BUCKET: 'vision-pages',
}))

import { openAiVisionAnswer } from './openai-fallback'
import { callOpenAiVision, logVisionActivity } from '@/lib/ai/openai-vision'

const mockSupabase = {} as any

function makePage(pageNumber: number): any {
  return {
    id: `vp-${pageNumber}`,
    organization_id: 'org-A',
    source_document_id: 'doc-1',
    page_number: pageNumber,
    page_image_path: `org-A/doc-1/page_${String(pageNumber).padStart(4, '0')}.png`,
    status: 'indexed',
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.VISION_FALLBACK_MODE
  delete process.env.OPENAI_API_KEY
})

describe('openAiVisionAnswer — guards', () => {
  it('empty candidatePages → invoked=false, confidence=0', async () => {
    const r = await openAiVisionAnswer(mockSupabase, {
      organizationId: 'org-A',
      query: 'q',
      candidatePages: [],
    })
    expect(r.invoked).toBe(false)
    expect(r.confidence).toBe(0)
    expect(callOpenAiVision).not.toHaveBeenCalled()
  })

  it('no OPENAI_API_KEY → stub answer (no real call)', async () => {
    const r = await openAiVisionAnswer(mockSupabase, {
      organizationId: 'org-A',
      query: 'q',
      candidatePages: [makePage(0)],
    })
    expect(r.invoked).toBe(false)
    expect(r.answer).toMatch(/stub fallback/i)
    expect(callOpenAiVision).not.toHaveBeenCalled()
  })

  it('VISION_FALLBACK_MODE=stub → stub answer (even with key set)', async () => {
    process.env.OPENAI_API_KEY = 'sk-xxx'
    process.env.VISION_FALLBACK_MODE = 'stub'
    const r = await openAiVisionAnswer(mockSupabase, {
      organizationId: 'org-A',
      query: 'q',
      candidatePages: [makePage(0)],
    })
    expect(r.invoked).toBe(false)
    expect(callOpenAiVision).not.toHaveBeenCalled()
  })
})

describe('openAiVisionAnswer — happy path', () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'sk-xxx'
  })

  it('calls OpenAI with up to FALLBACK_MAX_PAGES pages', async () => {
    ;(callOpenAiVision as any).mockResolvedValue({
      answer: 'The annual was on May 1, 2025.\nPAGES: 0\nCONFIDENCE: HIGH',
      model: 'gpt-4o',
      inputTokens: 1200,
      outputTokens: 50,
      durationMs: 800,
      costUsdCents: 1,
    })

    // Pass 8 pages → should be capped to 5
    const pages = Array.from({ length: 8 }, (_, i) => makePage(i))
    await openAiVisionAnswer(mockSupabase, {
      organizationId: 'org-A',
      query: 'When was the last annual?',
      candidatePages: pages,
    })

    const call = (callOpenAiVision as any).mock.calls[0][0]
    expect(call.images).toHaveLength(FALLBACK_MAX_PAGES)
  })

  it('parses confidence + citations from the model response', async () => {
    ;(callOpenAiVision as any).mockResolvedValue({
      answer: 'The annual was on May 1, 2025.\nPAGES: 0, 2\nCONFIDENCE: HIGH',
      model: 'gpt-4o',
      inputTokens: 1200,
      outputTokens: 50,
      durationMs: 800,
      costUsdCents: 1,
    })

    const r = await openAiVisionAnswer(mockSupabase, {
      organizationId: 'org-A',
      query: 'q',
      candidatePages: [makePage(0), makePage(2)],
    })

    expect(r.invoked).toBe(true)
    expect(r.confidence).toBe(0.9)
    expect(r.citations).toEqual([0, 2])
    expect(r.model).toBe('gpt-4o')
  })

  it('logs success row to ai_activity_log', async () => {
    ;(callOpenAiVision as any).mockResolvedValue({
      answer: 'Answer.\nPAGES: 1\nCONFIDENCE: MEDIUM',
      model: 'gpt-4o',
      inputTokens: 1000,
      outputTokens: 30,
      durationMs: 500,
      costUsdCents: 1,
    })

    await openAiVisionAnswer(mockSupabase, {
      organizationId: 'org-A',
      userId: 'user-X',
      query: 'q',
      candidatePages: [makePage(1)],
    })

    expect(logVisionActivity).toHaveBeenCalledOnce()
    const logArg = (logVisionActivity as any).mock.calls[0][1]
    expect(logArg.scope).toBe('vision-fallback')
    expect(logArg.status).toBe('success')
    expect(logArg.organization_id).toBe('org-A')
    expect(logArg.user_id).toBe('user-X')
    expect(logArg.context.confidence).toBe(0.7)
    expect(logArg.context.citation_count).toBe(1)
  })

  it('logs failure row + rethrows on OpenAI error', async () => {
    ;(callOpenAiVision as any).mockRejectedValue(new Error('rate limited'))

    await expect(openAiVisionAnswer(mockSupabase, {
      organizationId: 'org-A',
      query: 'q',
      candidatePages: [makePage(0)],
    })).rejects.toThrow(/rate limited/)

    expect(logVisionActivity).toHaveBeenCalledOnce()
    const logArg = (logVisionActivity as any).mock.calls[0][1]
    expect(logArg.status).toBe('failure')
    expect(logArg.error_message).toMatch(/rate limited/)
  })
})
