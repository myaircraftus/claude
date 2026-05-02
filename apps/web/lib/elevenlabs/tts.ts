/**
 * ElevenLabs text-to-speech wrapper.
 *
 * Returns audio bytes (mpeg by default). Pass a voice_id to pick a specific
 * voice, otherwise uses the default voice configured in env.
 *
 * Auth: ELEVENLABS_API_KEY (server-side only — never expose to the browser).
 * Default voice: ELEVENLABS_DEFAULT_VOICE_ID (optional).
 */

interface SynthesizeOptions {
  text: string
  voiceId?: string
  modelId?: string
  stability?: number
  similarityBoost?: number
}

interface SynthesizeResult {
  audio: ArrayBuffer
  contentType: string
}

export class ElevenLabsNotConfiguredError extends Error {
  constructor() {
    super('ElevenLabs is not configured: set ELEVENLABS_API_KEY')
    this.name = 'ElevenLabsNotConfiguredError'
  }
}

export function isElevenLabsConfigured(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY)
}

export async function synthesizeSpeech(
  options: SynthesizeOptions,
): Promise<SynthesizeResult> {
  if (!isElevenLabsConfigured()) {
    throw new ElevenLabsNotConfiguredError()
  }

  const apiKey = process.env.ELEVENLABS_API_KEY!
  const voiceId =
    options.voiceId ??
    process.env.ELEVENLABS_DEFAULT_VOICE_ID ??
    'EXAVITQu4vr4xnSDxMaL' // ElevenLabs "Bella" — public default voice

  const modelId = options.modelId ?? 'eleven_multilingual_v2'

  const resp = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text: options.text,
        model_id: modelId,
        voice_settings: {
          stability: options.stability ?? 0.5,
          similarity_boost: options.similarityBoost ?? 0.75,
        },
      }),
    },
  )

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '')
    throw new Error(`ElevenLabs ${resp.status}: ${errText}`)
  }

  const arrayBuf = await resp.arrayBuffer()
  return {
    audio: arrayBuf,
    contentType: resp.headers.get('content-type') ?? 'audio/mpeg',
  }
}
