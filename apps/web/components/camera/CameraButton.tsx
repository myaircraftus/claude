'use client'

/**
 * CameraButton (Spec 5.4) — opens device camera via getUserMedia
 * (preferring the environment-facing camera on mobile), captures a still
 * frame to a JPEG blob, posts to the configured endpoint, and surfaces
 * the result via onResult.
 *
 * Two preset modes:
 *   - mode='scan-part'    → POST /api/vision/scan-part → { extracted, matches }
 *   - mode='scan-logbook' → POST /api/vision/scan-logbook → { draft }
 *
 * Browser requirements: getUserMedia (Chrome / Safari iOS 11+ / Firefox /
 * Edge). Falls back to a file picker (capture="environment") when the
 * live stream is unavailable — same UX, just one tap of the OS camera.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, Loader2, X, AlertCircle, Check } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Mode = 'scan-part' | 'scan-logbook'

interface Props {
  mode: Mode
  onResult?: (data: unknown) => void
  /** Label shown on the button. Default depends on mode. */
  label?: string
  className?: string
}

export function CameraButton({ mode, onResult, label, className }: Props) {
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileFallbackRef = useRef<HTMLInputElement | null>(null)
  const supported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  useEffect(() => () => stopStream(), [stopStream])

  async function openCamera() {
    setError(null)
    if (!supported) {
      // Fall back to OS file picker with environment camera capture hint.
      fileFallbackRef.current?.click()
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
      })
      streamRef.current = stream
      setOpen(true)
      // Wait for the next tick so videoRef is attached.
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          void videoRef.current.play().catch(() => { /* ignore autoplay rejection */ })
        }
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Camera permission denied.')
      // Fall through to OS picker so the user isn't stuck.
      fileFallbackRef.current?.click()
    }
  }

  async function capture() {
    if (!videoRef.current || !canvasRef.current) return
    const v = videoRef.current
    const c = canvasRef.current
    c.width = v.videoWidth || 1280
    c.height = v.videoHeight || 720
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.drawImage(v, 0, 0, c.width, c.height)
    c.toBlob(async (blob) => {
      if (!blob) { setError('Capture failed'); return }
      stopStream()
      setOpen(false)
      await sendBlob(blob, 'image/jpeg', 'capture.jpg')
    }, 'image/jpeg', 0.85)
  }

  async function onFileFallback(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    await sendBlob(file, file.type || 'image/jpeg', file.name || 'capture.jpg')
  }

  async function sendBlob(blob: Blob, mime: string, name: string) {
    setSubmitting(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('image', new File([blob], name, { type: mime }))
      const res = await fetch(`/api/vision/${mode}`, { method: 'POST', body: fd })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`)
      toast.success('Scanned')
      onResult?.(json)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Scan failed'
      setError(msg)
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  function close() {
    stopStream()
    setOpen(false)
  }

  const buttonLabel = label ?? (mode === 'scan-part' ? 'Scan part' : 'Scan logbook')

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={openCamera}
        disabled={submitting}
        className={cn('inline-flex items-center gap-1', className)}
      >
        {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
        {buttonLabel}
      </Button>
      <input
        ref={fileFallbackRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic"
        // capture="environment" hints mobile browsers to open the rear camera.
        // Some desktop browsers ignore it; that's fine — they get a regular file picker.
        capture="environment"
        className="hidden"
        onChange={onFileFallback}
      />
      {error && (
        <div className="mt-2 bg-rose-50 border border-rose-200 text-rose-800 text-[11px] rounded-md px-2 py-1 inline-flex gap-1">
          <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" /> {error}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 bg-black/85 flex flex-col items-center justify-center p-4">
          <video ref={videoRef} className="max-h-[70vh] max-w-full rounded-lg" playsInline muted />
          <canvas ref={canvasRef} className="hidden" />
          <div className="mt-4 flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={close} className="bg-white">
              <X className="h-3.5 w-3.5 mr-1" /> Cancel
            </Button>
            <Button size="sm" onClick={capture}>
              <Check className="h-3.5 w-3.5 mr-1" /> Capture
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
