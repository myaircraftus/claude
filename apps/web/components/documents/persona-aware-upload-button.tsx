'use client'

/**
 * Phase 13.2 — persona-aware upload button.
 *
 * Thin trigger that owns the modal's open state. Drop into any page as
 * the new persona-strict alternative to the legacy upload dropzone. Per
 * the Phase 13 brief, every persona sees a different label + scope:
 *
 *   - Owner    → "Upload Aircraft Document"
 *   - Mechanic → "Upload Reference Doc"
 *   - Shop     → "Upload Document"
 *   - Admin    → "Upload Any"
 *
 * Pre-selecting an aircraft (e.g. when launched from /aircraft/[id]) locks
 * the aircraft selector inside the modal.
 */
import { useState } from 'react'
import { Upload } from 'lucide-react'
import type { Persona } from '@/types'
import { Button } from '@/components/ui/button'
import {
  PersonaAwareUploadModal,
  type AircraftOption,
} from './persona-aware-upload-modal'
import type { DocumentType } from '@/lib/documents/persona-taxonomy'
import type { TierSlug } from '@/lib/billing/pricing-config'

export interface PersonaAwareUploadButtonProps {
  persona: Persona
  organizationId: string
  aircraftOptions: AircraftOption[]
  defaultAircraftId?: string
  /** Override the auto-generated label. */
  label?: string
  /** Variant for the trigger button. */
  variant?: 'default' | 'outline' | 'secondary' | 'ghost'
  size?: 'default' | 'sm' | 'lg'
  onUploaded?: (documentId: string, documentType: DocumentType) => void
  /** Phase 14 — effective tier for the SLA banner inside the modal. */
  effectiveTier?: TierSlug
}

export function PersonaAwareUploadButton({
  persona,
  organizationId,
  aircraftOptions,
  defaultAircraftId,
  label,
  variant = 'default',
  size = 'default',
  onUploaded,
  effectiveTier,
}: PersonaAwareUploadButtonProps) {
  const [open, setOpen] = useState(false)
  const buttonLabel = label ?? defaultLabelForPersona(persona)

  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)}>
        <Upload className="mr-1.5 h-4 w-4" />
        {buttonLabel}
      </Button>
      <PersonaAwareUploadModal
        persona={persona}
        organizationId={organizationId}
        aircraftOptions={aircraftOptions}
        defaultAircraftId={defaultAircraftId}
        open={open}
        onOpenChange={setOpen}
        onUploaded={onUploaded}
        effectiveTier={effectiveTier}
      />
    </>
  )
}

function defaultLabelForPersona(persona: Persona): string {
  switch (persona) {
    case 'owner':
      return 'Upload Aircraft Document'
    case 'shop':
      // Post Phase-18 the shop label spans both the legacy mechanic
      // "Upload Reference Doc" and the previous shop "Upload Document"
      // surfaces. We use the broader copy because shop now covers both.
      return 'Upload Document'
    case 'admin':
      return 'Upload Any'
    default:
      return 'Upload'
  }
}
