'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Camera, BookOpen, FileText, ChevronRight, X, RotateCcw,
  CheckCircle, Upload, Loader2, AlertTriangle, Eye, Trash2,
  ScanLine, Plane, ChevronLeft, ChevronUp, ChevronDown,
  LogOut, Clipboard, Archive, Tag, Receipt, Wrench, Hash,
  ArrowRight, Plus,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createBrowserSupabase } from '@/lib/supabase/browser'

// ─── Types ────────────────────────────────────────────────────────────────────

type ScanMode = 'batch' | 'evidence'

type BatchClass =
  | 'airframe_logbook' | 'engine_logbook' | 'prop_logbook' | 'avionics_logbook'
  | 'work_order_batch' | 'discrepancy_batch' | 'general_records' | 'unknown'

type EvidenceType =
  | 'work_order' | 'logbook_entry' | 'annual_inspection' | '100hr_inspection'
  | 'ad_sheet' | 'yellow_tag' | 'form_337' | 'form_8130' | 'invoice'
  | 'weight_balance' | 'signed_entry' | 'other'

type StorageTarget =
  | 'airframe_log' | 'engine_log' | 'prop_log' | 'avionics_log'
  | 'work_order' | 'discrepancy' | 'invoice_support' | 'general' | 'unknown'

type NextAction =
  | 'generate_logbook_entry' | 'attach_to_work_order' | 'create_invoice_draft'
  | 'create_reminder' | 'informational_only'

type Step = 'mode' | 'context' | 'capture' | 'review' | 'finish' | 'status'

interface CapturedPage {
  id: string
  dataUrl: string
  file: File
  label?: string
  unreadable?: boolean
}

interface AircraftRow {
  id: string
  tail_number: string
  make: string
  model: string
  year?: number | null
}

interface Props {
  aircraft: AircraftRow[]
  organizationId: string
  organizationName?: string
  userRole: string
  userId: string
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const BATCH_CLASSES: { value: BatchClass; label: string; icon: React.ReactNode }[] = [
  { value: 'airframe_logbook', label: 'Airframe Logbook', icon: <BookOpen className="h-5 w-5" /> },
  { value: 'engine_logbook', label: 'Engine Logbook', icon: <BookOpen className="h-5 w-5" /> },
  { value: 'prop_logbook', label: 'Propeller Logbook', icon: <BookOpen className="h-5 w-5" /> },
  { value: 'avionics_logbook', label: 'Avionics Logbook', icon: <BookOpen className="h-5 w-5" /> },
  { value: 'work_order_batch', label: 'Work Order Batch', icon: <Clipboard className="h-5 w-5" /> },
  { value: 'discrepancy_batch', label: 'Discrepancy Batch', icon: <AlertTriangle className="h-5 w-5" /> },
  { value: 'general_records', label: 'General Records', icon: <Archive className="h-5 w-5" /> },
  { value: 'unknown', label: 'Unknown / Classify Later', icon: <Hash className="h-5 w-5" /> },
]

const EVIDENCE_TYPES: { value: EvidenceType; label: string; icon: React.ReactNode }[] = [
  { value: 'work_order', label: 'Work Order', icon: <Wrench className="h-5 w-5" /> },
  { value: 'logbook_entry', label: 'Logbook Entry', icon: <BookOpen className="h-5 w-5" /> },
  { value: 'annual_inspection', label: 'Annual Inspection', icon: <CheckCircle className="h-5 w-5" /> },
  { value: '100hr_inspection', label: '100-Hour Inspection', icon: <CheckCircle className="h-5 w-5" /> },
  { value: 'ad_sheet', label: 'AD Compliance Sheet', icon: <FileText className="h-5 w-5" /> },
  { value: 'yellow_tag', label: 'Yellow Tag', icon: <Tag className="h-5 w-5" /> },
  { value: 'form_337', label: 'FAA Form 337', icon: <FileText className="h-5 w-5" /> },
  { value: 'form_8130', label: 'FAA Form 8130-3', icon: <FileText className="h-5 w-5" /> },
  { value: 'invoice', label: 'Invoice / Receipt', icon: <Receipt className="h-5 w-5" /> },
  { value: 'weight_balance', label: 'Weight & Balance', icon: <FileText className="h-5 w-5" /> },
  { value: 'signed_entry', label: 'Signed Maintenance Entry', icon: <FileText className="h-5 w-5" /> },
  { value: 'other', label: 'Other / Unknown', icon: <Hash className="h-5 w-5" /> },
]

const STORAGE_TARGETS: { value: StorageTarget; label: string }[] = [
  { value: 'airframe_log', label: 'Airframe Log' },
  { value: 'engine_log', label: 'Engine Log' },
  { value: 'prop_log', label: 'Propeller Log' },
  { value: 'avionics_log', label: 'Avionics Log' },
  { value: 'work_order', label: 'Work Order Attachment' },
  { value: 'discrepancy', label: 'Discrepancy File' },
  { value: 'invoice_support', label: 'Invoice Support' },
  { value: 'general', label: 'General Records' },
  { value: 'unknown', label: 'Unknown — Review Later' },
]

const NEXT_ACTIONS: { value: NextAction; label: string; description: string }[] = [
  { value: 'generate_logbook_entry', label: 'Generate Logbook Entry', description: 'Use AI to extract and format a logbook entry from this document' },
  { value: 'attach_to_work_order', label: 'Attach to Work Order', description: 'Link this document to an existing work order' },
  { value: 'create_invoice_draft', label: 'Create Invoice Draft', description: 'Propose an invoice from this work order or receipt' },
  { value: 'create_reminder', label: 'Create Reminder', description: 'Set a follow-up reminder based on this document' },
  { value: 'informational_only', label: 'Store Only', description: 'Just archive — no further action needed' },
]

// ─── ScannerApp ────────────────────────────────────────────────────────────────

export function ScannerApp({ aircraft, organizationId, organizationName, userRole, userId }: Props) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<Step>('mode')
  const [mode, setMode] = useState<ScanMode>('batch')
  const [selectedAircraftId, setSelectedAircraftId] = useState(aircraft[0]?.id ?? '')
  const [batchClass, setBatchClass] = useState<BatchClass | ''>('')
  const [evidenceType, setEvidenceType] = useState<EvidenceType | ''>('')
  const [storageTarget, setStorageTarget] = useState<StorageTarget>('unknown')
  const [batchTitle, setBatchTitle] = useState('')
  const [pages, setPages] = useState<CapturedPage[]>([])
  const [previewPage, setPreviewPage] = useState<CapturedPage | null>(null)
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle')
  const [uploadProgress, setUploadProgress] = useState(0)
  const [submitError, setSubmitError] = useState('')
  const [batchId, setBatchId] = useState<string | null>(null)
  const [selectedNextAction, setSelectedNextAction] = useState<NextAction | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)

  // Start scan session on mount
  useEffect(() => {
    const supabase = createBrowserSupabase()
    supabase.from('scan_sessions').insert({
      organization_id: organizationId,
      scanner_user_id: userId,
      device_type: /iPad|iPhone|Android/.test(navigator.userAgent) ? 'mobile' : 'desktop',
      device_metadata: { userAgent: navigator.userAgent },
      started_at: new Date().toISOString(),
      status: 'active',
    }).select('id').single().then(({ data }) => {
      if (data) setSessionId(data.id)
    })

    return () => {
      // End session on unmount (best effort)
      if (sessionId) {
        supabase.from('scan_sessions').update({
          ended_at: new Date().toISOString(),
          status: 'completed',
        }).eq('id', sessionId)
      }
    }
  }, [organizationId, userId])

  // ── Camera / file input ────────────────────────────────────────────────────

  const openCamera = useCallback(() => {
    if (!fileInputRef.current) return
    fileInputRef.current.accept = 'image/*'
    fileInputRef.current.capture = 'environment'
    fileInputRef.current.multiple = false
    fileInputRef.current.click()
  }, [])

  const openFileSelect = useCallback(() => {
    if (!fileInputRef.current) return
    fileInputRef.current.accept = 'image/*,application/pdf'
    fileInputRef.current.removeAttribute('capture')
    fileInputRef.current.multiple = true
    fileInputRef.current.click()
  }, [])

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files) return
    const newPages: CapturedPage[] = Array.from(files).map(file => ({
      id: crypto.randomUUID(),
      dataUrl: URL.createObjectURL(file),
      file,
    }))
    setPages(prev => [...prev, ...newPages])
  }, [])

  // ── Page management ────────────────────────────────────────────────────────

  const deletePage = (id: string) => setPages(prev => prev.filter(p => p.id !== id))
  const toggleUnreadable = (id: string) => setPages(prev => prev.map(p => p.id === id ? { ...p, unreadable: !p.unreadable } : p))

  const movePage = (id: string, dir: 'up' | 'down') => {
    setPages(prev => {
      const idx = prev.findIndex(p => p.id === id)
      if (idx === -1) return prev
      const next = [...prev]
      const swapIdx = dir === 'up' ? idx - 1 : idx + 1
      if (swapIdx < 0 || swapIdx >= next.length) return prev
      ;[next[idx], next[swapIdx]] = [next[swapIdx], next[idx]]
      return next
    })
  }

  // ── Submit ─────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    setSubmitStatus('uploading')
    setUploadProgress(0)
    setSubmitError('')

    try {
      const formData = new FormData()
      formData.append('organization_id', organizationId)
      formData.append('mode', mode)
      formData.append('aircraft_id', selectedAircraftId)
      formData.append('batch_class', mode === 'batch' ? batchClass : evidenceType)
      formData.append('title', batchTitle || defaultTitle())
      formData.append('storage_target', storageTarget)
      formData.append('user_id', userId)
      if (sessionId) formData.append('session_id', sessionId)

      pages.forEach((p, i) => {
        formData.append(`page_${i}`, p.file)
        if (p.unreadable) formData.append(`unreadable_${i}`, 'true')
      })

      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 8, 85))
      }, 300)

      const res = await fetch('/api/scanner/submit', {
        method: 'POST',
        body: formData,
      })

      clearInterval(progressInterval)
      setUploadProgress(100)

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(err.error ?? `Upload failed (${res.status})`)
      }

      const result = await res.json() as { batch_id?: string }
      setBatchId(result.batch_id ?? null)

      // For evidence mode: record to evidence_captures
      if (mode === 'evidence' && result.batch_id) {
        const supabase = createBrowserSupabase()
        await supabase.from('evidence_captures').insert({
          organization_id: organizationId,
          aircraft_id: selectedAircraftId || null,
          created_by: userId,
          evidence_type: evidenceType,
          chosen_storage_target: storageTarget,
          scan_batch_id: result.batch_id,
          suggested_action: selectedNextAction,
          status: 'submitted',
        })
      }

      setSubmitStatus('done')
    } catch (err) {
      setSubmitStatus('error')
      setSubmitError((err as Error).message)
    }
  }

  function defaultTitle(): string {
    const ac = aircraft.find(a => a.id === selectedAircraftId)
    const acLabel = ac ? ac.tail_number : 'Unknown'
    const typeLabel = mode === 'batch'
      ? BATCH_CLASSES.find(b => b.value === batchClass)?.label ?? 'Scan'
      : EVIDENCE_TYPES.find(e => e.value === evidenceType)?.label ?? 'Evidence'
    const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    return `${acLabel} — ${typeLabel} — ${date}`
  }

  function resetAll() {
    setStep('mode')
    setMode('batch')
    setBatchClass('')
    setEvidenceType('')
    setStorageTarget('unknown')
    setPages([])
    setBatchTitle('')
    setSubmitStatus('idle')
    setUploadProgress(0)
    setSubmitError('')
    setBatchId(null)
    setSelectedNextAction(null)
  }

  async function handleSignOut() {
    const supabase = createBrowserSupabase()
    await supabase.auth.signOut()
    router.replace('/scanner/login')
  }

  const contextValid = selectedAircraftId !== '' && (
    mode === 'batch' ? batchClass !== '' : evidenceType !== ''
  )

  const selectedAircraft = aircraft.find(a => a.id === selectedAircraftId)

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center">
            <ScanLine className="h-4 w-4 text-white" />
          </div>
          <div>
            <span className="text-sm font-bold text-foreground">MyAircraft Scanner</span>
            {organizationName && (
              <p className="text-xs text-muted-foreground">{organizationName}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {submitStatus === 'idle' && step !== 'mode' && (
            <button
              onClick={resetAll}
              className="text-xs text-muted-foreground hover:text-foreground px-3 py-1.5 border border-border rounded-lg"
            >
              New Scan
            </button>
          )}
          <button onClick={handleSignOut} className="p-2 text-muted-foreground hover:text-foreground">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={e => handleFiles(e.target.files)}
      />

      {/* Image preview modal */}
      {previewPage && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => setPreviewPage(null)}>
          <img src={previewPage.dataUrl} alt="Preview" className="max-w-full max-h-full object-contain rounded-xl" onClick={e => e.stopPropagation()} />
          <button className="absolute top-4 right-4 text-white" onClick={() => setPreviewPage(null)}>
            <X className="h-6 w-6" />
          </button>
        </div>
      )}

      {/* Progress steps */}
      {submitStatus === 'idle' && (
        <div className="flex items-center justify-center gap-1 py-3 px-4 border-b border-border">
          {(['mode', 'context', 'capture', 'review', 'finish'] as Step[]).map((s, i) => {
            const steps: Step[] = ['mode', 'context', 'capture', 'review', 'finish', 'status']
            const current = steps.indexOf(step)
            const idx = steps.indexOf(s)
            const done = idx < current
            const active = s === step
            return (
              <div key={s} className="flex items-center gap-1">
                <div className={cn(
                  'w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors',
                  active ? 'bg-foreground text-background' : done ? 'bg-brand-500 text-white' : 'bg-muted text-muted-foreground'
                )}>
                  {done ? '✓' : i + 1}
                </div>
                {i < 4 && <div className={cn('w-6 h-0.5', done ? 'bg-brand-500' : 'bg-muted')} />}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-6">

          {/* ── STEP: Mode ── */}
          {step === 'mode' && (
            <div>
              <h2 className="text-xl font-bold text-foreground mb-1">What are you scanning?</h2>
              <p className="text-sm text-muted-foreground mb-6">Choose the type of scan to get started.</p>

              <div className="grid grid-cols-1 gap-4">
                <button
                  onClick={() => { setMode('batch'); setStep('context') }}
                  className="flex items-center gap-5 p-6 rounded-2xl border-2 border-border hover:border-brand-400 hover:bg-brand-50 transition-all text-left group"
                >
                  <div className="w-14 h-14 rounded-xl bg-brand-100 flex items-center justify-center shrink-0 group-hover:bg-brand-200 transition-colors">
                    <BookOpen className="h-7 w-7 text-brand-600" />
                  </div>
                  <div>
                    <p className="font-bold text-foreground text-base">Batch Logbook Scan</p>
                    <p className="text-sm text-muted-foreground mt-0.5">Scan many pages of a logbook or records batch. Pages will be compiled into a PDF.</p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground ml-auto shrink-0" />
                </button>

                <button
                  onClick={() => { setMode('evidence'); setStep('context') }}
                  className="flex items-center gap-5 p-6 rounded-2xl border-2 border-border hover:border-amber-400 hover:bg-amber-50 transition-all text-left group"
                >
                  <div className="w-14 h-14 rounded-xl bg-amber-100 flex items-center justify-center shrink-0 group-hover:bg-amber-200 transition-colors">
                    <Camera className="h-7 w-7 text-amber-600" />
                  </div>
                  <div>
                    <p className="font-bold text-foreground text-base">Evidence Capture</p>
                    <p className="text-sm text-muted-foreground mt-0.5">Capture a single item: work order, signed entry, yellow tag, 337, invoice, or other document.</p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground ml-auto shrink-0" />
                </button>
              </div>
            </div>
          )}

          {/* ── STEP: Context ── */}
          {step === 'context' && (
            <div>
              <button onClick={() => setStep('mode')} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-5">
                <ChevronLeft className="h-4 w-4" /> Back
              </button>
              <h2 className="text-xl font-bold text-foreground mb-1">Set context</h2>
              <p className="text-sm text-muted-foreground mb-6">Select the aircraft and document type before scanning.</p>

              <div className="space-y-5">
                {/* Aircraft */}
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Aircraft</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {aircraft.map(ac => (
                      <button
                        key={ac.id}
                        onClick={() => setSelectedAircraftId(ac.id)}
                        className={cn(
                          'flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-colors',
                          selectedAircraftId === ac.id
                            ? 'border-brand-500 bg-brand-50'
                            : 'border-border hover:border-brand-300'
                        )}
                      >
                        <Plane className="h-5 w-5 text-muted-foreground shrink-0" />
                        <div>
                          <p className="font-bold text-foreground text-sm">{ac.tail_number}</p>
                          <p className="text-xs text-muted-foreground">{ac.make} {ac.model}{ac.year ? ` (${ac.year})` : ''}</p>
                        </div>
                        {selectedAircraftId === ac.id && <CheckCircle className="h-4 w-4 text-brand-500 ml-auto" />}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Batch type or evidence type */}
                {mode === 'batch' ? (
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Batch Type</label>
                    <div className="grid grid-cols-2 gap-2">
                      {BATCH_CLASSES.map(bc => (
                        <button
                          key={bc.value}
                          onClick={() => setBatchClass(bc.value)}
                          className={cn(
                            'flex items-center gap-2 p-3 rounded-xl border-2 text-left transition-colors',
                            batchClass === bc.value
                              ? 'border-brand-500 bg-brand-50'
                              : 'border-border hover:border-brand-300'
                          )}
                        >
                          <span className="text-muted-foreground">{bc.icon}</span>
                          <span className="text-xs font-medium text-foreground leading-tight">{bc.label}</span>
                          {batchClass === bc.value && <CheckCircle className="h-3.5 w-3.5 text-brand-500 ml-auto shrink-0" />}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Evidence Type</label>
                    <div className="grid grid-cols-2 gap-2">
                      {EVIDENCE_TYPES.map(et => (
                        <button
                          key={et.value}
                          onClick={() => setEvidenceType(et.value)}
                          className={cn(
                            'flex items-center gap-2 p-3 rounded-xl border-2 text-left transition-colors',
                            evidenceType === et.value
                              ? 'border-amber-500 bg-amber-50'
                              : 'border-border hover:border-amber-300'
                          )}
                        >
                          <span className="text-muted-foreground">{et.icon}</span>
                          <span className="text-xs font-medium text-foreground leading-tight">{et.label}</span>
                          {evidenceType === et.value && <CheckCircle className="h-3.5 w-3.5 text-amber-500 ml-auto shrink-0" />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Storage target (evidence mode) */}
                {mode === 'evidence' && evidenceType && (
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Store In</label>
                    <div className="grid grid-cols-2 gap-2">
                      {STORAGE_TARGETS.map(st => (
                        <button
                          key={st.value}
                          onClick={() => setStorageTarget(st.value)}
                          className={cn(
                            'p-3 rounded-xl border-2 text-xs font-medium text-left transition-colors',
                            storageTarget === st.value
                              ? 'border-amber-500 bg-amber-50 text-foreground'
                              : 'border-border hover:border-amber-300 text-muted-foreground'
                          )}
                        >
                          {st.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={() => setStep('capture')}
                disabled={!contextValid}
                className="mt-8 w-full py-4 rounded-2xl bg-foreground text-background font-bold text-base hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2"
              >
                <Camera className="h-5 w-5" />
                Start Capturing
              </button>
            </div>
          )}

          {/* ── STEP: Capture ── */}
          {step === 'capture' && (
            <div>
              <button onClick={() => setStep('context')} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-5">
                <ChevronLeft className="h-4 w-4" /> Back
              </button>

              <div className="flex items-center gap-2 mb-1">
                <Plane className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-semibold text-foreground">{selectedAircraft?.tail_number ?? '—'}</span>
                <span className="text-xs text-muted-foreground">—</span>
                <span className="text-xs text-muted-foreground">
                  {mode === 'batch'
                    ? BATCH_CLASSES.find(b => b.value === batchClass)?.label
                    : EVIDENCE_TYPES.find(e => e.value === evidenceType)?.label}
                </span>
              </div>
              <h2 className="text-xl font-bold text-foreground mb-6">Capture Pages</h2>

              {/* Capture buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                <button
                  onClick={openCamera}
                  className="flex items-center justify-center gap-3 p-6 rounded-2xl border-2 border-dashed border-brand-300 hover:border-brand-500 hover:bg-brand-50 transition-all text-brand-600"
                >
                  <Camera className="h-7 w-7" />
                  <span className="font-bold text-base">Use Camera</span>
                </button>
                <button
                  onClick={openFileSelect}
                  className="flex items-center justify-center gap-3 p-6 rounded-2xl border-2 border-dashed border-border hover:border-brand-400 hover:bg-accent transition-all text-muted-foreground hover:text-foreground"
                >
                  <Upload className="h-7 w-7" />
                  <span className="font-bold text-base">Upload Files</span>
                </button>
              </div>

              {/* Quality tips */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
                <p className="text-xs font-semibold text-amber-800 mb-2">Capture Tips</p>
                <ul className="text-xs text-amber-700 space-y-1">
                  <li>• Lay pages flat — avoid shadows and glare</li>
                  <li>• Keep all edges visible in frame</li>
                  <li>• Hold still for sharp focus</li>
                  <li>• Retake blurry or cut-off pages before submitting</li>
                  <li>• For logbooks: capture one page at a time for best results</li>
                </ul>
              </div>

              {/* Page thumbnails */}
              {pages.length > 0 && (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-semibold text-foreground">{pages.length} page{pages.length !== 1 ? 's' : ''} captured</p>
                    <button onClick={() => setStep('review')} className="text-xs text-brand-600 font-semibold hover:underline flex items-center gap-1">
                      Review <ChevronRight className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                    {pages.slice(-8).map((page, i) => (
                      <div key={page.id} className="relative">
                        <img
                          src={page.dataUrl}
                          alt={`Page ${i + 1}`}
                          className={cn('w-full aspect-[3/4] object-cover rounded-lg border-2 cursor-pointer',
                            page.unreadable ? 'border-red-400 opacity-50' : 'border-border')}
                          onClick={() => setPreviewPage(page)}
                        />
                      </div>
                    ))}
                    {pages.length > 8 && (
                      <div className="w-full aspect-[3/4] rounded-lg bg-muted flex items-center justify-center text-xs text-muted-foreground font-bold">
                        +{pages.length - 8}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {pages.length > 0 && (
                <button
                  onClick={() => setStep('review')}
                  className="w-full py-4 rounded-2xl bg-foreground text-background font-bold text-base hover:opacity-90 flex items-center justify-center gap-2"
                >
                  Review {pages.length} Page{pages.length !== 1 ? 's' : ''} <ChevronRight className="h-5 w-5" />
                </button>
              )}
            </div>
          )}

          {/* ── STEP: Review ── */}
          {step === 'review' && (
            <div>
              <button onClick={() => setStep('capture')} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-5">
                <ChevronLeft className="h-4 w-4" /> Back to Capture
              </button>
              <h2 className="text-xl font-bold text-foreground mb-1">Review Pages</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Remove bad pages, reorder, or mark unreadable. Then continue to finish.
              </p>

              <div className="space-y-2 mb-6">
                {pages.map((page, i) => (
                  <div key={page.id} className={cn(
                    'flex items-center gap-3 p-3 rounded-xl border-2 bg-card',
                    page.unreadable ? 'border-red-300 bg-red-50/50' : 'border-border'
                  )}>
                    {/* Thumbnail */}
                    <img
                      src={page.dataUrl}
                      alt={`Page ${i + 1}`}
                      className="w-12 h-16 object-cover rounded-lg border border-border cursor-pointer shrink-0"
                      onClick={() => setPreviewPage(page)}
                    />

                    {/* Page number + flags */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground">Page {i + 1}</p>
                      <p className="text-xs text-muted-foreground truncate">{page.file.name}</p>
                      {page.unreadable && (
                        <span className="text-xs text-red-600 font-medium">Marked unreadable</span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      {/* Reorder */}
                      <button
                        onClick={() => movePage(page.id, 'up')}
                        disabled={i === 0}
                        className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-30"
                      >
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      </button>
                      <button
                        onClick={() => movePage(page.id, 'down')}
                        disabled={i === pages.length - 1}
                        className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-30"
                      >
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      </button>

                      {/* Preview */}
                      <button
                        onClick={() => setPreviewPage(page)}
                        className="p-1.5 rounded-lg hover:bg-muted"
                      >
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      </button>

                      {/* Mark unreadable */}
                      <button
                        onClick={() => toggleUnreadable(page.id)}
                        className={cn('p-1.5 rounded-lg hover:bg-muted', page.unreadable && 'text-red-500')}
                        title="Mark unreadable"
                      >
                        <AlertTriangle className="h-4 w-4" />
                      </button>

                      {/* Delete */}
                      <button
                        onClick={() => deletePage(page.id)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-red-500"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep('capture')}
                  className="flex items-center gap-2 px-4 py-3 border border-border rounded-xl text-sm font-semibold hover:bg-muted"
                >
                  <Plus className="h-4 w-4" /> Add More
                </button>
                <button
                  onClick={() => setStep('finish')}
                  disabled={pages.length === 0}
                  className="flex-1 py-3 rounded-xl bg-foreground text-background font-bold text-sm hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  Continue <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* ── STEP: Finish ── */}
          {step === 'finish' && (
            <div>
              <button onClick={() => setStep('review')} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-5">
                <ChevronLeft className="h-4 w-4" /> Back
              </button>
              <h2 className="text-xl font-bold text-foreground mb-1">Finish & Submit</h2>
              <p className="text-sm text-muted-foreground mb-6">Review the batch details, then submit for processing.</p>

              {/* Summary */}
              <div className="bg-muted/40 rounded-xl border border-border p-4 mb-5 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Aircraft</span>
                  <span className="font-semibold">{selectedAircraft?.tail_number ?? '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Type</span>
                  <span className="font-semibold">
                    {mode === 'batch'
                      ? BATCH_CLASSES.find(b => b.value === batchClass)?.label
                      : EVIDENCE_TYPES.find(e => e.value === evidenceType)?.label}
                  </span>
                </div>
                {mode === 'evidence' && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Store In</span>
                    <span className="font-semibold">{STORAGE_TARGETS.find(s => s.value === storageTarget)?.label}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pages</span>
                  <span className="font-semibold">{pages.length}</span>
                </div>
                {pages.filter(p => p.unreadable).length > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>Unreadable</span>
                    <span className="font-semibold">{pages.filter(p => p.unreadable).length} page{pages.filter(p => p.unreadable).length !== 1 ? 's' : ''}</span>
                  </div>
                )}
              </div>

              {/* Batch title */}
              <div className="mb-5">
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Batch Title (optional)</label>
                <input
                  type="text"
                  value={batchTitle}
                  onChange={e => setBatchTitle(e.target.value)}
                  placeholder={defaultTitle()}
                  className="w-full px-4 py-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
                />
              </div>

              {/* Next action (evidence mode only) */}
              {mode === 'evidence' && (
                <div className="mb-6">
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">What would you like to do next?</label>
                  <div className="space-y-2">
                    {NEXT_ACTIONS.map(na => (
                      <button
                        key={na.value}
                        onClick={() => setSelectedNextAction(na.value === selectedNextAction ? null : na.value)}
                        className={cn(
                          'w-full flex items-start gap-3 p-3 rounded-xl border-2 text-left transition-colors',
                          selectedNextAction === na.value
                            ? 'border-brand-500 bg-brand-50'
                            : 'border-border hover:border-brand-300'
                        )}
                      >
                        <ArrowRight className={cn('h-4 w-4 mt-0.5 shrink-0', selectedNextAction === na.value ? 'text-brand-500' : 'text-muted-foreground')} />
                        <div>
                          <p className="text-sm font-semibold text-foreground">{na.label}</p>
                          <p className="text-xs text-muted-foreground">{na.description}</p>
                        </div>
                        {selectedNextAction === na.value && <CheckCircle className="h-4 w-4 text-brand-500 ml-auto shrink-0 mt-0.5" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={handleSubmit}
                className="w-full py-4 rounded-2xl bg-foreground text-background font-bold text-base hover:opacity-90 flex items-center justify-center gap-2"
              >
                <Upload className="h-5 w-5" />
                Submit {pages.length} Page{pages.length !== 1 ? 's' : ''}
              </button>
            </div>
          )}

          {/* ── STEP: Status ── */}
          {(submitStatus === 'uploading' || submitStatus === 'done' || submitStatus === 'error') && (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
              {submitStatus === 'uploading' && (
                <>
                  <Loader2 className="h-12 w-12 animate-spin text-brand-500 mb-4" />
                  <h2 className="text-xl font-bold text-foreground mb-2">Uploading...</h2>
                  <p className="text-sm text-muted-foreground mb-6">Sending {pages.length} pages to secure storage</p>
                  <div className="w-full max-w-xs bg-muted rounded-full h-2 overflow-hidden">
                    <div
                      className="h-2 bg-brand-500 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">{uploadProgress}%</p>
                </>
              )}

              {submitStatus === 'done' && (
                <>
                  <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-4">
                    <CheckCircle className="h-10 w-10 text-green-600" />
                  </div>
                  <h2 className="text-xl font-bold text-foreground mb-2">Submitted!</h2>
                  <p className="text-sm text-muted-foreground mb-2">
                    {pages.length} page{pages.length !== 1 ? 's' : ''} uploaded and queued for processing.
                  </p>
                  {batchId && (
                    <p className="text-xs text-muted-foreground font-mono mb-8">Batch ID: {batchId.slice(0, 8)}...</p>
                  )}
                  {selectedNextAction && selectedNextAction !== 'informational_only' && (
                    <div className="mb-8 bg-brand-50 border border-brand-200 rounded-xl p-4 text-left w-full max-w-sm">
                      <p className="text-xs font-semibold text-brand-700 mb-1">Next step queued</p>
                      <p className="text-sm text-brand-800">{NEXT_ACTIONS.find(n => n.value === selectedNextAction)?.label}</p>
                      <p className="text-xs text-brand-600 mt-1">A reviewer will be notified to complete this action.</p>
                    </div>
                  )}
                  <div className="flex flex-col gap-3 w-full max-w-xs">
                    <button
                      onClick={resetAll}
                      className="w-full py-4 rounded-2xl bg-foreground text-background font-bold hover:opacity-90 flex items-center justify-center gap-2"
                    >
                      <ScanLine className="h-5 w-5" /> Scan Again
                    </button>
                    <button
                      onClick={handleSignOut}
                      className="w-full py-3 rounded-2xl border border-border text-foreground font-semibold hover:bg-muted flex items-center justify-center gap-2"
                    >
                      <LogOut className="h-4 w-4" /> Sign Out
                    </button>
                  </div>
                </>
              )}

              {submitStatus === 'error' && (
                <>
                  <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center mb-4">
                    <AlertTriangle className="h-10 w-10 text-red-500" />
                  </div>
                  <h2 className="text-xl font-bold text-foreground mb-2">Upload Failed</h2>
                  <p className="text-sm text-red-600 mb-8">{submitError}</p>
                  <button
                    onClick={handleSubmit}
                    className="w-full max-w-xs py-4 rounded-2xl bg-foreground text-background font-bold hover:opacity-90 flex items-center justify-center gap-2 mb-3"
                  >
                    <RotateCcw className="h-5 w-5" /> Retry Upload
                  </button>
                  <button
                    onClick={() => setStep('finish')}
                    className="text-sm text-muted-foreground hover:text-foreground underline"
                  >
                    Go back
                  </button>
                </>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
