'use client'

/**
 * VoiceButton (Spec 5.4) — floating mic button.
 *
 * Captures audio via MediaRecorder (≤30s), POSTs the blob to
 * /api/voice/transcribe, then optionally to /api/voice/intent for
 * intent classification. Calls onResult with the final structured
 * intent (or just the transcript when classifyIntent=false).
 *
 * Browser requirements: getUserMedia + MediaRecorder (Chrome / Edge /
 * Safari 14.1+ / Firefox). Falls back to "voice not supported" when
 * unavailable. iOS requires HTTPS.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Mic, Loader2, Square, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface IntentResult {
  intent: string
  slots: Record<string, unknown>
  confidence: number
  confirm_required: boolean
}

interface OnResult {
  transcript: string
  intent?: IntentResult | null
}

interface Props {
  /** Callback receives the final transcript + (optional) classified intent. */
  onResult?: (result: OnResult) => void
  /** Send the transcript to /api/voice/intent for classification. Default true. */
  classifyIntent?: boolean
  /** Optional context passed to /api/voice/intent. */
  context?: Record<string, unknown>
  /** Max recording duration in seconds. Default 30. Hard cap is platform max. */
  maxSeconds?: number
  className?: string
}

export function VoiceButton({ onResult, classifyIntent = true, context, maxSeconds = 30, className }: Props) {
  const [state, setState] = useState<'idle' | 'recording' | 'transcribing'>('idle')
  const [secondsLeft, setSecondsLeft] = useState(maxSeconds)
  const [error, setError] = useState<string | null>(null)
  const mediaRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const tickRef = useRef<number | null>(null)
  const supported = typeof navigator !== 'undefined'
    && !!navigator.mediaDevices?.getUserMedia
    && typeof window !== 'undefined'
    && typeof window.MediaRecorder !== 'undefined'

  const stop = useCallback(() => {
    if (tickRef.current) { window.clearInterval(tickRef.current); tickRef.current = null }
    const rec = mediaRef.current
    if (rec && rec.state !== 'inactive') rec.stop()
  }, [])

  useEffect(() => () => stop(), [stop])

  async function start() {
    if (!supported) { setError('Voice not supported in this browser.'); return }
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      chunksRef.current = []
      const mime = pickSupportedMime()
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      mediaRef.current = rec
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunksRef.current, { type: mime ?? 'audio/webm' })
        if (blob.size === 0) { setState('idle'); setError('No audio captured.'); return }
        await sendForTranscription(blob, mime ?? 'audio/webm')
      }
      rec.start()
      setState('recording')
      setSecondsLeft(maxSeconds)
      tickRef.current = window.setInterval(() => {
        setSecondsLeft((s) => {
          if (s <= 1) { stop(); return 0 }
          return s - 1
        })
      }, 1000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Mic permission denied.')
      setState('idle')
    }
  }

  async function sendForTranscription(blob: Blob, mime: string) {
    setState('transcribing')
    try {
      const fd = new FormData()
      fd.append('audio', blob, `voice.${mime.split('/')[1]?.split(';')[0] ?? 'webm'}`)
      const res = await fetch('/api/voice/transcribe', { method: 'POST', body: fd })
      const json = await res.json().catch(() => ({})) as { text?: string; error?: string }
      if (!res.ok || !json.text) throw new Error(json.error ?? `Transcription failed (${res.status})`)
      const transcript = json.text

      let intent: IntentResult | null = null
      if (classifyIntent) {
        const ir = await fetch('/api/voice/intent', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text: transcript, context }),
        })
        const ij = await ir.json().catch(() => ({})) as Partial<IntentResult> & { error?: string }
        if (ir.ok && typeof ij.intent === 'string') {
          intent = {
            intent: ij.intent,
            slots: ij.slots ?? {},
            confidence: typeof ij.confidence === 'number' ? ij.confidence : 0,
            confirm_required: !!ij.confirm_required,
          }
        }
      }
      toast.success(`Heard: "${transcript.slice(0, 80)}${transcript.length > 80 ? '…' : ''}"`)
      onResult?.({ transcript, intent })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Voice failed'
      setError(msg)
      toast.error(msg)
    } finally {
      setState('idle')
    }
  }

  return (
    <div className={cn('inline-flex flex-col items-end gap-1', className)}>
      <button
        type="button"
        onClick={() => state === 'recording' ? stop() : start()}
        disabled={!supported || state === 'transcribing'}
        title={!supported ? 'Voice not supported' : state === 'recording' ? `Stop (${secondsLeft}s left)` : 'Tap to speak'}
        className={cn(
          'inline-flex items-center justify-center rounded-full w-12 h-12 shadow-lg transition-colors',
          state === 'recording' ? 'bg-rose-600 text-white animate-pulse' :
          state === 'transcribing' ? 'bg-slate-200 text-slate-500' :
          'bg-primary text-primary-foreground hover:opacity-90',
          !supported && 'opacity-50 cursor-not-allowed',
        )}
      >
        {state === 'recording' ? <Square className="h-5 w-5" /> :
         state === 'transcribing' ? <Loader2 className="h-5 w-5 animate-spin" /> :
         <Mic className="h-5 w-5" />}
      </button>
      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 text-[11px] rounded-md px-2 py-1 max-w-[220px] flex gap-1">
          <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" /> {error}
        </div>
      )}
    </div>
  )
}

function pickSupportedMime(): string | null {
  if (typeof window === 'undefined' || !window.MediaRecorder) return null
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']
  for (const m of candidates) {
    try { if (MediaRecorder.isTypeSupported(m)) return m } catch { /* ignore */ }
  }
  return null
}
