/**
 * Test-only helpers: build AI SDK mock models (V3 spec) so the REAL
 * generateText / generateObject / embedMany run against fake models — no API
 * key, no network, deterministic. NOT a *.test.ts file, so vitest won't collect
 * it as a suite; it's imported by the suites.
 */
import { MockEmbeddingModelV3, MockLanguageModelV3 } from 'ai/test'

/** A language model whose doGenerate always returns `text` + the given usage. */
export function mockTextModel(text: string, opts: { inTok?: number; outTok?: number } = {}) {
  const inTok = opts.inTok ?? 10
  const outTok = opts.outTok ?? 5
  return new MockLanguageModelV3({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    doGenerate: async (): Promise<any> => ({
      content: text ? [{ type: 'text' as const, text }] : [],
      finishReason: 'stop' as const,
      usage: {
        inputTokens: { total: inTok, noCache: inTok, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: outTok, text: outTok, reasoning: 0 },
      },
      warnings: [],
    }),
  })
}

/** A language model that returns `obj` serialized as JSON (for generateObject). */
export function mockObjectModel(obj: unknown, opts: { inTok?: number; outTok?: number } = {}) {
  return mockTextModel(JSON.stringify(obj), opts)
}

/** A language model whose doGenerate throws — for error-path tests. */
export function mockThrowingModel(message = 'mock model failure') {
  return new MockLanguageModelV3({
    doGenerate: async () => {
      throw new Error(message)
    },
  })
}

/**
 * An embedding model that returns one vector per input value, each encoding its
 * index in slot 0 so tests can assert order is preserved.
 */
export function mockEmbeddingModel(dims = 1536) {
  return new MockEmbeddingModelV3({
    // Encode the value's first char code in slot 0 so tests can assert that
    // embeddings[i] corresponds to values[i] (order preserved) regardless of
    // how embedMany internally batches the doEmbed calls.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    doEmbed: async ({ values }: { values: string[] }): Promise<any> => ({
      embeddings: values.map((v) => {
        const vec = new Array<number>(dims).fill(0)
        vec[0] = typeof v === 'string' && v.length > 0 ? v.charCodeAt(0) : 0
        return vec
      }),
      usage: { tokens: values.length * 3 },
    }),
  })
}

/** A fake Supabase client that records ai_activity_log inserts. */
export function fakeSupabase() {
  const inserts: Array<Record<string, unknown>> = []
  const client = {
    from: () => ({
      insert: async (row: Record<string, unknown>) => {
        inserts.push(row)
        return { error: null }
      },
    }),
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { client: client as any, inserts }
}
