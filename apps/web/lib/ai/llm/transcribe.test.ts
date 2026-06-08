import { describe, it, expect, vi } from 'vitest'

// Mock the SDK's transcription entrypoint so transcribeAudio's mapping is tested
// without a real Whisper call. (transcribe.ts only imports experimental_transcribe
// from 'ai'; openai.transcription() just builds a model descriptor, no network.)
vi.mock('ai', () => ({
  experimental_transcribe: vi.fn(async () => ({ text: 'hello world', durationInSeconds: 2 })),
}))

import { transcribeAudio } from './transcribe'

describe('transcribeAudio', () => {
  it('maps the SDK result to { text, durationSeconds }', async () => {
    const r = await transcribeAudio(new Uint8Array([1, 2, 3]))
    expect(r.text).toBe('hello world')
    expect(r.durationSeconds).toBe(2)
  })
})
