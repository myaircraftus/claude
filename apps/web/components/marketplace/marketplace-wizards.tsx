'use client'

import { useEffect, useMemo, useState } from 'react'
import { BookOpen, FileUp, Loader2, ShieldCheck, Sparkles, Upload, Wrench } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { MANUAL_MARKETPLACE_TYPES, PART_MARKETPLACE_CATEGORIES } from '@/lib/marketplace/demo-data'
import {
  buildMarketplaceDocumentListing,
  findPartLookupResult,
  getDocumentTypeLabel,
  identifyDocumentMetadata,
  mapMarketplacePartListingRow,
  normalizeMarketplacePartNumber,
} from '@/lib/marketplace/service'
import type {
  AircraftTargetOption,
  DocumentMarketplaceType,
  ListingUsageSummary,
  MarketplaceDocumentListing,
  MarketplacePartListing,
  PartCondition,
  PartListingMedia,
  PartListingStatus,
  PartLookupResult,
  SellerPlanAccount,
} from '@/lib/marketplace/types'
import type { Document } from '@/types'
import { formatBytes } from '@/lib/utils'

interface Props {
  kind: 'part' | 'document' | null
  open: boolean
  sellerPlan: SellerPlanAccount
  listingUsage: ListingUsageSummary
  currentUserName: string
  currentUserEmail: string
  currentAircraftId: string | null
  aircraftOptions: AircraftTargetOption[]
  initialPartListing?: MarketplacePartListing | null
  initialDocumentListing?: MarketplaceDocumentListing | null
  onClose: () => void
  onPartCreated: (listing: MarketplacePartListing) => void
  onDocumentCreated: (listing: MarketplaceDocumentListing) => void
}

const PART_CONDITIONS: Array<{ id: PartCondition; label: string }> = [
  { id: 'new', label: 'New' },
  { id: 'new_surplus', label: 'New Surplus' },
  { id: 'overhauled', label: 'Overhauled' },
  { id: 'serviceable', label: 'Serviceable' },
  { id: 'as_removed', label: 'As Removed' },
  { id: 'used', label: 'Used' },
  { id: 'for_repair', label: 'For Repair' },
]

const DOCUMENT_TYPES = MANUAL_MARKETPLACE_TYPES

type PartFormState = {
  partNumber: string
  title: string
  manufacturer: string
  category: string
  condition: PartCondition
  price: string
  quantity: string
  location: string
  serialNumber: string
  alternatePartNumber: string
  fitsApplicability: string
  description: string
  sellerNotes: string
  contactName: string
  contactEmail: string
  contactPhone: string
  contactText: string
  traceDocsAvailable: boolean
  tagAvailable: boolean
  status: PartListingStatus
  media: PartListingMedia[]
}

function createInitialPartFormState(currentUserName?: string, currentUserEmail?: string): PartFormState {
  return {
    partNumber: '',
    title: '',
    manufacturer: '',
    category: PART_MARKETPLACE_CATEGORIES[0],
    condition: 'serviceable',
    price: '0.00',
    quantity: '1',
    location: '',
    serialNumber: '',
    alternatePartNumber: '',
    fitsApplicability: '',
    description: '',
    sellerNotes: '',
    contactName: currentUserName ?? '',
    contactEmail: currentUserEmail ?? '',
    contactPhone: '',
    contactText: '',
    traceDocsAvailable: true,
    tagAvailable: true,
    status: 'draft',
    media: [],
  }
}

function createPartFormFromListing(
  listing: MarketplacePartListing,
  currentUserName?: string,
  currentUserEmail?: string
): PartFormState {
  return {
    partNumber: listing.partNumber,
    title: listing.title,
    manufacturer: listing.manufacturer,
    category: listing.category,
    condition: listing.condition,
    price: (listing.priceCents / 100).toFixed(2),
    quantity: String(listing.quantity),
    location: listing.location,
    serialNumber: listing.serialNumber ?? '',
    alternatePartNumber: listing.alternatePartNumber ?? '',
    fitsApplicability: listing.fitsApplicability ?? '',
    description: listing.description ?? '',
    sellerNotes: listing.sellerNotes ?? '',
    contactName: listing.sellerName || currentUserName || '',
    contactEmail: listing.sellerEmail || currentUserEmail || '',
    contactPhone: listing.sellerPhone ?? '',
    contactText: listing.sellerTextNumber ?? listing.sellerPhone ?? '',
    traceDocsAvailable: listing.traceDocsAvailable,
    tagAvailable: listing.tagAvailable,
    status: listing.status,
    media: listing.media,
  }
}

function createInitialDocumentFormState() {
  return {
    title: '',
    documentNumber: '',
    documentType: 'maintenance_manual' as DocumentMarketplaceType,
    manufacturer: '',
    aircraftApplicability: '',
    revision: '',
    description: '',
    fileName: '',
    downloadable: true,
    injectable: true,
    previewAvailable: true,
    accessType: 'free' as MarketplaceDocumentListing['accessType'],
    listingStatus: 'draft' as MarketplaceDocumentListing['listingStatus'],
    price: '0.00',
  }
}

function createDocumentFormFromListing(listing: MarketplaceDocumentListing) {
  return {
    title: listing.title,
    documentNumber: listing.documentNumber ?? '',
    documentType: listing.documentType,
    manufacturer: listing.manufacturer ?? '',
    aircraftApplicability: listing.aircraftApplicability ?? '',
    revision: listing.revision ?? '',
    description: listing.description ?? '',
    fileName: listing.fileName,
    downloadable: listing.downloadable,
    injectable: listing.injectable,
    previewAvailable: listing.previewAvailable,
    accessType: listing.accessType,
    listingStatus: listing.listingStatus,
    price: listing.priceCents != null ? (listing.priceCents / 100).toFixed(2) : '0.00',
  }
}

function createId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

function centsFromDollars(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100)) : 0
}

function formatDollars(cents: number) {
  return `$${(cents / 100).toFixed(2)}`
}

function getDocumentUploadSelection(documentType: DocumentMarketplaceType) {
  switch (documentType) {
    case 'maintenance_manual':
      return {
        docType: 'maintenance_manual',
        documentGroup: 'maintenance_program_and_inspection_records',
        documentDetail: 'maintenance_manual',
      }
    case 'service_manual':
      return {
        docType: 'service_manual',
        documentGroup: 'maintenance_program_and_inspection_records',
        documentDetail: 'service_manual',
      }
    case 'parts_catalog':
      return {
        docType: 'parts_catalog',
        documentGroup: 'maintenance_program_and_inspection_records',
        documentDetail: 'parts_catalog',
      }
    case 'ipc':
      return {
        docType: 'parts_catalog',
        documentGroup: 'maintenance_program_and_inspection_records',
        documentDetail: 'illustrated_parts_catalog_ipc',
      }
    case 'wiring_manual':
      return {
        docType: 'maintenance_manual',
        documentGroup: 'maintenance_program_and_inspection_records',
        documentDetail: 'wiring_diagram_manual',
      }
    case 'structural_repair_manual':
      return {
        docType: 'maintenance_manual',
        documentGroup: 'maintenance_program_and_inspection_records',
        documentDetail: 'structural_repair_manual_srm',
      }
    case 'overhaul_manual':
      return {
        docType: 'service_manual',
        documentGroup: 'maintenance_program_and_inspection_records',
        documentDetail: 'overhaul_manual',
      }
    case 'component_maintenance_manual':
      return {
        docType: 'maintenance_manual',
        documentGroup: 'maintenance_program_and_inspection_records',
        documentDetail: 'component_maintenance_manuals_cmms',
      }
    default:
      return {
        docType: 'miscellaneous',
        documentGroup: null,
        documentDetail: null,
      }
  }
}

export function CreateMarketplaceListingDialog({
  kind,
  open,
  sellerPlan,
  listingUsage,
  currentUserName,
  currentUserEmail,
  currentAircraftId,
  aircraftOptions,
  initialPartListing,
  initialDocumentListing,
  onClose,
  onPartCreated,
  onDocumentCreated,
}: Props) {
  const [step, setStep] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [partLookup, setPartLookup] = useState<PartLookupResult | null>(null)
  const [documentLookup, setDocumentLookup] = useState<ReturnType<typeof identifyDocumentMetadata> | null>(null)
  const [documentFile, setDocumentFile] = useState<File | null>(null)
  const [selectedAircraftId, setSelectedAircraftId] = useState<string>(currentAircraftId ?? aircraftOptions[0]?.id ?? '')

  const [partForm, setPartForm] = useState<PartFormState>(
    createInitialPartFormState(currentUserName, currentUserEmail)
  )

  const [documentForm, setDocumentForm] = useState(createInitialDocumentFormState())

  const currentAircraftLabel = useMemo(() => {
    if (!currentAircraftId) return null
    return aircraftOptions.find((option) => option.id === currentAircraftId)?.label ?? null
  }, [aircraftOptions, currentAircraftId])

  const isEditingPart = kind === 'part' && Boolean(initialPartListing)
  const isEditingDocument = kind === 'document' && Boolean(initialDocumentListing)

  useEffect(() => {
    if (!open || kind !== 'part') return

    if (initialPartListing) {
      setPartForm(createPartFormFromListing(initialPartListing, currentUserName, currentUserEmail))
      setPartLookup({
        normalizedPartNumber: initialPartListing.partNumber,
        title: initialPartListing.title,
        manufacturer: initialPartListing.manufacturer,
        category: initialPartListing.category,
        alternatePartNumber: initialPartListing.alternatePartNumber ?? null,
        fitsApplicability: initialPartListing.fitsApplicability ?? null,
        description: initialPartListing.description ?? null,
        confidence: 'high',
      })
      setStep(2)
      return
    }

    setPartForm(createInitialPartFormState(currentUserName, currentUserEmail))
    setPartLookup(null)
    setStep(1)
  }, [currentUserEmail, currentUserName, initialPartListing, kind, open])

  useEffect(() => {
    if (!open || kind !== 'document') return

    if (initialDocumentListing) {
      setDocumentForm(createDocumentFormFromListing(initialDocumentListing))
      setDocumentLookup({
        title: initialDocumentListing.title,
        documentType: initialDocumentListing.documentType,
        manufacturer: initialDocumentListing.manufacturer ?? null,
        aircraftApplicability: initialDocumentListing.aircraftApplicability ?? null,
        revision: initialDocumentListing.revision ?? null,
        documentNumber: initialDocumentListing.documentNumber ?? null,
        description: initialDocumentListing.description ?? null,
        confidence: 'high',
      })
      setDocumentFile(null)
      setSelectedAircraftId(
        initialDocumentListing.aircraftId ??
          currentAircraftId ??
          aircraftOptions[0]?.id ??
          ''
      )
      setStep(1)
      return
    }

    setDocumentForm(createInitialDocumentFormState())
    setDocumentLookup(null)
    setDocumentFile(null)
    setStep(1)
  }, [aircraftOptions, currentAircraftId, initialDocumentListing, kind, open])

  function reset() {
    setStep(1)
    setBusy(false)
    setError(null)
    setSuccess(null)
    setPartLookup(null)
    setDocumentLookup(null)
    setDocumentFile(null)
    setPartForm(createInitialPartFormState(currentUserName, currentUserEmail))
    setDocumentForm(createInitialDocumentFormState())
    setSelectedAircraftId(currentAircraftId ?? aircraftOptions[0]?.id ?? '')
  }

  function close() {
    reset()
    onClose()
  }

  async function publishPartListing(targetStatus: PartListingStatus) {
    setBusy(true)
    setError(null)
    try {
      const payload = {
        title: partForm.title || partLookup?.title || 'Untitled part listing',
        partNumber: normalizeMarketplacePartNumber(partForm.partNumber || partLookup?.normalizedPartNumber || ''),
        alternatePartNumber: partForm.alternatePartNumber || partLookup?.alternatePartNumber || null,
        manufacturer: partForm.manufacturer || partLookup?.manufacturer || '',
        category: partForm.category,
        condition: partForm.condition,
        priceCents: centsFromDollars(partForm.price),
        quantity: Number(partForm.quantity) || 1,
        location: partForm.location,
        serialNumber: partForm.serialNumber || null,
        fitsApplicability: partForm.fitsApplicability || partLookup?.fitsApplicability || null,
        description: partForm.description || partLookup?.description || null,
        sellerNotes: partForm.sellerNotes || null,
        contactName: partForm.contactName || currentUserName || null,
        contactPhone: partForm.contactPhone || null,
        contactText: partForm.contactText || partForm.contactPhone || null,
        contactEmail: partForm.contactEmail || currentUserEmail || null,
        traceDocsAvailable: partForm.traceDocsAvailable,
        tagAvailable: partForm.tagAvailable,
        status: targetStatus,
        media: partForm.media,
      }

      const res = await fetch(
        isEditingPart && initialPartListing
          ? `/api/marketplace/parts/listings/${initialPartListing.id}`
          : '/api/marketplace/parts/listings',
        {
          method: isEditingPart ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      )
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Failed to create part listing')
      if (!json.listing) throw new Error('No listing returned')
      onPartCreated(mapMarketplacePartListingRow(json.listing as Record<string, unknown>))
      setSuccess(
        isEditingPart
          ? targetStatus === 'draft'
            ? 'Part listing updated and saved as draft.'
            : 'Part listing updated successfully.'
          : targetStatus === 'draft'
            ? 'Part listing saved as draft.'
            : 'Part listing published successfully.'
      )
      setTimeout(() => close(), 350)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create part listing')
    } finally {
      setBusy(false)
    }
  }

  async function publishDocumentListing(mode: 'draft' | 'published') {
    setBusy(true)
    setError(null)
    try {
      if (!isEditingDocument && !documentFile) {
        throw new Error('Please choose a PDF before publishing this manual or catalog.')
      }

      const uploadSelection = getDocumentUploadSelection(documentForm.documentType)
      const manualAccess =
        mode === 'draft'
          ? 'private'
          : documentForm.accessType === 'paid'
            ? 'paid'
            : documentForm.accessType === 'free'
            ? 'free'
            : 'private'

      if (isEditingDocument && initialDocumentListing?.sourceDocumentId) {
        const updateRes = await fetch(`/api/documents/${initialDocumentListing.sourceDocumentId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: documentForm.title || documentLookup?.title || initialDocumentListing.title,
            description: documentForm.description || null,
            aircraft_id: selectedAircraftId || null,
            doc_type: uploadSelection.docType,
            document_group_id: uploadSelection.documentGroup,
            document_detail_id: uploadSelection.documentDetail,
            document_subtype: documentForm.documentNumber || null,
            revision: documentForm.revision || null,
            manual_access: manualAccess,
            marketplace_downloadable: documentForm.downloadable,
            marketplace_injectable: documentForm.injectable,
            marketplace_preview_available: documentForm.previewAvailable,
            price_cents: manualAccess === 'paid' ? centsFromDollars(documentForm.price) : null,
            listing_status: mode === 'draft' ? null : documentForm.listingStatus,
            community_listing: manualAccess !== 'private',
          }),
        })
        const updateJson = await updateRes.json().catch(() => ({}))
        if (!updateRes.ok) {
          throw new Error(updateJson.error || 'Failed to update the manual / catalog listing')
        }
        if (!updateJson.document) {
          throw new Error('Document updated, but the marketplace listing could not be rebuilt')
        }

        const listing = buildMarketplaceDocumentListing(updateJson.document as Document & {
          aircraft?: { make?: string | null; model?: string | null; tail_number?: string | null } | null
        })

        onDocumentCreated(listing)
        setSuccess(
          mode === 'draft'
            ? 'Manual / catalog listing updated and saved to drafts.'
            : 'Manual / catalog listing updated successfully.'
        )
        setTimeout(() => close(), 350)
        return
      }

      const uploadFile = documentFile
      if (!uploadFile) {
        throw new Error('Please choose a PDF before publishing this manual or catalog.')
      }

      const formData = new FormData()
      formData.append('file', uploadFile)
      formData.append('title', documentForm.title || documentLookup?.title || uploadFile.name.replace(/\.pdf$/i, ''))
      formData.append('doc_type', uploadSelection.docType)
      if (uploadSelection.documentGroup) {
        formData.append('document_group', uploadSelection.documentGroup)
      }
      if (uploadSelection.documentDetail) {
        formData.append('document_detail', uploadSelection.documentDetail)
      }
      if (documentForm.documentNumber) formData.append('document_subtype', documentForm.documentNumber)
      if (documentForm.description) formData.append('notes', documentForm.description)
      if (documentForm.revision) formData.append('revision', documentForm.revision)
      if (selectedAircraftId) formData.append('aircraft_id', selectedAircraftId)
      formData.append('manual_access', manualAccess)
      if (manualAccess === 'paid') {
        formData.append('price', documentForm.price)
      }
      formData.append('marketplace_downloadable', String(documentForm.downloadable))
      formData.append('marketplace_injectable', String(documentForm.injectable))
      formData.append('marketplace_preview_available', String(documentForm.previewAvailable))
      formData.append('attestation', String(manualAccess !== 'private'))

      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })
      const uploadJson = await uploadRes.json().catch(() => ({}))
      if (!uploadRes.ok) {
        throw new Error(uploadJson.error || 'Failed to upload the manual / catalog')
      }

      const documentId = String(uploadJson.document_id ?? '')
      if (!documentId) throw new Error('Upload completed without a document id')

      const detailRes = await fetch(`/api/documents/${documentId}`)
      const detailJson = await detailRes.json().catch(() => ({}))
      if (!detailRes.ok || !detailJson.document) {
        throw new Error(detailJson.error || 'Document saved, but the listing preview could not be loaded')
      }

      const listing = buildMarketplaceDocumentListing(detailJson.document as Document & {
        aircraft?: { make?: string | null; model?: string | null; tail_number?: string | null } | null
      })

      onDocumentCreated(listing)
      setSuccess(mode === 'draft' ? 'Manual / catalog saved to your marketplace drafts.' : 'Manual / catalog submitted successfully.')
      setTimeout(() => close(), 350)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create manual listing')
    } finally {
      setBusy(false)
    }
  }

  async function lookupPart() {
    setBusy(true)
    setError(null)
    try {
      const result = findPartLookupResult(partForm.partNumber)
      if (!result) {
        setPartLookup(null)
        setError('No exact match was found. You can continue with manual entry.')
        return
      }
      setPartLookup(result)
      setPartForm((current) => ({
        ...current,
        title: current.title || result.title,
        manufacturer: current.manufacturer || result.manufacturer,
        category: current.category || result.category,
        alternatePartNumber: current.alternatePartNumber || result.alternatePartNumber || '',
        fitsApplicability: current.fitsApplicability || result.fitsApplicability || '',
        description: current.description || result.description || '',
      }))
    } finally {
      setBusy(false)
    }
  }

  async function identifyDocument() {
    setBusy(true)
    setError(null)
    try {
      const result = identifyDocumentMetadata({
        title: documentForm.title,
        documentNumber: documentForm.documentNumber,
        fileName: documentForm.fileName,
      })
      setDocumentLookup(result)
      setDocumentForm((current) => ({
        ...current,
        title: current.title || result.title,
        documentType: current.documentType || result.documentType,
        manufacturer: current.manufacturer || result.manufacturer || '',
        aircraftApplicability: current.aircraftApplicability || result.aircraftApplicability || currentAircraftLabel || '',
        revision: current.revision || result.revision || '',
        documentNumber: current.documentNumber || result.documentNumber || '',
        description: current.description || result.description || '',
      }))
    } finally {
      setBusy(false)
    }
  }

  if (!open || !kind) return null

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && close()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            {kind === 'part' ? <Wrench className="h-5 w-5 text-brand-600" /> : <BookOpen className="h-5 w-5 text-brand-600" />}
            {kind === 'part'
              ? isEditingPart
                ? 'Edit marketplace part listing'
                : 'Create marketplace part listing'
              : isEditingDocument
                ? 'Edit manual / catalog listing'
                : 'Create manual / catalog listing'}
          </DialogTitle>
          <DialogDescription>
            {kind === 'part'
              ? 'Use the 4-step flow to identify the part, fill the details, and publish the listing.'
              : isEditingDocument
                ? 'Update metadata, access settings, and marketplace availability for this manual or catalog.'
                : 'Upload the document listing, set access options, and make it downloadable or injectable into a workspace.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3, 4].map((currentStep) => (
              <Badge key={currentStep} variant={step === currentStep ? 'default' : 'outline'} className="px-3 py-1">
                Step {currentStep}
              </Badge>
            ))}
          </div>

          {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}
          {success && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{success}</div>}

          {kind === 'part' ? (
            <div className="space-y-4">
              {step === 1 && (
                <section className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-slate-950">Step 1. Part Number Lookup</h3>
                      <p className="text-sm text-slate-600">Use AI lookup to autofill the listing where possible.</p>
                    </div>
                    <Button onClick={lookupPart} disabled={busy || !partForm.partNumber.trim()}>
                      {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                      AI Lookup
                    </Button>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Part number" value={partForm.partNumber} onChange={(value) => setPartForm((current) => ({ ...current, partNumber: value }))} />
                    <Field label="Matched title" value={partForm.title} onChange={(value) => setPartForm((current) => ({ ...current, title: value }))} />
                    <Field label="Manufacturer" value={partForm.manufacturer} onChange={(value) => setPartForm((current) => ({ ...current, manufacturer: value }))} />
                    <SelectField label="Category" value={partForm.category} onChange={(value) => setPartForm((current) => ({ ...current, category: value }))} options={PART_MARKETPLACE_CATEGORIES.map((category) => ({ value: category, label: category }))} />
                  </div>
                  {partLookup && (
                    <div className="rounded-2xl border border-brand-200 bg-brand-50 p-4 text-sm text-brand-900">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4" />
                        Confidence: {partLookup.confidence}
                      </div>
                      <p className="mt-1 font-medium">{partLookup.title}</p>
                      <p className="text-brand-700">{partLookup.manufacturer} · {partLookup.category}</p>
                    </div>
                  )}
                </section>
              )}

              {step === 2 && (
                <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-slate-950">Step 2. Details & Condition</h3>
                      <p className="text-sm text-slate-600">Refine the listing details before you publish it or save it as a draft.</p>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() =>
                        setPartForm((current) => ({
                          ...current,
                          description:
                            current.description ||
                            `Aircraft part listing for ${current.title || partLookup?.title || 'this part'}, ${current.condition.replace(/_/g, ' ')} condition, located in ${current.location || 'seller inventory'} with direct-contact purchasing.`,
                        }))
                      }
                    >
                      <Sparkles className="mr-2 h-4 w-4" />
                      AI generate description
                    </Button>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Title" value={partForm.title} onChange={(value) => setPartForm((current) => ({ ...current, title: value }))} />
                    <Field label="Manufacturer" value={partForm.manufacturer} onChange={(value) => setPartForm((current) => ({ ...current, manufacturer: value }))} />
                    <SelectField label="Condition" value={partForm.condition} onChange={(value) => setPartForm((current) => ({ ...current, condition: value as PartCondition }))} options={PART_CONDITIONS.map((condition) => ({ value: condition.id, label: condition.label }))} />
                    <Field label="Price" value={partForm.price} onChange={(value) => setPartForm((current) => ({ ...current, price: value }))} />
                    <Field label="Quantity" value={partForm.quantity} onChange={(value) => setPartForm((current) => ({ ...current, quantity: value }))} />
                    <Field label="Location" value={partForm.location} onChange={(value) => setPartForm((current) => ({ ...current, location: value }))} />
                    <Field label="Serial number (optional)" value={partForm.serialNumber} onChange={(value) => setPartForm((current) => ({ ...current, serialNumber: value }))} />
                    <Field label="Fits / applicability" value={partForm.fitsApplicability} onChange={(value) => setPartForm((current) => ({ ...current, fitsApplicability: value }))} />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <TextareaField label="Description" value={partForm.description} onChange={(value) => setPartForm((current) => ({ ...current, description: value }))} />
                    <TextareaField label="Seller notes" value={partForm.sellerNotes} onChange={(value) => setPartForm((current) => ({ ...current, sellerNotes: value }))} />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Seller contact name" value={partForm.contactName} onChange={(value) => setPartForm((current) => ({ ...current, contactName: value }))} />
                    <Field label="Seller contact email" value={partForm.contactEmail} onChange={(value) => setPartForm((current) => ({ ...current, contactEmail: value }))} />
                    <Field label="Seller contact phone" value={partForm.contactPhone} onChange={(value) => setPartForm((current) => ({ ...current, contactPhone: value }))} placeholder="Optional" />
                    <Field label="Seller text number" value={partForm.contactText} onChange={(value) => setPartForm((current) => ({ ...current, contactText: value }))} placeholder="Optional" />
                  </div>
                  <div className="flex flex-wrap gap-4 text-sm text-slate-700">
                    <ToggleField label="Trace docs available" checked={partForm.traceDocsAvailable} onChange={(checked) => setPartForm((current) => ({ ...current, traceDocsAvailable: checked }))} />
                    <ToggleField label="8130 / tag available" checked={partForm.tagAvailable} onChange={(checked) => setPartForm((current) => ({ ...current, tagAvailable: checked }))} />
                  </div>
                </section>
              )}

              {step === 3 && (
                <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
                  <h3 className="font-semibold text-slate-950">Step 3. Add Media</h3>
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center text-sm text-slate-600">
                    <Upload className="mx-auto h-10 w-10 text-slate-400" />
                    <p className="mt-3 font-medium text-slate-900">Add photos now, and attach short video on Pro</p>
                    <p className="mt-1">Media is stored as listing-ready metadata today, with fuller storage plumbing ready to swap in later.</p>
                    <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm">
                      <FileUp className="h-4 w-4" />
                      Choose media
                      <input
                        type="file"
                        accept="image/*,video/*"
                        multiple
                        className="hidden"
                        onChange={async (event) => {
                          const files = Array.from(event.target.files ?? [])
                          if (files.length === 0) return
                          setBusy(true)
                          setError(null)
                          try {
                            const mediaForm = new FormData()
                            for (const file of files) {
                              if (file.type.startsWith('video/') && sellerPlan.sellerPlan !== 'pro') continue
                              mediaForm.append('files', file)
                            }

                            if (mediaForm.getAll('files').length === 0) {
                              throw new Error('Video upload requires the Pro seller plan.')
                            }

                            const uploadRes = await fetch('/api/marketplace/parts/media', {
                              method: 'POST',
                              body: mediaForm,
                            })
                            const uploadJson = await uploadRes.json().catch(() => ({}))
                            if (!uploadRes.ok) {
                              throw new Error(uploadJson.error || 'Failed to upload marketplace media')
                            }

                            const uploadedMedia = Array.isArray(uploadJson.media)
                              ? (uploadJson.media as PartListingMedia[])
                              : []

                            setPartForm((current) => ({
                              ...current,
                              media: [...current.media, ...uploadedMedia],
                            }))
                          } catch (uploadError) {
                            setError(uploadError instanceof Error ? uploadError.message : 'Failed to upload marketplace media')
                          } finally {
                            setBusy(false)
                            event.target.value = ''
                          }
                        }}
                      />
                    </label>
                  </div>
                  {partForm.media.length > 0 && (
                    <div className="grid gap-3 md:grid-cols-2">
                      {partForm.media.map((media) => (
                        <div key={media.id} className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
                          <p className="font-medium text-slate-900">{media.alt}</p>
                          <p className="mt-1">{media.type === 'video' ? 'Short video' : 'Photo'} attached</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {media.sizeBytes ? formatBytes(media.sizeBytes) : 'Stored in marketplace media'}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                  {sellerPlan.sellerPlan !== 'pro' && (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                      Video upload is reserved for the Pro seller plan. Image uploads are available on Starter.
                    </div>
                  )}
                </section>
              )}

              {step === 4 && (
                <section className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-slate-950">Step 4. Review & Publish</h3>
                      <p className="text-sm text-slate-600">Check the listing summary and choose whether to publish now or save as a draft.</p>
                    </div>
                    <Badge variant="outline" className="border-slate-200 bg-white text-slate-600">
                      {listingUsage.activeCount}
                      {listingUsage.listingLimit == null ? ' active' : ` / ${listingUsage.listingLimit} active`}
                    </Badge>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <SummaryCard label="Title" value={partForm.title || partLookup?.title || 'Untitled part'} />
                    <SummaryCard label="Part number" value={partForm.partNumber || partLookup?.normalizedPartNumber || '—'} />
                    <SummaryCard label="Category" value={partForm.category} />
                    <SummaryCard label="Price" value={formatDollars(centsFromDollars(partForm.price))} />
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                    <span>Seller plan: {sellerPlan.sellerPlan === 'starter' ? 'Starter' : 'Pro'}</span>
                    <span>{partForm.media.length} media attachment{partForm.media.length === 1 ? '' : 's'}</span>
                  </div>
                </section>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {step === 1 && (
                <section className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-slate-950">Step 1. Identify Document</h3>
                      <p className="text-sm text-slate-600">AI assist can infer the title, type, and applicability from the name or number.</p>
                    </div>
                    <Button onClick={identifyDocument} disabled={busy || !(documentForm.title || documentForm.documentNumber || documentForm.fileName)}>
                      {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                      AI Assist
                    </Button>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Document title" value={documentForm.title} onChange={(value) => setDocumentForm((current) => ({ ...current, title: value }))} />
                    <Field label="Document number" value={documentForm.documentNumber} onChange={(value) => setDocumentForm((current) => ({ ...current, documentNumber: value }))} />
                    <SelectField
                      label="Document type"
                      value={documentForm.documentType}
                      onChange={(value) => setDocumentForm((current) => ({ ...current, documentType: value as DocumentMarketplaceType }))}
                      options={DOCUMENT_TYPES.map((type) => ({ value: type.id, label: type.label }))}
                    />
                    <Field label="Manufacturer" value={documentForm.manufacturer} onChange={(value) => setDocumentForm((current) => ({ ...current, manufacturer: value }))} />
                    <Field label="Aircraft applicability" value={documentForm.aircraftApplicability} onChange={(value) => setDocumentForm((current) => ({ ...current, aircraftApplicability: value }))} />
                    <Field label="Revision" value={documentForm.revision} onChange={(value) => setDocumentForm((current) => ({ ...current, revision: value }))} />
                  </div>
                  <TextareaField label="Description" value={documentForm.description} onChange={(value) => setDocumentForm((current) => ({ ...current, description: value }))} />
                  {documentLookup && (
                    <div className="rounded-2xl border border-brand-200 bg-brand-50 p-4 text-sm text-brand-900">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4" />
                        Confidence: {documentLookup.confidence}
                      </div>
                      <p className="mt-1 font-medium">{documentLookup.title}</p>
                      <p className="text-brand-700">{getDocumentTypeLabel(documentLookup.documentType)}</p>
                    </div>
                  )}
                </section>
              )}

              {step === 2 && (
                <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
                  <h3 className="font-semibold text-slate-950">Step 2. Upload File</h3>
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center text-sm text-slate-600">
                    <BookOpen className="mx-auto h-10 w-10 text-slate-400" />
                    <p className="mt-3 font-medium text-slate-900">
                      {isEditingDocument
                        ? 'Keep the current source PDF and update the marketplace behavior around it'
                        : 'Upload a PDF for marketplace access and inject workflows'}
                    </p>
                    <p className="mt-1">
                      {isEditingDocument
                        ? 'This edit flow updates metadata and access settings. The source PDF stays attached to the listing.'
                        : 'The uploaded document will use the same document system as the aircraft workspace, so it can later be downloaded or injected cleanly.'}
                    </p>
                    {!isEditingDocument && (
                      <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm">
                        <FileUp className="h-4 w-4" />
                        Choose PDF
                        <input
                          type="file"
                          accept="application/pdf"
                          className="hidden"
                          onChange={(event) => {
                            const file = event.target.files?.[0] ?? null
                            setDocumentFile(file)
                            if (file) {
                              setDocumentForm((current) => ({
                                ...current,
                                fileName: file.name,
                                title: current.title || file.name.replace(/\.pdf$/i, ''),
                              }))
                            }
                          }}
                        />
                      </label>
                    )}
                  </div>
                  <Field label="File name" value={documentForm.fileName} onChange={(value) => setDocumentForm((current) => ({ ...current, fileName: value }))} placeholder="C172S_Maintenance_Manual_Rev12.pdf" />
                  {documentFile && (
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                      <p className="font-medium text-slate-900">{documentFile.name}</p>
                      <p className="mt-1">{formatBytes(documentFile.size)} · PDF ready for upload</p>
                    </div>
                  )}
                  {isEditingDocument && !documentFile && (
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                      <p className="font-medium text-slate-900">{documentForm.fileName}</p>
                      <p className="mt-1">The linked source PDF will stay in place. Use Documents later if you want to replace the underlying file itself.</p>
                    </div>
                  )}
                </section>
              )}

              {step === 3 && (
                <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
                  <h3 className="font-semibold text-slate-950">Step 3. Access Settings</h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    <SelectField
                      label="Access type"
                      value={documentForm.accessType}
                      onChange={(value) => setDocumentForm((current) => ({ ...current, accessType: value as MarketplaceDocumentListing['accessType'] }))}
                      options={[
                        { value: 'free', label: 'Free' },
                        { value: 'paid', label: 'Paid' },
                        { value: 'private', label: 'Private' },
                      ]}
                    />
                    <SelectField
                      label="Listing status"
                      value={documentForm.listingStatus}
                      onChange={(value) => setDocumentForm((current) => ({ ...current, listingStatus: value as MarketplaceDocumentListing['listingStatus'] }))}
                      options={[
                        { value: 'draft', label: 'Draft' },
                        { value: 'pending_review', label: 'Pending review' },
                        { value: 'published', label: 'Published' },
                      ]}
                    />
                    <Field label="Price" value={documentForm.price} onChange={(value) => setDocumentForm((current) => ({ ...current, price: value }))} />
                  </div>
                  {aircraftOptions.length > 0 && (
                    <SelectField
                      label="Inject target default"
                      value={selectedAircraftId}
                      onChange={setSelectedAircraftId}
                      options={aircraftOptions.map((aircraft) => ({ value: aircraft.id, label: aircraft.label }))}
                    />
                  )}
                  <div className="flex flex-wrap gap-4 text-sm text-slate-700">
                    <ToggleField label="Downloadable" checked={documentForm.downloadable} onChange={(checked) => setDocumentForm((current) => ({ ...current, downloadable: checked }))} />
                    <ToggleField label="Injectable" checked={documentForm.injectable} onChange={(checked) => setDocumentForm((current) => ({ ...current, injectable: checked }))} />
                    <ToggleField label="Preview available" checked={documentForm.previewAvailable} onChange={(checked) => setDocumentForm((current) => ({ ...current, previewAvailable: checked }))} />
                  </div>
                  <div className="rounded-2xl border border-brand-200 bg-brand-50 p-4 text-sm text-brand-900">
                    <p className="font-medium">Inject helper copy</p>
                    <p className="mt-1 leading-6">
                      Inject adds this document into your aircraft or workspace records inside myaircraft.us. The file is stored in your system, indexed for AI search, and becomes searchable in your assistant workflows.
                    </p>
                  </div>
                </section>
              )}

              {step === 4 && (
                <section className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                  <h3 className="font-semibold text-slate-950">Step 4. Review & Publish</h3>
                  <div className="grid gap-3 md:grid-cols-2">
                    <SummaryCard label="Title" value={documentForm.title || documentLookup?.title || 'Untitled document'} />
                    <SummaryCard label="Type" value={getDocumentTypeLabel(documentForm.documentType)} />
                    <SummaryCard label="Access" value={documentForm.accessType} />
                    <SummaryCard label="File" value={documentForm.fileName || 'No file chosen'} />
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                    {selectedAircraftId
                      ? `Default aircraft target: ${aircraftOptions.find((aircraft) => aircraft.id === selectedAircraftId)?.label ?? currentAircraftLabel ?? 'Workspace-selected aircraft'}`
                      : 'This listing can be injected into the current workspace later.'}
                  </div>
                </section>
              )}
            </div>
          )}

          <Separator />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-slate-600">
            {kind === 'part'
                ? 'Physical part listings use direct buyer contact and seller-plan enforcement.'
                : 'Manual / catalog listings support download, injection, and AI-searchable workspace storage.'}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={close} disabled={busy}>
                Cancel
              </Button>
              <Button variant="outline" onClick={() => setStep((current) => Math.max(1, current - 1))} disabled={busy || step === 1}>
                Back
              </Button>
              {step < 4 ? (
                <Button onClick={() => setStep((current) => Math.min(4, current + 1))} disabled={busy}>
                  Next
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => (kind === 'part' ? publishPartListing('draft') : publishDocumentListing('draft'))}
                    disabled={busy}
                  >
                    {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save as draft
                  </Button>
                  <Button
                    onClick={() => (kind === 'part' ? publishPartListing('available') : publishDocumentListing('published'))}
                    disabled={busy}
                  >
                    {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {isEditingPart || isEditingDocument ? 'Save changes' : 'Publish'}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  return (
    <div className="space-y-2">
      <Label className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</Label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="rounded-xl border-slate-200 bg-white" />
    </div>
  )
}

function TextareaField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="space-y-2">
      <Label className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</Label>
      <Textarea value={value} onChange={(event) => onChange(event.target.value)} className="min-h-[110px] rounded-xl border-slate-200 bg-white" />
    </div>
  )
}

function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex items-center gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border-slate-300 text-brand-600"
      />
      <span>{label}</span>
    </label>
  )
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
}) {
  return (
    <div className="space-y-2">
      <Label className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</Label>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm">
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-950">{value}</p>
    </div>
  )
}
