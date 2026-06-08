/**
 * transcribeAudio — unified audio transcription (Whisper) over the AI SDK.
 *
 * Centralized here so the SDK's transcription symbol/signature lives in ONE
 * place: if the AI SDK renames the entrypoint across versions, only this file
 * changes, not every caller. Uses `experimental_transcribe` (the SDK's current
 * transcription API).
 */
import { experimental_transcribe as transcribe } from 'ai'
import { openai } from '@ai-sdk/openai'

export interface TranscribeResult {
  text: string
  durationSeconds: number | null
}

export async function transcribeAudio(
  audio: Uint8Array | ArrayBuffer | string,
  opts: { model?: string; abortSignal?: AbortSignal } = {},
): Promise<TranscribeResult> {
  const result = await transcribe({
    model: openai.transcription(opts.model || 'whisper-1'),
    audio,
    abortSignal: opts.abortSignal,
  })
  return {
    text: result.text,
    durationSeconds:
      (result as { durationInSeconds?: number }).durationInSeconds ?? null,
  }
}
