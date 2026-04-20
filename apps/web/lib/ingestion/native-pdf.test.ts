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
})
