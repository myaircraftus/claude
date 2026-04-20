'use client'

import { useEffect, useState } from 'react'
import Link from '@/components/shared/tenant-link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { HardDrive, ExternalLink, CheckCircle2, Loader2, FolderOpen } from 'lucide-react'

interface GdriveImportSectionProps {
  connected: boolean
  googleEmail: string | null
  defaultAircraftId?: string
  defaultDocumentGroupId?: string
  defaultDocumentDetailId?: string
  defaultDocumentSubtype?: string
}

function getPersistedOwnerAircraftId() {
  if (typeof window === 'undefined') return undefined
  const value = window.localStorage.getItem('owner_selected_aircraft_id')?.trim()
  return value ? value : undefined
}

export function GdriveImportSection({
  connected,
  googleEmail,
  defaultAircraftId,
  defaultDocumentGroupId,
  defaultDocumentDetailId,
  defaultDocumentSubtype,
}: GdriveImportSectionProps) {
  const [connecting, setConnecting] = useState(false)
  const [resolvedAircraftId, setResolvedAircraftId] = useState<string | undefined>(
    () => defaultAircraftId ?? getPersistedOwnerAircraftId()
  )

  useEffect(() => {
    setResolvedAircraftId(defaultAircraftId ?? getPersistedOwnerAircraftId())
  }, [defaultAircraftId])

  const pickerParams = new URLSearchParams()
  if (resolvedAircraftId) pickerParams.set('aircraft', resolvedAircraftId)
  if (defaultDocumentGroupId) pickerParams.set('document_group', defaultDocumentGroupId)
  if (defaultDocumentDetailId) pickerParams.set('document_detail', defaultDocumentDetailId)
  if (defaultDocumentSubtype) pickerParams.set('document_subtype', defaultDocumentSubtype)
  const pickerHref = `/documents/gdrive-picker${pickerParams.toString() ? `?${pickerParams.toString()}` : ''}`

  async function handleConnect() {
    setConnecting(true)
    try {
      // Redirect to OAuth flow
      window.location.href = '/api/gdrive/auth'
    } catch {
      setConnecting(false)
    }
  }

  if (!connected) {
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center space-y-4">
        <div className="flex justify-center">
          <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center">
            <HardDrive className="h-5 w-5 text-blue-500" />
          </div>
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">Connect Google Drive</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
            Link your Google Drive account to import PDFs directly without downloading them first.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleConnect}
          disabled={connecting}
          className="mx-auto"
        >
          {connecting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Redirecting…
            </>
          ) : (
            <>
              <HardDrive className="mr-2 h-4 w-4" />
              Connect Google Drive
            </>
          )}
        </Button>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      {/* Connected state header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <span className="text-sm font-medium text-foreground">Google Drive connected</span>
          {googleEmail && (
            <Badge variant="secondary" className="text-xs font-normal">
              {googleEmail}
            </Badge>
          )}
        </div>
        <Link
          href="/settings/integrations"
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
        >
          Manage
          <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      {/* File picker trigger */}
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          Open the Google Drive file picker to select PDFs to import into your document library.
        </p>
        <Button
          variant="outline"
          size="sm"
          asChild
        >
          <Link href={pickerHref}>
            <FolderOpen className="mr-2 h-4 w-4" />
            Browse Google Drive
          </Link>
        </Button>
      </div>
    </div>
  )
}
