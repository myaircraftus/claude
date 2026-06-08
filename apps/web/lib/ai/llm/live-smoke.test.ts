/**
 * LIVE smoke tests — make REAL provider API calls through the unified wrapper.
 *
 * Skipped by default. To run end-to-end against real providers:
 *   RUN_LIVE_LLM_TESTS=1 OPENAI_API_KEY=... ANTHROPIC_API_KEY=... GEMINI_API_KEY=... \
 *     pnpm --dir apps/web exec vitest run lib/ai/llm/live-smoke.test.ts
 *
 * Each case is also gated on its provider's key, so you can run a subset.
 */
import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { generateLlmText, generateLlmObject, embedTexts } from './index'
import { callAnthropic } from '@/lib/ai/anthropic'

const LIVE = process.env.RUN_LIVE_LLM_TESTS === '1'
const hasOpenAI = !!process.env.OPENAI_API_KEY
const hasAnthropic = !!process.env.ANTHROPIC_API_KEY
const hasGemini = !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const noopSupabase = { from: () => ({ insert: async () => ({ error: null }) }) } as any

describe('LIVE smoke (real API calls — gated on RUN_LIVE_LLM_TESTS=1)', () => {
  it.skipIf(!LIVE || !hasOpenAI)(
    'OpenAI: generateLlmText returns text + usage',
    async () => {
      const r = await generateLlmText({
        model: 'gpt-4o-mini',
        prompt: 'Reply with exactly one word: pong',
        maxOutputTokens: 5,
      })
      expect(r.text.trim().length).toBeGreaterThan(0)
      expect(r.usage.inputTokens).toBeGreaterThan(0)
      expect(r.usage.outputTokens).toBeGreaterThan(0)
    },
    30_000,
  )

  it.skipIf(!LIVE || !hasOpenAI)(
    'OpenAI: generateLlmObject parses a typed object',
    async () => {
      const r = await generateLlmObject({
        model: 'gpt-4o-mini',
        schema: z.object({ answer: z.number() }),
        prompt: 'Return the JSON object {"answer": 42} and nothing else.',
      })
      expect(r.object.answer).toBe(42)
    },
    30_000,
  )

  it.skipIf(!LIVE || !hasOpenAI)(
    'OpenAI: embedTexts returns 1536-dim vectors',
    async () => {
      const r = await embedTexts(['the quick brown fox'])
      expect(r.embeddings).toHaveLength(1)
      expect(r.embeddings[0]).toHaveLength(1536)
      expect(r.tokens).toBeGreaterThan(0)
    },
    30_000,
  )

  it.skipIf(!LIVE || !hasOpenAI)(
    'OpenAI: vision image part (multimodal transport)',
    async () => {
      // Build a real 16x16 PNG (a 1x1 is rejected by OpenAI's image parser).
      const zlib = await import('node:zlib')
      const crcTable: number[] = []
      for (let n = 0; n < 256; n++) {
        let c = n
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
        crcTable[n] = c >>> 0
      }
      const crc32 = (buf: Buffer) => {
        let c = 0xffffffff
        for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
        return (c ^ 0xffffffff) >>> 0
      }
      const chunk = (type: string, data: Buffer) => {
        const len = Buffer.alloc(4)
        len.writeUInt32BE(data.length, 0)
        const t = Buffer.from(type, 'ascii')
        const crc = Buffer.alloc(4)
        crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0)
        return Buffer.concat([len, t, data, crc])
      }
      const w = 16
      const h = 16
      const ihdr = Buffer.alloc(13)
      ihdr.writeUInt32BE(w, 0)
      ihdr.writeUInt32BE(h, 4)
      ihdr[8] = 8
      ihdr[9] = 2 // RGB
      const raw = Buffer.alloc((w * 3 + 1) * h)
      for (let y = 0; y < h; y++) {
        const o = y * (w * 3 + 1)
        for (let x = 0; x < w; x++) {
          const p = o + 1 + x * 3
          raw[p] = 220
          raw[p + 1] = 40
          raw[p + 2] = 40
        }
      }
      const idat = zlib.deflateSync(raw)
      const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
      const png = Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
      const dataUrl = `data:image/png;base64,${png.toString('base64')}`
      const r = await generateLlmText({
        model: 'gpt-4o',
        maxOutputTokens: 20,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', image: dataUrl },
              { type: 'text', text: 'What is the dominant color in this image? One word.' },
            ],
          },
        ],
      })
      expect(r.text.trim().length).toBeGreaterThan(0)
    },
    30_000,
  )

  it.skipIf(!LIVE || !hasOpenAI)(
    'OpenAI: PDF file part (OCR fallback shape)',
    async () => {
      const { PDFDocument, StandardFonts } = await import('pdf-lib')
      const doc = await PDFDocument.create()
      const page = doc.addPage([240, 120])
      const font = await doc.embedFont(StandardFonts.Helvetica)
      page.drawText('PINGPDF', { x: 30, y: 60, size: 28, font })
      const bytes = await doc.save()
      const dataUrl = `data:application/pdf;base64,${Buffer.from(bytes).toString('base64')}`
      const r = await generateLlmText({
        model: 'gpt-4o',
        maxOutputTokens: 20,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'file', data: dataUrl, mediaType: 'application/pdf' },
              { type: 'text', text: 'What word is written in this PDF? Reply with just that word.' },
            ],
          },
        ],
      })
      expect(r.text.toUpperCase()).toContain('PINGPDF')
    },
    30_000,
  )

  it.skipIf(!LIVE || !hasAnthropic)(
    'Anthropic: callAnthropic returns text + token counts',
    async () => {
      const r = await callAnthropic(
        noopSupabase,
        { system: 'You are terse.', user: 'Reply with exactly one word: pong' },
        { organization_id: null, scope: 'live-smoke' },
      )
      expect(r.text.toLowerCase()).toContain('pong')
      expect(r.input_tokens).toBeGreaterThan(0)
    },
    30_000,
  )

  it.skipIf(!LIVE || !hasGemini)(
    'Gemini: generateLlmText (google provider) returns text',
    async () => {
      const r = await generateLlmText({
        provider: 'google',
        model: process.env.GEMINI_OCR_MODEL || 'gemini-3-flash-preview',
        prompt: 'Reply with exactly one word: pong',
        maxOutputTokens: 16,
      })
      expect(r.text.toLowerCase()).toContain('pong')
    },
    30_000,
  )
})
