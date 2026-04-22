import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  InvalidUploadedPdfError,
  parseOpenAiJsonOutput,
  parseTextNativePdf,
} from '@/lib/ingestion/native-pdf'

describe('parseOpenAiJsonOutput', () => {
  it('parses fenced json responses', () => {
    const parsed = parseOpenAiJsonOutput<{ pages: Array<{ page_number: number }> }>(`
Here is the OCR result:

\`\`\`json
{"pages":[{"page_number":1}]}
\`\`\`
`)

    expect(parsed.pages).toEqual([{ page_number: 1 }])
  })

  it('extracts the outer json object from surrounding text', () => {
    const parsed = parseOpenAiJsonOutput<{ pages: Array<{ page_number: number }> }>(
      'Result follows {"pages":[{"page_number":2}]} thank you'
    )

    expect(parsed.pages).toEqual([{ page_number: 2 }])
  })

  it('parses json wrapped in outer single quotes', () => {
    const parsed = parseOpenAiJsonOutput<{ type: string; value: number }>(
      `'{"type":"service_account","value":1}'`
    )

    expect(parsed).toEqual({ type: 'service_account', value: 1 })
  })

  it('parses json wrapped in outer double quotes', () => {
    const parsed = parseOpenAiJsonOutput<{ type: string; value: number }>(
      '"{\\"type\\":\\"service_account\\",\\"value\\":2}"'
    )

    expect(parsed).toEqual({ type: 'service_account', value: 2 })
  })
})

describe('parseTextNativePdf', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('throws a clear invalid-pdf error for structurally bad uploads', async () => {
    const malformedPdf = new Uint8Array([
      ...Buffer.from('%PDF-1.4\n'),
      ...new Uint8Array(128).fill(0),
      ...Buffer.from('\n%%EOF\n'),
    ])

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () =>
          malformedPdf.buffer.slice(
            malformedPdf.byteOffset,
            malformedPdf.byteOffset + malformedPdf.byteLength
          ),
      }))
    )

    await expect(
      parseTextNativePdf({
        fileUrl: 'https://example.com/bad.pdf',
        docType: 'airframe_logbook',
        title: 'Bad PDF',
      })
    ).rejects.toBeInstanceOf(InvalidUploadedPdfError)
  })
})
