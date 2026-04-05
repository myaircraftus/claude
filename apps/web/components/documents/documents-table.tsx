'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { DocumentDetailSlideover } from '@/components/documents/document-detail-slideover'
import { cn, formatBytes, formatDate, DOC_TYPE_LABELS, PARSING_STATUS_LABELS } from '@/lib/utils'
import { FileText, Plane, Lock, Unlock, Users } from 'lucide-react'
import { createBrowserSupabase } from '@/lib/supabase/browser'
import type { Document, ParsingStatus } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface DocumentRow extends Document {
  aircraft: { id: string; tail_number: string; make: string; model: string } | null
}

interface DocumentsTableProps {
  documents: DocumentRow[]
  totalCount: number
  currentUserId: string
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ParsingStatus }) {
  const colorMap: Record<ParsingStatus, string> = {
    queued: 'bg-slate-100 text-slate-700 border-slate-200',
    parsing: 'bg-blue-50 text-blue-700 border-blue-200',
    chunking: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    embedding: 'bg-violet-50 text-violet-700 border-violet-200',
    completed: 'bg-green-50 text-green-700 border-green-200',
    failed: 'bg-red-50 text-red-700 border-red-200',
    needs_ocr: 'bg-amber-50 text-amber-700 border-amber-200',
    ocr_processing: 'bg-orange-50 text-orange-700 border-orange-200',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border',
        colorMap[status]
      )}
    >
      {PARSING_STATUS_LABELS[status] ?? status}
    </span>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DocumentsTable({ documents, totalCount, currentUserId }: DocumentsTableProps) {
  const [selected, setSelected] = useState<DocumentRow | null>(null)
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())
  const [localDocs, setLocalDocs] = useState(documents)

  async function toggleAllowDownload(doc: DocumentRow, e: React.MouseEvent) {
    e.stopPropagation()
    const supabase = createBrowserSupabase()
    const next = !doc.allow_download
    // Optimistic update
    setLocalDocs((prev) =>
      prev.map((d) => (d.id === doc.id ? { ...d, allow_download: next } : d))
    )
    const { error } = await (supabase as any)
      .from('documents')
      .update({ allow_download: next })
      .eq('id', doc.id)
    if (error) {
      // Revert on error
      setLocalDocs((prev) =>
        prev.map((d) => (d.id === doc.id ? { ...d, allow_download: !next } : d))
      )
    }
  }

  // Keep localDocs in sync when props change (pagination, filters)
  useEffect(() => {
    setLocalDocs(documents)
  }, [documents])
  const docsToRender = localDocs

  function toggleCheck(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    setCheckedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.checked) {
      setCheckedIds(new Set(docsToRender.map((d) => d.id)))
    } else {
      setCheckedIds(new Set())
    }
  }

  if (docsToRender.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 rounded-xl border border-dashed border-border text-center">
        <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mb-3">
          <FileText className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-foreground">No documents found</p>
        <p className="text-xs text-muted-foreground mt-1">
          Try adjusting your filters or upload a new document.
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 border-b border-border">
              <tr>
                <th className="w-10 px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={checkedIds.size === docsToRender.length && docsToRender.length > 0}
                    onChange={toggleAll}
                    className="rounded border-border"
                    aria-label="Select all"
                  />
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  Title
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  Aircraft
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  Type
                </th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  Pages
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  Status
                </th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  Size
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  Uploader
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  Sharing
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  Uploaded
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {docsToRender.map((doc) => (
                <tr
                  key={doc.id}
                  onClick={() => setSelected(doc)}
                  className="cursor-pointer hover:bg-muted/30 transition-colors"
                >
                  {/* Checkbox */}
                  <td className="px-4 py-3" onClick={(e) => toggleCheck(doc.id, e)}>
                    <input
                      type="checkbox"
                      checked={checkedIds.has(doc.id)}
                      onChange={() => {}}
                      className="rounded border-border"
                      aria-label={`Select ${doc.title}`}
                    />
                  </td>

                  {/* Title */}
                  <td className="px-4 py-3 max-w-xs">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="font-medium text-foreground truncate">{doc.title}</span>
                    </div>
                    {doc.description && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5 pl-6">
                        {doc.description}
                      </p>
                    )}
                  </td>

                  {/* Aircraft */}
                  <td className="px-4 py-3">
                    {doc.aircraft ? (
                      <span className="flex items-center gap-1 text-xs font-mono text-foreground">
                        <Plane className="h-3 w-3 text-muted-foreground" />
                        {doc.aircraft.tail_number}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>

                  {/* Type */}
                  <td className="px-4 py-3">
                    <Badge variant="outline" className="text-xs whitespace-nowrap">
                      {DOC_TYPE_LABELS[doc.doc_type] ?? doc.doc_type}
                    </Badge>
                  </td>

                  {/* Pages */}
                  <td className="px-4 py-3 text-right text-xs text-muted-foreground tabular-nums">
                    {doc.page_count != null ? doc.page_count.toLocaleString() : '—'}
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3">
                    <StatusBadge status={doc.parsing_status} />
                  </td>

                  {/* Size */}
                  <td className="px-4 py-3 text-right text-xs text-muted-foreground tabular-nums">
                    {doc.file_size_bytes != null ? formatBytes(doc.file_size_bytes) : '—'}
                  </td>

                  {/* Uploader */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-foreground">
                        {doc.uploaded_by === currentUserId
                          ? 'You'
                          : doc.uploader_name || '—'}
                      </span>
                      {doc.uploader_role && (
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-[10px] px-1 py-0 h-4',
                            doc.uploader_role === 'owner' && 'bg-amber-50 text-amber-700 border-amber-200',
                            doc.uploader_role === 'mechanic' && 'bg-blue-50 text-blue-700 border-blue-200',
                            doc.uploader_role === 'pilot' && 'bg-sky-50 text-sky-700 border-sky-200',
                            doc.uploader_role === 'admin' && 'bg-slate-100 text-slate-700 border-slate-200'
                          )}
                        >
                          {doc.uploader_role}
                        </Badge>
                      )}
                    </div>
                  </td>

                  {/* Sharing */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {doc.uploaded_by === currentUserId ? (
                        <button
                          type="button"
                          onClick={(e) => toggleAllowDownload(doc, e)}
                          className="flex items-center gap-1 text-xs hover:text-foreground text-muted-foreground"
                          title={doc.allow_download ? 'Downloads allowed' : 'Downloads locked'}
                        >
                          {doc.allow_download ? (
                            <Unlock className="h-3.5 w-3.5 text-green-600" />
                          ) : (
                            <Lock className="h-3.5 w-3.5" />
                          )}
                        </button>
                      ) : doc.allow_download ? (
                        <Unlock className="h-3.5 w-3.5 text-green-600" />
                      ) : (
                        <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                      {doc.community_listing && (
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1 py-0 h-4 bg-violet-50 text-violet-700 border-violet-200"
                        >
                          <Users className="h-2.5 w-2.5 mr-0.5" />
                          {doc.manual_access === 'free'
                            ? 'Community · Free'
                            : doc.price_cents != null
                              ? `Community · $${(doc.price_cents / 100).toFixed(2)}`
                              : 'Community'}
                        </Badge>
                      )}
                    </div>
                  </td>

                  {/* Uploaded */}
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {formatDate(doc.uploaded_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Table footer */}
        <div className="px-4 py-2 border-t border-border bg-muted/20 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {totalCount.toLocaleString()} {totalCount === 1 ? 'document' : 'documents'} total
          </span>
          {checkedIds.size > 0 && (
            <span className="text-xs text-foreground font-medium">
              {checkedIds.size} selected
            </span>
          )}
        </div>
      </div>

      {/* Detail slideover */}
      <DocumentDetailSlideover
        document={selected}
        onClose={() => setSelected(null)}
      />
    </>
  )
}
