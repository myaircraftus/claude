'use client'

/**
 * Phase 13.2 — persona-strict upload modal.
 *
 * Drop-in lightweight uploader keyed off the new `document_type` taxonomy
 * (mig 103 / lib/documents/persona-taxonomy.ts). Sits alongside the legacy
 * `upload-dropzone.tsx` (which uses the 4-level scanner taxonomy) so we can
 * surface a streamlined per-persona entry point on /aircraft/[id],
 * /my-aircraft, /documents, and /admin without rewriting the legacy 2200-line
 * dropzone.
 *
 * Render rules:
 *   - Only categories that contain ≥1 type the current persona can upload
 *     are rendered (via getAllowedCategories)
 *   - Only types within those categories that the persona can upload are
 *     rendered (via canPersonaUpload)
 *   - When the user selects a type with requiresAircraftId, the aircraft
 *     selector appears and the form refuses to submit without an aircraftId
 *
 * Server contract:
 *   - Calls /api/upload/init for the pre-signed URL + documentId
 *   - PUT-uploads the file to Supabase storage
 *   - Calls /api/upload/complete with the new fields:
 *       documentType: <DocumentType>
 *       uploadedByPersona: <Persona>
 *       aircraftId: <uuid | null>
 *
 * The route validates persona × type via canPersonaUpload server-side and
 * returns 403 PERSONA_TYPE_BLOCKED_V2 if the client tries to bypass.
 */
import { useMemo, useState } from 'react'
import type { Persona } from '@/types'
import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_TYPE_META,
  canPersonaUpload,
  getAllowedCategories,
  getCategoryTypes,
  requiresAircraftId,
  type DocumentCategory,
  type DocumentType,
} from '@/lib/documents/persona-taxonomy'
import { SlaBanner } from '@/components/billing/SlaBanner'
import type { TierSlug } from '@/lib/billing/pricing-config'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export interface AircraftOption {
  id: string
  display: string
}

export interface PersonaAwareUploadModalProps {
  /** Active persona. Drives which categories/types render. */
  persona: Persona
  /** User's aircraft for the aircraft selector (only owners/admins/shops fill this). */
  aircraftOptions: AircraftOption[]
  /** Pre-selected aircraft (e.g. when launched from /aircraft/[id]). Locks the selector. */
  defaultAircraftId?: string
  /** Pre-selected category, e.g. 'Aircraft Records' on the per-aircraft page. */
  defaultCategory?: DocumentCategory
  /** When mounted as a controlled dialog, parent owns open state. */
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Callback after successful upload — usually refreshes the parent list. */
  onUploaded?: (documentId: string, documentType: DocumentType) => void
  /** Org id is needed by the server contract. */
  organizationId: string
  /** Phase 14: effective tier for the SLA banner. Optional — defaults to beta. */
  effectiveTier?: TierSlug
}

interface UploadStatus {
  state: 'idle' | 'uploading' | 'success' | 'error'
  error?: string
  documentId?: string
}

export function PersonaAwareUploadModal({
  persona,
  aircraftOptions,
  defaultAircraftId,
  defaultCategory,
  open,
  onOpenChange,
  onUploaded,
  organizationId,
  effectiveTier = 'beta',
}: PersonaAwareUploadModalProps) {
  const allowedCategories = useMemo(() => getAllowedCategories(persona), [persona])
  const initialCategory: DocumentCategory =
    (defaultCategory && allowedCategories.includes(defaultCategory)
      ? defaultCategory
      : allowedCategories[0]) ?? 'Other'

  const [category, setCategory] = useState<DocumentCategory>(initialCategory)
  const [documentType, setDocumentType] = useState<DocumentType | ''>('')
  const [aircraftId, setAircraftId] = useState<string | undefined>(defaultAircraftId)
  const [title, setTitle] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState<UploadStatus>({ state: 'idle' })
  // Optional STC / Form 337 metadata.
  const [stcNumber, setStcNumber] = useState('')
  const [form337Date, setForm337Date] = useState('')
  const [relatedStcNumber, setRelatedStcNumber] = useState('')

  const allowedTypesInCategory = useMemo(
    () => getCategoryTypes(category).filter((m) => canPersonaUpload(persona, m.id)),
    [category, persona],
  )
  const needsAircraft = documentType ? requiresAircraftId(documentType) : false
  const submitDisabled =
    !file ||
    !documentType ||
    !title.trim() ||
    (needsAircraft && !aircraftId) ||
    status.state === 'uploading'

  async function handleSubmit() {
    if (submitDisabled || !file) return
    setStatus({ state: 'uploading' })

    // STC / Form 337 metadata — stored on the existing documents columns
    // (document_date + description) so no schema change is needed.
    const extraDocumentDate =
      documentType === 'form_337' && form337Date ? form337Date : null
    const extraNotes =
      documentType === 'stc' && stcNumber.trim()
        ? `STC Number: ${stcNumber.trim()}`
        : documentType === 'form_337' && relatedStcNumber.trim()
          ? `Related STC: ${relatedStcNumber.trim()}`
          : null

    try {
      // Step 1: get a pre-signed upload URL + documentId from /api/upload/init.
      const initRes = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type || 'application/pdf',
          organizationId,
        }),
      })
      if (!initRes.ok) {
        const err = await initRes.json().catch(() => ({}))
        throw new Error(err.error ?? `Upload init failed (${initRes.status})`)
      }
      const initBody = (await initRes.json()) as {
        documentId: string
        uploadUrl: string
        storagePath: string
      }

      // Step 2: PUT the file to Supabase storage.
      const putRes = await fetch(initBody.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/pdf' },
        body: file,
      })
      if (!putRes.ok) {
        throw new Error(`Storage upload failed (${putRes.status})`)
      }

      // Step 3: complete the upload — DB row + audit.
      const completeRes = await fetch('/api/upload/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: initBody.documentId,
          storagePath: initBody.storagePath,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type || 'application/pdf',
          aircraftId: aircraftId ?? null,
          // Legacy doc_type: best-effort fallback so the existing
          // classifier/list views still work; the new document_type below
          // is what the persona×type RLS+route actually checks.
          docType: legacyDocTypeForNew(documentType as DocumentType),
          title: title.trim(),
          // Phase 13.1 fields — server-side validation lives here.
          documentType,
          uploadedByPersona: persona,
          documentDate: extraDocumentDate,
          notes: extraNotes,
        }),
      })
      if (!completeRes.ok) {
        const err = await completeRes.json().catch(() => ({}))
        throw new Error(err.error ?? `Upload complete failed (${completeRes.status})`)
      }
      const completeBody = (await completeRes.json()) as { documentId: string }

      setStatus({ state: 'success', documentId: completeBody.documentId })
      onUploaded?.(completeBody.documentId, documentType as DocumentType)
      // Close after brief success flash so user sees the confirmation.
      setTimeout(() => onOpenChange(false), 400)
    } catch (err) {
      setStatus({ state: 'error', error: err instanceof Error ? err.message : 'Upload failed' })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Upload document</DialogTitle>
          <DialogDescription>
            {personaUploadHint(persona)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Phase 14: tier-aware SLA banner above the picker. */}
          <SlaBanner tier={effectiveTier} />

          {/* Category accordion — persona-filtered. */}
          <div>
            <Label>Category</Label>
            <Select
              value={category}
              onValueChange={(v) => {
                setCategory(v as DocumentCategory)
                setDocumentType('') // reset type when category changes
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {allowedCategories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Type — persona-filtered within the category. */}
          <div>
            <Label>Document type</Label>
            <Select
              value={documentType}
              onValueChange={(v) => setDocumentType(v as DocumentType)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {allowedTypesInCategory.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {documentType && (
              <p className="mt-1 text-xs text-muted-foreground">
                {DOCUMENT_TYPE_META[documentType].description}
              </p>
            )}
          </div>

          {/* Aircraft selector — only shown for aircraft_* types. */}
          {needsAircraft && (
            <div>
              <Label>Aircraft</Label>
              <Select
                value={aircraftId}
                onValueChange={setAircraftId}
                disabled={Boolean(defaultAircraftId)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select aircraft" />
                </SelectTrigger>
                <SelectContent>
                  {aircraftOptions.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.display}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {aircraftOptions.length === 0 && (
                <p className="mt-1 text-xs text-destructive">
                  No aircraft in this org. Add one before uploading aircraft records.
                </p>
              )}
            </div>
          )}

          {/* Title. */}
          <div>
            <Label>Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. 2026 Annual Inspection"
            />
          </div>

          {/* STC metadata — optional STC number. */}
          {documentType === 'stc' && (
            <div>
              <Label>STC Number (optional)</Label>
              <Input
                value={stcNumber}
                onChange={(e) => setStcNumber(e.target.value)}
                placeholder="e.g. SA01234SE"
              />
            </div>
          )}

          {/* Form 337 metadata — optional date + related STC. */}
          {documentType === 'form_337' && (
            <>
              <div>
                <Label>337 Date (optional)</Label>
                <Input
                  type="date"
                  value={form337Date}
                  onChange={(e) => setForm337Date(e.target.value)}
                />
              </div>
              <div>
                <Label>Related STC Number (optional)</Label>
                <Input
                  value={relatedStcNumber}
                  onChange={(e) => setRelatedStcNumber(e.target.value)}
                  placeholder="STC that authorized the alteration, if any"
                />
              </div>
            </>
          )}

          {/* File. */}
          <div>
            <Label>File (PDF or image)</Label>
            <Input
              type="file"
              accept="application/pdf,image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file && (
              <p className="mt-1 text-xs text-muted-foreground">
                {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB
              </p>
            )}
          </div>

          {status.state === 'error' && (
            <div className="rounded border border-destructive bg-destructive/10 p-2 text-sm text-destructive">
              {status.error}
            </div>
          )}
          {status.state === 'success' && (
            <div className="rounded border border-emerald-300 bg-emerald-50 p-2 text-sm text-emerald-800">
              Uploaded. Indexing in progress.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitDisabled}>
            {status.state === 'uploading' ? 'Uploading…' : 'Upload'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function personaUploadHint(persona: Persona): string {
  switch (persona) {
    case 'owner':
      return 'Upload aircraft records for an aircraft you own. Reference manuals are uploaded by the shop.'
    case 'shop':
      // Phase 18 mig 119 — shop spans the former mechanic + shop surfaces. The
      // upload hint now lists everything except the owner-only sensitive types.
      return 'Upload reference manuals, parts catalogs, service bulletins, ADs, work-order attachments, invoices, and most aircraft documents. Aircraft logbooks and registrations stay owner-only.'
    case 'admin':
      return 'Platform admin — upload any document type for any aircraft.'
    default:
      return ''
  }
}

/**
 * Map the new document_type back to the legacy doc_type enum so the upload
 * route's downstream classification + book-assignment logic continues to
 * work. Mirrors the inverse of inferDocumentTypeFromLegacy.
 */
function legacyDocTypeForNew(documentType: DocumentType): string {
  switch (documentType) {
    case 'aircraft_logbook':
      return 'logbook'
    case 'aircraft_registration':
      return 'lease_ownership'
    case 'aircraft_airworthiness':
      return 'compliance'
    case 'aircraft_insurance':
      return 'insurance'
    case 'aircraft_poh':
      return 'poh'
    case 'aircraft_afm':
      return 'afm'
    case 'aircraft_weight_balance':
      return 'compliance'
    case 'aircraft_prebuy':
    case 'aircraft_annual':
    case 'aircraft_100hr':
      return 'inspection_report'
    case 'maintenance_manual':
      return 'maintenance_manual'
    case 'parts_catalog':
      return 'parts_catalog'
    case 'service_bulletin':
    case 'service_letter':
      return 'service_bulletin'
    case 'airworthiness_directive':
      return 'airworthiness_directive'
    case 'wiring_diagram':
    case 'training_manual':
    case 'tcds':
      return 'maintenance_manual'
    case 'work_order_attachment':
      return 'work_order'
    case 'stc':
      return 'stc'
    case 'form_337':
      return 'form_337'
    case 'invoice':
    case 'receipt':
    case 'photo':
    case 'other':
    default:
      return 'miscellaneous'
  }
}
