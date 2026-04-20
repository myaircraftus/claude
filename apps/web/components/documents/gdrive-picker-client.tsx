'use client'

import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import Link from '@/components/shared/tenant-link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatBytes, formatDateTime } from '@/lib/utils'
import {
  DOCUMENT_TAXONOMY_GROUPS,
  deriveDocTypeFromClassification,
  getDocumentItemsForGroup,
  isDocumentGroupId,
} from '@/lib/documents/taxonomy'
import {
  getDocumentClassificationSummary,
  searchDocumentTaxonomy,
} from '@/lib/documents/classification'
import { CheckCircle2, FileText, FolderOpen, Loader2 } from 'lucide-react'
import type { DocType } from '@/types'

interface AircraftOption {
  id: string
  tail_number: string
  make: string
  model: string
}

interface DriveFile {
  id: string
  name: string
  size?: number
  modifiedTime?: string
}

interface GdrivePickerClientProps {
  aircraftOptions: AircraftOption[]
  defaultAircraftId?: string
  defaultDocType: DocType
  defaultDocumentGroupId: string
  defaultDocumentDetailId: string
  defaultDocumentSubtype?: string
  googleEmail: string | null
}

export function GdrivePickerClient({
  aircraftOptions,
  defaultAircraftId,
  defaultDocType,
  defaultDocumentGroupId,
  defaultDocumentDetailId,
  defaultDocumentSubtype,
  googleEmail,
}: GdrivePickerClientProps) {
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [fileSearch, setFileSearch] = useState('')
  const [classificationSearch, setClassificationSearch] = useState('')
  const [aircraftId, setAircraftId] = useState(defaultAircraftId ?? '__none__')
  const [documentGroupId, setDocumentGroupId] = useState(defaultDocumentGroupId)
  const [documentDetailId, setDocumentDetailId] = useState(defaultDocumentDetailId)
  const [documentSubtype, setDocumentSubtype] = useState(defaultDocumentSubtype ?? '')
  const [importing, setImporting] = useState(false)
  const [importResults, setImportResults] = useState<{
    imported: number
    failed: number
    results: Array<{ file_id: string; name?: string; status: string; error?: string }>
  } | null>(null)

  const deferredFileSearch = useDeferredValue(fileSearch)
  const deferredClassificationSearch = useDeferredValue(classificationSearch)
  const classificationMatches = useMemo(
    () => searchDocumentTaxonomy(deferredClassificationSearch),
    [deferredClassificationSearch]
  )
  const selectedClassificationProfile = useMemo(
    () => getDocumentClassificationSummary(documentDetailId),
    [documentDetailId]
  )

  useEffect(() => {
    async function loadFiles() {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch('/api/gdrive/files', { cache: 'no-store' })
        const json = await response.json()
        if (!response.ok) {
          throw new Error(json.error ?? 'Failed to load Google Drive files')
        }
        setDriveFiles(json.files ?? [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load Google Drive files')
      } finally {
        setLoading(false)
      }
    }

    loadFiles()
  }, [])

  useEffect(() => {
    if (!isDocumentGroupId(documentGroupId)) return
    const nextItems = getDocumentItemsForGroup(documentGroupId)
    if (nextItems.length === 0) return
    if (!nextItems.some((item) => item.id === documentDetailId)) {
      setDocumentDetailId(nextItems[0].id)
    }
  }, [documentDetailId, documentGroupId])

  const filteredFiles = useMemo(() => {
    const query = deferredFileSearch.trim().toLowerCase()
    if (!query) return driveFiles
    return driveFiles.filter((file) => file.name.toLowerCase().includes(query))
  }, [deferredFileSearch, driveFiles])

  function toggleFile(fileId: string) {
    setSelectedIds((prev) =>
      prev.includes(fileId) ? prev.filter((id) => id !== fileId) : [...prev, fileId]
    )
  }

  async function handleImport() {
    if (selectedIds.length === 0 || importing) return
    setImporting(true)
    setError(null)
    try {
      const response = await fetch('/api/gdrive/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_ids: selectedIds,
          aircraft_id: aircraftId === '__none__' ? undefined : aircraftId,
          doc_type: deriveDocTypeFromClassification(documentDetailId, defaultDocType),
          document_group: documentGroupId,
          document_detail: documentDetailId,
          document_subtype: documentSubtype || undefined,
        }),
      })
      const json = await response.json()
      if (!response.ok) {
        throw new Error(json.error ?? 'Import failed')
      }
      setImportResults(json)
      setSelectedIds([])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.35fr_0.95fr]">
      <section className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="border-b border-border px-5 py-4 space-y-1">
          <div className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-blue-600" />
            <h2 className="text-base font-semibold text-foreground">Google Drive files</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            {googleEmail ? `Connected as ${googleEmail}` : 'Browse PDFs from your connected Google Drive account.'}
          </p>
        </div>

        <div className="px-5 py-4 border-b border-border">
          <Input
            value={fileSearch}
            onChange={(e) => setFileSearch(e.target.value)}
            placeholder="Search Drive files"
            className="h-9 text-sm"
          />
        </div>

        <ScrollArea className="h-[520px]">
          <div className="p-3 space-y-2">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading Google Drive files…
              </div>
            ) : error ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {error}
              </div>
            ) : filteredFiles.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                No PDF files matched this search.
              </div>
            ) : (
              filteredFiles.map((file) => {
                const checked = selectedIds.includes(file.id)
                return (
                  <button
                    key={file.id}
                    type="button"
                    onClick={() => toggleFile(file.id)}
                    className={`w-full rounded-lg border px-4 py-3 text-left transition-colors ${
                      checked
                        ? 'border-brand-400 bg-brand-50'
                        : 'border-border bg-background hover:border-brand-200 hover:bg-muted/30'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 h-4 w-4 rounded border ${checked ? 'bg-brand-600 border-brand-600' : 'border-border bg-background'}`}>
                        {checked && <CheckCircle2 className="h-4 w-4 text-white" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {file.size ? formatBytes(file.size) : 'Unknown size'}
                          {file.modifiedTime ? ` · Updated ${formatDateTime(file.modifiedTime)}` : ''}
                        </p>
                      </div>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </ScrollArea>
      </section>

      <section className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-foreground">Import settings</h2>
          <p className="text-xs text-muted-foreground">
            Choose where these files belong before importing. The exact type can still be refined later.
          </p>
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-medium text-muted-foreground">Search category or document type</Label>
          <Input
            value={classificationSearch}
            onChange={(e) => setClassificationSearch(e.target.value)}
            placeholder="Try: engine logbook, 337, 100 hour, service bulletin"
            className="h-9 text-sm"
          />
          {classificationSearch.trim().length > 0 && (
            <div className="rounded-lg border border-border bg-background p-2 space-y-1">
              {classificationMatches.length > 0 ? (
                classificationMatches.slice(0, 5).map((match) => (
                  <button
                    key={`${match.groupId}:${match.detailId}`}
                    type="button"
                    onClick={() => {
                      setDocumentGroupId(match.groupId)
                      setDocumentDetailId(match.detailId)
                      setClassificationSearch(match.detailLabel)
                    }}
                    className="w-full rounded-md border border-transparent px-3 py-2 text-left hover:border-brand-200 hover:bg-brand-50 transition-colors"
                  >
                    <p className="text-sm font-medium text-foreground">{match.detailLabel}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {match.groupLabel} · {match.profile.truthRole.replace(/_/g, ' ')}
                    </p>
                  </button>
                ))
              ) : (
                <p className="px-2 py-1 text-xs text-muted-foreground">No close category match yet.</p>
              )}
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Aircraft</Label>
          <Select value={aircraftId} onValueChange={setAircraftId}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Aircraft (optional)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">No aircraft (general)</SelectItem>
              {aircraftOptions.map((ac) => (
                <SelectItem key={ac.id} value={ac.id}>
                  {ac.tail_number} — {ac.make} {ac.model}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Major document section</Label>
          <Select value={documentGroupId} onValueChange={setDocumentGroupId}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DOCUMENT_TAXONOMY_GROUPS.map((group) => (
                <SelectItem key={group.id} value={group.id}>
                  {group.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Exact document type</Label>
          <Select value={documentDetailId} onValueChange={setDocumentDetailId}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {getDocumentItemsForGroup(documentGroupId).map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Subtype / volume</Label>
          <Input
            value={documentSubtype}
            onChange={(e) => setDocumentSubtype(e.target.value)}
            placeholder="Optional, e.g. Volume 1"
            className="h-9 text-sm"
          />
        </div>

        {selectedClassificationProfile && (
          <div className="rounded-xl border border-border bg-muted/30 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="text-xs">{selectedClassificationProfile.groupLabel}</Badge>
              <Badge variant="secondary" className="text-xs">{selectedClassificationProfile.detailLabel}</Badge>
              <Badge variant="secondary" className="text-xs capitalize">
                {selectedClassificationProfile.truthRole.replace(/_/g, ' ')}
              </Badge>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Record family: {selectedClassificationProfile.recordFamily.replace(/_/g, ' ')} ·
              Parser: {selectedClassificationProfile.parserStrategy.replace(/_/g, ' ')} ·
              Review priority: {selectedClassificationProfile.reviewPriority}
            </p>
          </div>
        )}

        {importResults && (
          <div className="rounded-xl border border-border bg-background p-3 text-sm space-y-1">
            <p className="font-medium text-foreground">
              Imported {importResults.imported} file{importResults.imported === 1 ? '' : 's'}
              {importResults.failed > 0 ? ` · ${importResults.failed} failed` : ''}
            </p>
            <div className="space-y-1 text-xs text-muted-foreground">
              {importResults.results.slice(0, 5).map((result) => (
                <p key={result.file_id}>
                  {result.name ?? result.file_id} · {result.status}
                  {result.error ? ` · ${result.error}` : ''}
                </p>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 pt-2">
          <Button variant="outline" asChild>
            <Link href="/documents/upload">Back to upload</Link>
          </Button>
          <Button onClick={handleImport} disabled={selectedIds.length === 0 || importing}>
            {importing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Importing…
              </>
            ) : (
              `Import ${selectedIds.length > 0 ? selectedIds.length : ''} file${selectedIds.length === 1 ? '' : 's'}`
            )}
          </Button>
        </div>
      </section>
    </div>
  )
}
