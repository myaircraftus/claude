'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  Sparkles,
  Wrench,
  Plane,
  RefreshCw,
  Edit3,
  Check,
  Copy,
  AlertTriangle,
  Info,
  ChevronDown,
  Loader2,
  FileText,
  Calendar,
  Gauge,
  Clock,
  User,
  Hash,
  CheckSquare,
  Save,
  ArrowLeft,
} from 'lucide-react'
import type { Aircraft } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface StructuredFields {
  date?: string | null
  entry_type?: string
  logbook_type?: string
  tach_reference?: string | null
  airframe_tt?: string | null
  parts_referenced?: string[]
  ad_references?: string[]
  sb_references?: string[]
  requires_337?: boolean
  '337_reason'?: string | null
  next_due_interval?: string | null
  suggested_logbooks?: string[]
}

interface GenerateResult {
  formatted_entry: string
  structured_fields: StructuredFields
  warnings?: string[]
  notes?: string
  draft_id?: string
}

type Mode = 'ai' | 'manual'

const ENTRY_TYPES = [
  { value: '100hr', label: '100-Hour Inspection' },
  { value: 'annual', label: 'Annual Inspection' },
  { value: 'oil_change', label: 'Oil Change' },
  { value: 'repair', label: 'Repair' },
  { value: 'overhaul', label: 'Overhaul' },
  { value: 'ad_compliance', label: 'AD Compliance' },
  { value: 'maintenance', label: 'Routine Maintenance' },
  { value: 'custom', label: 'Custom' },
]

const LOGBOOK_TYPES = [
  { value: 'airframe', label: 'Airframe' },
  { value: 'engine', label: 'Engine' },
  { value: 'prop', label: 'Propeller' },
  { value: 'avionics', label: 'Avionics' },
]

const EXAMPLE_PROMPTS = [
  '100-hour inspection completed per manufacturer maintenance manual. All systems checked and found airworthy.',
  'Oil change completed. Drained and replaced 6 quarts Aeroshell 100W plus. New Champion CH48110-1 filter installed.',
  'Annual inspection completed per FAR 43 Appendix D. Aircraft found to be airworthy and approved for return to service.',
  'Replaced left main gear tire. New Michelin Air 6.00-6 tire installed, torqued per maintenance manual.',
  'AD 2023-14-03 compliance. Inspected fuel cap per instructions, found satisfactory, no further action required.',
]

// ─── Sub-components ───────────────────────────────────────────────────────────

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
      {children}
      {required && <span className="text-destructive ml-0.5">*</span>}
    </label>
  )
}

function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
  required,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  placeholder?: string
  required?: boolean
}) {
  return (
    <div>
      <FieldLabel required={required}>{label}</FieldLabel>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
            'ring-offset-background appearance-none pr-8',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            'disabled:cursor-not-allowed disabled:opacity-50',
            !value && 'text-muted-foreground'
          )}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  aircraftList: Aircraft[]
}

export function MaintenanceEntryClient({ aircraftList }: Props) {
  const router = useRouter()

  // Mode
  const [mode, setMode] = useState<Mode>('ai')

  // AI form state
  const [prompt, setPrompt] = useState('')
  const [aircraftId, setAircraftId] = useState(aircraftList[0]?.id ?? '')
  const [entryType, setEntryType] = useState('')
  const [logbookType, setLogbookType] = useState('')

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [result, setResult] = useState<GenerateResult | null>(null)

  // Post-generation editable fields
  const [editDate, setEditDate] = useState('')
  const [editTach, setEditTach] = useState('')
  const [editAirframeTT, setEditAirframeTT] = useState('')
  const [editMechanic, setEditMechanic] = useState('')
  const [editCertNumber, setEditCertNumber] = useState('')
  const [editReturnToService, setEditReturnToService] = useState(false)
  const [editText, setEditText] = useState('')
  const [isEditingText, setIsEditingText] = useState(false)
  const [copied, setCopied] = useState(false)

  // Manual mode state
  const [manualDate, setManualDate] = useState(new Date().toISOString().split('T')[0])
  const [manualEntryType, setManualEntryType] = useState('')
  const [manualLogbookType, setManualLogbookType] = useState('')
  const [manualAircraftId, setManualAircraftId] = useState(aircraftList[0]?.id ?? '')
  const [manualText, setManualText] = useState('')
  const [manualTach, setManualTach] = useState('')
  const [manualAirframeTT, setManualAirframeTT] = useState('')
  const [manualMechanic, setManualMechanic] = useState('')
  const [manualCertNumber, setManualCertNumber] = useState('')
  const [manualReturnToService, setManualReturnToService] = useState(false)

  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const promptRef = useRef<HTMLTextAreaElement>(null)

  // ─── Handlers ───────────────────────────────────────────────────────────────

  async function handleGenerate() {
    if (!prompt.trim()) {
      promptRef.current?.focus()
      return
    }
    setIsGenerating(true)
    setGenerateError(null)
    setResult(null)

    try {
      const res = await fetch('/api/maintenance/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          aircraft_id: aircraftId || undefined,
          entry_type: entryType || undefined,
          logbook_type: logbookType || undefined,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Generation failed')

      setResult(data)
      setEditText(data.formatted_entry ?? '')
      setEditDate(data.structured_fields?.date ?? new Date().toISOString().split('T')[0])
      setEditTach(data.structured_fields?.tach_reference ?? '')
      setEditAirframeTT(data.structured_fields?.airframe_tt ?? '')
      setEditReturnToService(false)
      setEditMechanic('')
      setEditCertNumber('')
      setIsEditingText(false)
    } catch (err: unknown) {
      setGenerateError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setIsGenerating(false)
    }
  }

  async function handleSaveDraft(override?: { text: string; fields: Record<string, unknown> }) {
    setIsSaving(true)
    setSaveError(null)

    const draftId = result?.draft_id
    const text = override?.text ?? editText
    const structured = override?.fields ?? {
      ...(result?.structured_fields ?? {}),
      date: editDate,
      tach_reference: editTach || null,
      airframe_tt: editAirframeTT || null,
      mechanic_name: editMechanic || null,
      cert_number: editCertNumber || null,
      return_to_service: editReturnToService,
    }

    try {
      if (draftId) {
        const res = await fetch('/api/maintenance/drafts', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: draftId,
            edited_text: text,
            structured_fields: structured,
            status: 'draft',
          }),
        })
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error ?? 'Save failed')
        }
      }
      router.push('/maintenance')
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleSaveManual() {
    setIsSaving(true)
    setSaveError(null)

    try {
      const res = await fetch('/api/maintenance/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: manualText,
          aircraft_id: manualAircraftId || undefined,
          entry_type: manualEntryType || undefined,
          logbook_type: manualLogbookType || undefined,
        }),
      })
      // Even if generate fails, save the draft via the drafts PATCH
      const data = await res.json()
      if (data.draft_id) {
        await fetch('/api/maintenance/drafts', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: data.draft_id,
            edited_text: manualText,
            structured_fields: {
              date: manualDate,
              tach_reference: manualTach || null,
              airframe_tt: manualAirframeTT || null,
              mechanic_name: manualMechanic || null,
              cert_number: manualCertNumber || null,
              return_to_service: manualReturnToService,
            },
            status: 'draft',
          }),
        })
      }
      router.push('/maintenance')
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setIsSaving(false)
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(editText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleUseExample(ex: string) {
    setPrompt(ex)
    promptRef.current?.focus()
  }

  function handleSwitchToManual() {
    setMode('manual')
    if (result) {
      setManualText(editText)
      setManualDate(editDate)
      setManualTach(editTach)
      setManualAirframeTT(editAirframeTT)
      setManualMechanic(editMechanic)
      setManualCertNumber(editCertNumber)
      setManualReturnToService(editReturnToService)
      if (aircraftId) setManualAircraftId(aircraftId)
      if (entryType) setManualEntryType(entryType)
      if (logbookType) setManualLogbookType(logbookType)
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <main className="flex-1 overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Mode toggle */}
        <div className="flex items-center gap-1 p-1 bg-muted rounded-lg w-fit">
          <button
            onClick={() => setMode('ai')}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all',
              mode === 'ai'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Sparkles className="h-4 w-4" />
            AI Assist
          </button>
          <button
            onClick={() => setMode('manual')}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all',
              mode === 'manual'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Edit3 className="h-4 w-4" />
            Manual
          </button>
        </div>

        {/* ── AI MODE ─────────────────────────────────────────────────────────── */}
        {mode === 'ai' && (
          <div className="space-y-6">

            {/* Input card */}
            {!result && (
              <Card>
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Sparkles className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base">AI Entry Generator</CardTitle>
                      <CardDescription className="text-xs mt-0.5">
                        Describe the work in plain English — AI will format a FAA-compliant logbook entry.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-5">
                  {/* Prompt */}
                  <div>
                    <FieldLabel required>Describe what was done</FieldLabel>
                    <Textarea
                      ref={promptRef}
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="e.g. Performed 100-hour inspection per manufacturer's maintenance manual. Replaced left magneto points. Checked timing, set to 25° BTDC. All systems checked and found airworthy."
                      className="min-h-[140px] text-sm leading-relaxed font-mono resize-none"
                    />
                    <p className="text-xs text-muted-foreground mt-2">
                      Include any tach/hobbs time, part numbers, AD references, or mechanic details you know.
                    </p>
                  </div>

                  {/* Example prompts */}
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-2">
                      Quick examples — click to use:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {EXAMPLE_PROMPTS.map((ex, i) => (
                        <button
                          key={i}
                          onClick={() => handleUseExample(ex)}
                          className="text-xs px-2.5 py-1 rounded border border-border bg-background hover:bg-muted transition-colors text-muted-foreground hover:text-foreground text-left max-w-[280px] truncate"
                          title={ex}
                        >
                          {ex.slice(0, 55)}{ex.length > 55 ? '...' : ''}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Config row */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {aircraftList.length > 0 && (
                      <SelectField
                        label="Aircraft"
                        value={aircraftId}
                        onChange={setAircraftId}
                        options={aircraftList.map((ac) => ({
                          value: ac.id,
                          label: `${ac.tail_number} — ${ac.make} ${ac.model}`,
                        }))}
                        placeholder="Select aircraft"
                      />
                    )}
                    <SelectField
                      label="Entry Type"
                      value={entryType}
                      onChange={setEntryType}
                      options={ENTRY_TYPES}
                      placeholder="Select type"
                    />
                    <SelectField
                      label="Logbook"
                      value={logbookType}
                      onChange={setLogbookType}
                      options={LOGBOOK_TYPES}
                      placeholder="Select logbook"
                    />
                  </div>

                  {generateError && (
                    <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
                      <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                      <span>{generateError}</span>
                    </div>
                  )}

                  <Button
                    onClick={handleGenerate}
                    disabled={isGenerating || !prompt.trim()}
                    size="lg"
                    className="w-full"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Generating entry...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" />
                        Generate Entry
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* ── Generated result ─────────────────────────────────────────── */}
            {result && (
              <div className="space-y-4">

                {/* Controls */}
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-foreground flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-600" />
                    Entry Generated
                  </h2>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setResult(null)
                        setGenerateError(null)
                      }}
                    >
                      <RefreshCw className="h-4 w-4" />
                      Regenerate
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSwitchToManual}
                    >
                      <Edit3 className="h-4 w-4" />
                      Edit Manually
                    </Button>
                  </div>
                </div>

                {/* Warnings */}
                {result.warnings && result.warnings.length > 0 && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-3 space-y-1">
                    <p className="text-xs font-semibold text-amber-800 dark:text-amber-400 flex items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Warnings
                    </p>
                    {result.warnings.map((w, i) => (
                      <p key={i} className="text-xs text-amber-700 dark:text-amber-300">{w}</p>
                    ))}
                  </div>
                )}

                {/* Form 337 alert */}
                {result.structured_fields?.requires_337 && (
                  <div className="rounded-md border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30 p-3">
                    <p className="text-xs font-semibold text-red-700 dark:text-red-400 flex items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      FAA Form 337 Required
                    </p>
                    {result.structured_fields['337_reason'] && (
                      <p className="text-xs text-red-600 dark:text-red-300 mt-1">
                        {result.structured_fields['337_reason']}
                      </p>
                    )}
                  </div>
                )}

                {/* Notes */}
                {result.notes && (
                  <div className="rounded-md border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 p-3">
                    <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 flex items-center gap-1.5">
                      <Info className="h-3.5 w-3.5" />
                      Mechanic Notes
                    </p>
                    <p className="text-xs text-blue-600 dark:text-blue-300 mt-1">{result.notes}</p>
                  </div>
                )}

                {/* Formatted entry preview */}
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        Formatted Logbook Entry
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        {result.structured_fields?.suggested_logbooks && result.structured_fields.suggested_logbooks.length > 0 && (
                          <div className="flex gap-1">
                            {result.structured_fields.suggested_logbooks.map((lb) => (
                              <Badge key={lb} variant="secondary" className="text-xs capitalize">
                                {lb}
                              </Badge>
                            ))}
                          </div>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => setIsEditingText(!isEditingText)}
                        >
                          <Edit3 className="h-3 w-3 mr-1" />
                          {isEditingText ? 'Preview' : 'Edit text'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={handleCopy}
                        >
                          {copied ? (
                            <><Check className="h-3 w-3 mr-1 text-emerald-600" />Copied</>
                          ) : (
                            <><Copy className="h-3 w-3 mr-1" />Copy</>
                          )}
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {isEditingText ? (
                      <Textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        className="min-h-[200px] text-sm font-mono leading-relaxed resize-none"
                      />
                    ) : (
                      <div className="rounded-md bg-muted/50 border border-border p-4">
                        <pre className="text-sm font-mono whitespace-pre-wrap leading-relaxed text-foreground">
                          {editText}
                        </pre>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Structured fields */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Wrench className="h-4 w-4 text-muted-foreground" />
                      Entry Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                      {/* Date */}
                      <div>
                        <FieldLabel>
                          <span className="flex items-center gap-1.5">
                            <Calendar className="h-3 w-3" />Date
                          </span>
                        </FieldLabel>
                        <Input
                          type="date"
                          value={editDate}
                          onChange={(e) => setEditDate(e.target.value)}
                        />
                      </div>

                      {/* Tach/Hobbs */}
                      <div>
                        <FieldLabel>
                          <span className="flex items-center gap-1.5">
                            <Gauge className="h-3 w-3" />Tach / Hobbs Time
                          </span>
                        </FieldLabel>
                        <Input
                          value={editTach}
                          onChange={(e) => setEditTach(e.target.value)}
                          placeholder="e.g. 1842.3"
                        />
                      </div>

                      {/* Airframe TT */}
                      <div>
                        <FieldLabel>
                          <span className="flex items-center gap-1.5">
                            <Clock className="h-3 w-3" />Airframe Total Time
                          </span>
                        </FieldLabel>
                        <Input
                          value={editAirframeTT}
                          onChange={(e) => setEditAirframeTT(e.target.value)}
                          placeholder="e.g. 4217.0"
                        />
                      </div>

                      {/* Mechanic */}
                      <div>
                        <FieldLabel>
                          <span className="flex items-center gap-1.5">
                            <User className="h-3 w-3" />Mechanic Name
                          </span>
                        </FieldLabel>
                        <Input
                          value={editMechanic}
                          onChange={(e) => setEditMechanic(e.target.value)}
                          placeholder="Full name"
                        />
                      </div>

                      {/* Cert number */}
                      <div>
                        <FieldLabel>
                          <span className="flex items-center gap-1.5">
                            <Hash className="h-3 w-3" />Certificate Number
                          </span>
                        </FieldLabel>
                        <Input
                          value={editCertNumber}
                          onChange={(e) => setEditCertNumber(e.target.value)}
                          placeholder="A&P / IA cert number"
                        />
                      </div>

                      {/* Return to service */}
                      <div className="flex items-center gap-3 pt-5">
                        <button
                          onClick={() => setEditReturnToService(!editReturnToService)}
                          className={cn(
                            'flex items-center gap-2 text-sm transition-colors',
                            editReturnToService ? 'text-emerald-700' : 'text-muted-foreground'
                          )}
                        >
                          <CheckSquare
                            className={cn(
                              'h-5 w-5',
                              editReturnToService ? 'text-emerald-600' : 'text-muted-foreground'
                            )}
                          />
                          Approved for Return to Service
                        </button>
                      </div>
                    </div>

                    {/* Extracted refs */}
                    {(
                      (result.structured_fields?.ad_references?.length ?? 0) > 0 ||
                      (result.structured_fields?.sb_references?.length ?? 0) > 0 ||
                      (result.structured_fields?.parts_referenced?.length ?? 0) > 0
                    ) && (
                      <div className="mt-4 pt-4 border-t border-border space-y-2">
                        {(result.structured_fields?.ad_references?.length ?? 0) > 0 && (
                          <div className="flex flex-wrap gap-1.5 items-center">
                            <span className="text-xs text-muted-foreground">ADs:</span>
                            {result.structured_fields!.ad_references!.map((ad) => (
                              <Badge key={ad} variant="warning" className="text-xs font-mono">{ad}</Badge>
                            ))}
                          </div>
                        )}
                        {(result.structured_fields?.sb_references?.length ?? 0) > 0 && (
                          <div className="flex flex-wrap gap-1.5 items-center">
                            <span className="text-xs text-muted-foreground">SBs:</span>
                            {result.structured_fields!.sb_references!.map((sb) => (
                              <Badge key={sb} variant="info" className="text-xs font-mono">{sb}</Badge>
                            ))}
                          </div>
                        )}
                        {(result.structured_fields?.parts_referenced?.length ?? 0) > 0 && (
                          <div className="flex flex-wrap gap-1.5 items-center">
                            <span className="text-xs text-muted-foreground">Parts:</span>
                            {result.structured_fields!.parts_referenced!.map((p) => (
                              <Badge key={p} variant="secondary" className="text-xs font-mono">{p}</Badge>
                            ))}
                          </div>
                        )}
                        {result.structured_fields?.next_due_interval && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-muted-foreground">Next due:</span>
                            <Badge variant="outline" className="text-xs">
                              {result.structured_fields.next_due_interval}
                            </Badge>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Save / error */}
                {saveError && (
                  <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
                    <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <span>{saveError}</span>
                  </div>
                )}

                <div className="flex items-center gap-3 justify-end pt-2">
                  <Button
                    variant="outline"
                    onClick={() => router.push('/maintenance')}
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Cancel
                  </Button>
                  <Button
                    onClick={() => handleSaveDraft()}
                    disabled={isSaving}
                    size="lg"
                  >
                    {isSaving ? (
                      <><Loader2 className="h-4 w-4 animate-spin" />Saving...</>
                    ) : (
                      <><Save className="h-4 w-4" />Save Entry Draft</>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── MANUAL MODE ───────────────────────────────────────────────────── */}
        {mode === 'manual' && (
          <div className="space-y-5">
            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-muted">
                    <Wrench className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Manual Entry</CardTitle>
                    <CardDescription className="text-xs mt-0.5">
                      Enter all fields manually for full control over the logbook entry.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-5">
                {/* Config row */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {aircraftList.length > 0 && (
                    <SelectField
                      label="Aircraft"
                      value={manualAircraftId}
                      onChange={setManualAircraftId}
                      options={aircraftList.map((ac) => ({
                        value: ac.id,
                        label: `${ac.tail_number} — ${ac.make} ${ac.model}`,
                      }))}
                      placeholder="Select aircraft"
                    />
                  )}
                  <SelectField
                    label="Entry Type"
                    value={manualEntryType}
                    onChange={setManualEntryType}
                    options={ENTRY_TYPES}
                    placeholder="Select type"
                  />
                  <SelectField
                    label="Logbook"
                    value={manualLogbookType}
                    onChange={setManualLogbookType}
                    options={LOGBOOK_TYPES}
                    placeholder="Select logbook"
                  />
                </div>

                {/* Time fields */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <FieldLabel required>
                      <span className="flex items-center gap-1.5"><Calendar className="h-3 w-3" />Date</span>
                    </FieldLabel>
                    <Input
                      type="date"
                      value={manualDate}
                      onChange={(e) => setManualDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <FieldLabel>
                      <span className="flex items-center gap-1.5"><Gauge className="h-3 w-3" />Tach / Hobbs</span>
                    </FieldLabel>
                    <Input
                      value={manualTach}
                      onChange={(e) => setManualTach(e.target.value)}
                      placeholder="e.g. 1842.3"
                    />
                  </div>
                  <div>
                    <FieldLabel>
                      <span className="flex items-center gap-1.5"><Clock className="h-3 w-3" />Airframe TT</span>
                    </FieldLabel>
                    <Input
                      value={manualAirframeTT}
                      onChange={(e) => setManualAirframeTT(e.target.value)}
                      placeholder="e.g. 4217.0"
                    />
                  </div>
                </div>

                {/* Entry text */}
                <div>
                  <FieldLabel required>Entry Text</FieldLabel>
                  <Textarea
                    value={manualText}
                    onChange={(e) => setManualText(e.target.value)}
                    placeholder="Enter the complete maintenance logbook entry text. Include all work performed, parts replaced, references to maintenance manual, AD/SB references, and any applicable approval for return to service."
                    className="min-h-[220px] text-sm font-mono leading-relaxed resize-none"
                  />
                </div>

                {/* Mechanic fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <FieldLabel>
                      <span className="flex items-center gap-1.5"><User className="h-3 w-3" />Mechanic Name</span>
                    </FieldLabel>
                    <Input
                      value={manualMechanic}
                      onChange={(e) => setManualMechanic(e.target.value)}
                      placeholder="Full name"
                    />
                  </div>
                  <div>
                    <FieldLabel>
                      <span className="flex items-center gap-1.5"><Hash className="h-3 w-3" />Certificate Number</span>
                    </FieldLabel>
                    <Input
                      value={manualCertNumber}
                      onChange={(e) => setManualCertNumber(e.target.value)}
                      placeholder="A&P / IA cert number"
                    />
                  </div>
                </div>

                {/* Return to service */}
                <button
                  onClick={() => setManualReturnToService(!manualReturnToService)}
                  className={cn(
                    'flex items-center gap-2 text-sm transition-colors',
                    manualReturnToService ? 'text-emerald-700' : 'text-muted-foreground'
                  )}
                >
                  <CheckSquare
                    className={cn(
                      'h-5 w-5',
                      manualReturnToService ? 'text-emerald-600' : 'text-muted-foreground'
                    )}
                  />
                  Approved for Return to Service
                </button>

                {saveError && (
                  <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
                    <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <span>{saveError}</span>
                  </div>
                )}

                <div className="flex items-center gap-3 justify-end pt-1">
                  <Button
                    variant="outline"
                    onClick={() => router.push('/maintenance')}
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSaveManual}
                    disabled={isSaving || !manualText.trim()}
                    size="lg"
                  >
                    {isSaving ? (
                      <><Loader2 className="h-4 w-4 animate-spin" />Saving...</>
                    ) : (
                      <><Save className="h-4 w-4" />Save Entry Draft</>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Compliance reminder */}
            <div className="rounded-md border border-border bg-muted/40 px-4 py-3 flex items-start gap-3">
              <Info className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                <span className="font-medium text-foreground">Compliance reminder:</span>{' '}
                Maintenance entries must meet FAR Part 43 Appendix B requirements. The person approving for return to service must sign and include their certificate number and type. Major repairs and alterations require FAA Form 337.
              </p>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
