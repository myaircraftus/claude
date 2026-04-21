import { describe, expect, it } from 'vitest'
import { parseOpenAiJsonOutput } from '@/lib/ingestion/native-pdf'

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
