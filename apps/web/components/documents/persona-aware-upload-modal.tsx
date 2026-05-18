'use client'

/**
 * SOP-DOC-001 Item 3 — persona-differentiated upload modal.
 *
 * The owner and shop personas see entirely different upload category sets,
 * defined in lib/documents/upload-categories.ts (SOP §6). Tier 1 categories
 * are shown immediately; Tier 2 categories are revealed with a "Show more"
 * toggle (progressive disclosure, so neither persona is overwhelmed).
 *
 * Each category maps to one or more real DocumentType values from
 * persona-taxonomy.ts — that taxonomy and /api/upload/complete remain the
 * enforced Iron Wall; these category groups only control what the modal
 * displays per persona.
 *
 * Server contract (unchanged):
 *   - POST /api/upload          → pre-signed URL + documentId
 *   - PUT  <uploadUrl>          → file bytes to Supabase storage
 *   - POST /api/upload/complete → documents row; validates persona × type
 */
import { useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { Persona } from '@/types'
import {
  DOCUMENT_TYPE_META,
  requiresAircraftId,
  type DocumentType,
} from '@/lib/documents/persona-taxonomy'
import {
  getUploadCategoryGroups,
  type UploadCategoryGroup,
} from '@/lib/documents/upload-categories'
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
  /** Active persona. Drives which category set (owner vs shop) renders. */
  persona: Persona
  /** User's aircraft for the aircraft selector. */
  aircraftOptions: AircraftOption[]
  /** Pre-selected aircraft (e.g. when launched from /aircraft/[id]). Locks the selector. */
  defaultAircraftId?: string
  /** When mounted as a controlled dialog, parent owns open state. */
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Callback after successful upload — usually refreshes the parent list. */
  onUploaded?: (documentId: string, documentType: DocumentType) => void
  /** Org id is needed by the server contract. */
  organizationId: string
  /** Effective tier for the SLA banner. Optional — defaults to beta. */
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
  open,
  onOpenChange,
  onUploaded,
  organizationId,
  effectiveTier = 'beta',
}: PersonaAwareUploadModalProps) {
  const groups = useMemo(() => getUploadCategoryGroups(persona), [persona])
  const tier1Groups = useMemo(() => groups.filter((g) => g.tier === 1), [groups])
  const tier2Groups = useMemo(() => groups.filter((g) => g.tier === 2), [groups])

  const [selectedGroupKey, setSelectedGroupKey] = useState<string>('')
  const [documentType, setDocumentType] = useState<DocumentType | ''>('')
  const [showMore, setShowMore] = useState(false)
  const [aircraftId, setAircraftId] = useState<string | undefined>(defaultAircraftId)
  const [title, setTitle] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState<UploadStatus>({ state: 'idle' })
  // Optional STC / Form 337 metadata.
  const [stcNumber, setStcNumber] = useState('')
  const [form337Date, setForm337Date] = useState('')
  const [relatedStcNumber, setRelatedStcNumber] = useState('')

  const selectedGroup = useMemo(
    () => groups.find((g) => g.key === selectedGroupKey) ?? null,
    [groups, selectedGroupKey],
  )

  function selectGroup(group: UploadCategoryGroup) {
    setSelectedGroupKey(group.key)
    // Single-type categories auto-select their type; multi-type categories
    // surface a type picker.
    setDocumentType(group.documentTypes.length === 1 ? group.documentTypes[0] : '')
  }

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
      // Step 1: get a pre-signed upload URL + documentId.
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
          // Legacy doc_type fallback so existing classifier/list views work;
          // documentType below is what the persona × type RLS+route checks.
          docType: legacyDocTypeForNew(documentType as DocumentType),
          title: title.trim(),
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
      const completeBody = (await completeRes.json()) as { documentId?: string; document_id?: string }
      const newId = completeBody.documentId ?? completeBody.document_id ?? initBody.documentId

      setStatus({ state: 'success', documentId: newId })
      onUploaded?.(newId, documentType as DocumentType)
      // Close after brief success flash so user sees the confirmation.
      setTimeout(() => onOpenChange(false), 400)
    } catch (err) {
      setStatus({ state: 'error', error: err instanceof Error ? err.message : 'Upload failed' })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload document</DialogTitle>
          <DialogDescription>{personaUploadHint(persona)}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Tier-aware SLA banner above the picker. */}
          <SlaBanner tier={effectiveTier} />

          {/* Category picker — persona-specific, Tier 1 / Tier 2. */}
          <div>
            <Label>Category</Label>
            <div className="mt-1.5 space-y-1.5">
              {tier1Groups.map((g) => (
                <CategoryCard
                  key={g.key}
                  group={g}
                  selected={selectedGroupKey === g.key}
                  onSelect={() => selectGroup(g)}
                />
              ))}
            </div>

            {tier2Groups.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setShowMore((v) => !v)}
                  className="mt-2 flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform duration-200 ${
                      showMore ? 'rotate-180' : ''
                    }`}
                  />
                  {showMore ? 'Show less' : `Show ${tier2Groups.length} more categories`}
                </button>
                {/* grid-rows 0fr→1fr gives a smooth height animation. */}
                <div
                  className={`grid transition-all duration-200 ${
                    showMore ? 'grid-rows-[1fr] opacity-100 mt-1.5' : 'grid-rows-[0fr] opacity-0'
                  }`}
                >
                  <div className="overflow-hidden">
                    <div className="space-y-1.5">
                      {tier2Groups.map((g) => (
                        <CategoryCard
                          key={g.key}
                          group={g}
                          selected={selectedGroupKey === g.key}
                          onSelect={() => selectGroup(g)}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Type — only when the chosen category offers more than one. */}
          {selectedGroup && selectedGroup.documentTypes.length > 1 && (
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
                  {selectedGroup.documentTypes.map((t) => (
                    <SelectItem key={t} value={t}>
                      {DOCUMENT_TYPE_META[t].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {documentType && (
            <p className="-mt-2 text-xs text-muted-foreground">
              {DOCUMENT_TYPE_META[documentType].description}
            </p>
          )}

          {/* Aircraft selector — only for aircraft_* types. */}
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

/** One selectable category card — label, description, example file types. */
function CategoryCard({
  group,
  selected,
  onSelect,
}: {
  group: UploadCategoryGroup
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-lg border p-2.5 text-left transition-colors ${
        selected
          ? 'border-primary bg-primary/5 ring-1 ring-primary'
          : 'border-border hover:border-primary/40 hover:bg-muted/40'
      }`}
    >
      <p className="text-sm font-semibold text-foreground">{group.label}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{group.description}</p>
      <p className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground/70">
        {group.exampleFileTypes}
      </p>
    </button>
  )
}

function personaUploadHint(persona: Persona): string {
  switch (persona) {
    case 'owner':
      return 'Upload aircraft records for an aircraft you own. Reference manuals are uploaded by the shop.'
    case 'shop':
      return 'Upload reference manuals, parts catalogs, ADs/SBs and shop documentation. Aircraft logbooks and registrations stay owner-only.'
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
