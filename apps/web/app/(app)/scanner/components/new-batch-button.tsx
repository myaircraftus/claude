'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTenantRouter } from '@/components/shared/tenant-link'
import { Plus, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DOCUMENT_TAXONOMY_GROUPS,
  findDocumentSelection,
  getDocumentItemsForGroup,
  inferScannerBatchClassification,
  isDocumentGroupId,
} from '@/lib/documents/taxonomy'
import {
  getScanTimeBatchClassOption,
  inferScanTimeBatchClass,
  SCAN_TIME_BATCH_CLASSES,
  searchDocumentTaxonomy,
} from '@/lib/documents/classification'

interface Aircraft { id: string; tail_number: string; make?: string | null; model?: string | null }

export function NewBatchButton({
  aircraft,
  defaultAircraftId,
  defaultDocumentGroupId,
  defaultDocumentDetailId,
  defaultDocumentSubtype,
}: {
  aircraft: Aircraft[]
  defaultAircraftId?: string
  defaultDocumentGroupId?: string
  defaultDocumentDetailId?: string
  defaultDocumentSubtype?: string
}) {
  const router = useTenantRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [title, setTitle] = useState('')
  const [batchType, setBatchType] = useState('airframe_logbook')
  const [aircraftId, setAircraftId] = useState<string>(defaultAircraftId ?? '')
  const [scanClassId, setScanClassId] = useState<string>(
    inferScanTimeBatchClass(defaultDocumentGroupId, defaultDocumentDetailId)
  )
  const [documentGroupId, setDocumentGroupId] = useState<string>(
    defaultDocumentGroupId ?? DOCUMENT_TAXONOMY_GROUPS[0]?.id ?? ''
  )
  const [documentDetailId, setDocumentDetailId] = useState<string>(defaultDocumentDetailId ?? '')
  const [documentSubtype, setDocumentSubtype] = useState<string>(defaultDocumentSubtype ?? '')
  const [bookNumber, setBookNumber] = useState('')
  const [bookType, setBookType] = useState('')
  const [bookAssignment, setBookAssignment] = useState('')
  const [classificationQuery, setClassificationQuery] = useState('')
  const [error, setError] = useState<string | null>(null)

  const taxonomyMatches = useMemo(
    () => (classificationQuery.trim() ? searchDocumentTaxonomy(classificationQuery.trim()).slice(0, 6) : []),
    [classificationQuery]
  )

  useEffect(() => {
    if (!isDocumentGroupId(documentGroupId)) return
    const details = getDocumentItemsForGroup(documentGroupId)
    if (details.length === 0) return
    if (!details.some((item) => item.id === documentDetailId)) {
      setDocumentDetailId(details[0].id)
    }
  }, [documentDetailId, documentGroupId])

  useEffect(() => {
    const selection = findDocumentSelection(documentGroupId, documentDetailId)
    if (!selection) return
    const inferred = inferScannerBatchClassification(selection)
    setBatchType(inferred.batchType)
    setScanClassId(inferScanTimeBatchClass(documentGroupId, documentDetailId))
  }, [documentDetailId, documentGroupId])

  function applyScanClass(nextScanClassId: string) {
    setScanClassId(nextScanClassId)
    const option = getScanTimeBatchClassOption(nextScanClassId)
    if (!option) return
    setDocumentGroupId(option.groupId)
    setDocumentDetailId(option.detailId)
  }

  async function create() {
    setBusy(true); setError(null)
    try {
      const resp = await fetch('/api/scanner/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title || null,
          batch_type: batchType,
          source_mode: batchType === 'evidence_batch' ? 'evidence' : 'batch',
          aircraft_id: aircraftId || null,
          document_group_id: documentGroupId || null,
          document_detail_id: documentDetailId || null,
          document_subtype: documentSubtype || null,
          book_number: bookNumber || null,
          book_type: bookType || null,
          book_assignment: bookAssignment || null,
        }),
      })
      const j = await resp.json()
      if (!resp.ok) throw new Error(j.error ?? 'Create failed')
      setOpen(false)
      router.push(`/scanner/${j.id}`)
    } catch (err: any) {
      setError(err?.message ?? 'Create failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} className="h-8 text-xs">
        <Plus className="h-3.5 w-3.5 mr-1" />
        New batch
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-xl bg-card border border-border p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-foreground">Start new scan batch</h2>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-foreground">Title</label>
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. N12345 engine logbook 2018-2023"
                  className="mt-1 w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground">Quick scan class</label>
                <select
                  value={scanClassId}
                  onChange={e => applyScanClass(e.target.value)}
                  className="mt-1 w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {SCAN_TIME_BATCH_CLASSES.map((option) => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Fast scan-time routing. You can refine the exact slot below if needed.
                </p>
              </div>
              <div>
                <label className="text-xs font-medium text-foreground">Aircraft</label>
                <select
                  value={aircraftId}
                  onChange={e => setAircraftId(e.target.value)}
                  className="mt-1 w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">Unassigned</option>
                  {aircraft.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.tail_number}{a.make && a.model ? ` · ${a.make} ${a.model}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium text-foreground">Logbook #</label>
                  <input
                    value={bookNumber}
                    onChange={e => setBookNumber(e.target.value)}
                    placeholder="e.g. 1"
                    className="mt-1 w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-foreground">Book type</label>
                  <input
                    value={bookType}
                    onChange={e => setBookType(e.target.value)}
                    placeholder="airframe / engine / prop"
                    className="mt-1 w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-foreground">Book assignment</label>
                <select
                  value={bookAssignment}
                  onChange={e => setBookAssignment(e.target.value)}
                  className="mt-1 w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">Unspecified</option>
                  <option value="present">Present</option>
                  <option value="historical">Historical</option>
                </select>
              </div>
              <details className="rounded-lg border border-border bg-muted/20 px-3 py-2">
                <summary className="cursor-pointer text-xs font-medium text-foreground">
                  Advanced classification
                </summary>
                <div className="mt-3 space-y-3">
                  <div>
                    <label className="text-xs font-medium text-foreground">Search category or document type</label>
                    <input
                      value={classificationQuery}
                      onChange={e => setClassificationQuery(e.target.value)}
                      placeholder="e.g. 337, engine logbook, service bulletin"
                      className="mt-1 w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    {taxonomyMatches.length > 0 && (
                      <div className="mt-2 rounded-md border border-border bg-background overflow-hidden">
                        {taxonomyMatches.map(match => (
                          <button
                            key={`${match.groupId}:${match.detailId}`}
                            type="button"
                            onClick={() => {
                              setDocumentGroupId(match.groupId)
                              setDocumentDetailId(match.detailId)
                              setScanClassId(inferScanTimeBatchClass(match.groupId, match.detailId))
                              setClassificationQuery(match.detailLabel)
                            }}
                            className="flex w-full items-start justify-between gap-3 border-b border-border/70 px-3 py-2 text-left last:border-b-0 hover:bg-muted/40"
                          >
                            <div>
                              <p className="text-xs font-medium text-foreground">{match.detailLabel}</p>
                              <p className="text-[11px] text-muted-foreground">{match.groupLabel}</p>
                            </div>
                            <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
                              {match.profile.recordFamily.replace(/_/g, ' ')}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="text-xs font-medium text-foreground">Major document section</label>
                    <select
                      value={documentGroupId}
                      onChange={e => setDocumentGroupId(e.target.value)}
                      className="mt-1 w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      {DOCUMENT_TAXONOMY_GROUPS.map(group => (
                        <option key={group.id} value={group.id}>{group.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-foreground">Exact document type</label>
                    <select
                      value={documentDetailId}
                      onChange={e => setDocumentDetailId(e.target.value)}
                      className="mt-1 w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      {getDocumentItemsForGroup(documentGroupId).map(item => (
                        <option key={item.id} value={item.id}>{item.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-foreground">Subtype / volume</label>
                    <input
                      value={documentSubtype}
                      onChange={e => setDocumentSubtype(e.target.value)}
                      placeholder="Optional, e.g. Volume 3"
                      className="mt-1 w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                </div>
              </details>

              <p className="text-[11px] text-muted-foreground">
                Internal routing: {batchType.replace(/_/g, ' ')}
              </p>
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
              <Button size="sm" onClick={create} disabled={busy}>
                {busy ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />Creating…</> : 'Create & Capture'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
