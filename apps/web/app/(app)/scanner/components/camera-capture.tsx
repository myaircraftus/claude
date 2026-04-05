'use client'

// Browser-native camera capture using getUserMedia + canvas.
// Runs quality heuristics on the captured frame and uploads the blob
// to /api/scanner/batches/[id]/pages. Designed for mobile + desktop.

import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, RotateCcw, Upload, CheckCircle2, Loader2, AlertTriangle, X, Image as ImageIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { computeQuality } from '@/lib/scanner/quality'

interface CapturedPage {
  id: string
  blob: Blob
  dataUrl: string
  qualityScore: number
  warnings: string[]
  uploadedId?: string
  uploadError?: string
}

interface Props {
  batchId: string
  initialPageNumber: number
  onPageUploaded?: (page: { id: string; page_number: number; quality_score: number | null; warnings: string[] }) => void
}

export function CameraCapture({ batchId, initialPageNumber, onPageUploaded }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraActive, setCameraActive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [captured, setCaptured] = useState<CapturedPage[]>([])
  const [uploading, setUploading] = useState(false)
  const [nextPageNumber, setNextPageNumber] = useState(initialPageNumber)

  const startCamera = useCallback(async () => {
    setError(null)
    try {
      const constraints: MediaStreamConstraints = {
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } },
        audio: false,
      }
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setCameraActive(true)
    } catch (err: any) {
      setError(err?.message ?? 'Camera permission denied. You can still upload files below.')
      setCameraActive(false)
    }
  }, [])

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setCameraActive(false)
  }, [])

  useEffect(() => () => stopCamera(), [stopCamera])

  const capture = useCallback(async () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    const w = video.videoWidth, h = video.videoHeight
    if (!w || !h) return
    canvas.width = w; canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, w, h)
    const imageData = ctx.getImageData(0, 0, w, h)
    const quality = computeQuality({ data: imageData.data, width: w, height: h })
    const blob: Blob = await new Promise(resolve => canvas.toBlob(b => resolve(b!), 'image/jpeg', 0.88))
    const dataUrl = canvas.toDataURL('image/jpeg', 0.88)
    const page: CapturedPage = {
      id: crypto.randomUUID(),
      blob,
      dataUrl,
      qualityScore: quality.score,
      warnings: quality.warnings,
    }
    setCaptured(prev => [...prev, page])
  }, [])

  const handleFilePick = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    for (const file of Array.from(files)) {
      const bmp = await createImageBitmap(file).catch(() => null)
      if (!bmp) continue
      const canvas = document.createElement('canvas')
      canvas.width = bmp.width; canvas.height = bmp.height
      const ctx = canvas.getContext('2d')
      if (!ctx) continue
      ctx.drawImage(bmp, 0, 0)
      const imageData = ctx.getImageData(0, 0, bmp.width, bmp.height)
      const quality = computeQuality({ data: imageData.data, width: bmp.width, height: bmp.height })
      const blob: Blob = await new Promise(resolve => canvas.toBlob(b => resolve(b!), 'image/jpeg', 0.88))
      const dataUrl = canvas.toDataURL('image/jpeg', 0.88)
      setCaptured(prev => [...prev, {
        id: crypto.randomUUID(),
        blob,
        dataUrl,
        qualityScore: quality.score,
        warnings: quality.warnings,
      }])
    }
    e.target.value = ''
  }, [])

  const removePage = useCallback((id: string) => {
    setCaptured(prev => prev.filter(p => p.id !== id))
  }, [])

  const uploadAll = useCallback(async () => {
    if (captured.length === 0 || uploading) return
    setUploading(true)
    setError(null)
    let pageNumber = nextPageNumber
    const successful: CapturedPage[] = []
    for (const page of captured) {
      if (page.uploadedId) { pageNumber++; continue }
      const form = new FormData()
      form.append('file', page.blob, `page-${pageNumber}.jpg`)
      form.append('page_number', String(pageNumber))
      form.append('quality_score', String(page.qualityScore))
      form.append('warnings', page.warnings.join(','))
      try {
        const resp = await fetch(`/api/scanner/batches/${batchId}/pages`, { method: 'POST', body: form })
        const j = await resp.json()
        if (!resp.ok) throw new Error(j.error ?? 'Upload failed')
        page.uploadedId = j.page?.id
        successful.push(page)
        if (onPageUploaded && j.page) {
          onPageUploaded({
            id: j.page.id,
            page_number: pageNumber,
            quality_score: page.qualityScore,
            warnings: page.warnings,
          })
        }
        pageNumber++
      } catch (err: any) {
        page.uploadError = err?.message ?? 'Upload failed'
      }
    }
    // Clear successful ones, keep failed for retry
    setCaptured(prev => prev.filter(p => !successful.includes(p)))
    setNextPageNumber(pageNumber)
    setUploading(false)
    if (successful.length > 0 && successful.length === captured.length) {
      // all good
    }
  }, [batchId, captured, nextPageNumber, onPageUploaded, uploading])

  return (
    <div className="space-y-3">
      {/* Viewport */}
      <div className="relative rounded-xl overflow-hidden bg-black aspect-[4/3] max-h-[60vh]">
        <video
          ref={videoRef}
          playsInline
          muted
          className={cn('w-full h-full object-cover', cameraActive ? 'block' : 'hidden')}
        />
        <canvas ref={canvasRef} className="hidden" />
        {!cameraActive && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white/80 gap-3">
            <Camera className="h-10 w-10 opacity-60" />
            <p className="text-sm">Camera not active</p>
            <Button onClick={startCamera} variant="secondary" size="sm" className="gap-2">
              <Camera className="h-4 w-4" />
              Start camera
            </Button>
          </div>
        )}
        {cameraActive && (
          <div className="absolute inset-x-0 bottom-0 p-3 flex items-center justify-between gap-2 bg-gradient-to-t from-black/60 to-transparent">
            <Button onClick={stopCamera} variant="secondary" size="sm" className="gap-1">
              <RotateCcw className="h-3.5 w-3.5" />
              Stop
            </Button>
            <button
              onClick={capture}
              className="w-16 h-16 rounded-full bg-white border-4 border-white/40 shadow-lg hover:scale-105 transition-transform"
              aria-label="Capture page"
            />
            <label className="inline-flex items-center gap-1 h-9 rounded-md px-3 bg-secondary text-secondary-foreground text-sm font-medium cursor-pointer hover:bg-secondary/80 transition-colors">
              <input type="file" accept="image/*" capture="environment" multiple className="sr-only" onChange={handleFilePick} />
              <ImageIcon className="h-3.5 w-3.5" />
              Upload
            </label>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-md border border-amber-200 bg-amber-50 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Non-camera fallback / upload from disk */}
      {!cameraActive && (
        <label className="inline-flex items-center gap-1 h-9 rounded-md px-3 border border-input bg-background text-sm font-medium cursor-pointer hover:bg-accent hover:text-accent-foreground transition-colors">
          <input type="file" accept="image/*" multiple className="sr-only" onChange={handleFilePick} />
          <Upload className="h-3.5 w-3.5" />
          Pick image files
        </label>
      )}

      {/* Pending pages */}
      {captured.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {captured.length} page{captured.length !== 1 ? 's' : ''} pending upload
            </p>
            <Button size="sm" onClick={uploadAll} disabled={uploading} className="gap-1">
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              {uploading ? 'Uploading…' : 'Upload all'}
            </Button>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
            {captured.map(p => (
              <div key={p.id} className="relative rounded-md border border-border overflow-hidden bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.dataUrl} alt="" className="w-full aspect-[3/4] object-cover" />
                <button
                  onClick={() => removePage(p.id)}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
                  aria-label="Remove"
                >
                  <X className="h-3 w-3" />
                </button>
                <div className="absolute inset-x-0 bottom-0 px-1.5 py-1 bg-gradient-to-t from-black/70 to-transparent text-[10px] text-white flex items-center justify-between">
                  <span className={cn('font-medium', p.qualityScore >= 0.65 ? 'text-emerald-300' : p.qualityScore >= 0.4 ? 'text-amber-300' : 'text-red-300')}>
                    q {p.qualityScore.toFixed(2)}
                  </span>
                  {p.warnings.length > 0 && <span className="truncate">{p.warnings.join(',')}</span>}
                </div>
                {p.uploadError && (
                  <div className="absolute inset-0 bg-red-500/70 flex items-center justify-center text-white text-[10px] text-center p-2">
                    {p.uploadError}
                  </div>
                )}
                {p.uploadedId && (
                  <div className="absolute inset-0 bg-emerald-500/60 flex items-center justify-center">
                    <CheckCircle2 className="h-5 w-5 text-white" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
