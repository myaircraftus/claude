import Link from '@/components/shared/tenant-link'
import { Button } from '@/components/ui/button'
import type { Document } from '@/types'
import {
  DOCUMENT_TAXONOMY_GROUPS,
  resolveStoredDocumentClassification,
} from '@/lib/documents/taxonomy'
import { getRelevantDocumentGroups } from '@/lib/aircraft/operations'

function summarizeLeaf(documents: Document[]) {
  const historicalCount = documents.filter((doc) => doc.book_assignment === 'historical').length
  const currentCount = Math.max(documents.length - historicalCount, 0)
  const processingCount = documents.filter((doc) => doc.parsing_status !== 'completed').length

  return { historicalCount, currentCount, processingCount }
}

export function DocumentVaultTree({
  aircraftId,
  documents,
  operationTypes,
}: {
  aircraftId: string
  documents: Document[]
  operationTypes?: string[] | null
}) {
  const relevantGroups = getRelevantDocumentGroups(operationTypes)
  const visibleGroups =
    relevantGroups.length > 0
      ? DOCUMENT_TAXONOMY_GROUPS.filter((group) => relevantGroups.includes(group.id))
      : DOCUMENT_TAXONOMY_GROUPS
  const groupedDocs = documents.reduce<Record<string, Document[]>>((acc, document) => {
    const classification = resolveStoredDocumentClassification(document)
    acc[classification.detailId] = [...(acc[classification.detailId] ?? []), document]
    return acc
  }, {})

  return (
    <div className="space-y-3">
      {relevantGroups.length > 0 && (
        <div className="rounded-lg border border-brand-100 bg-brand-50/70 px-4 py-3 text-sm text-muted-foreground">
          Showing the document structure most relevant to this aircraft’s operation profile. Existing records stay preserved even if the profile changes later.
        </div>
      )}

      {visibleGroups.map((group) => {
        const totalInGroup = group.details.reduce(
          (sum, detail) => sum + (groupedDocs[detail.id]?.length ?? 0),
          0
        )

        return (
          <details
            key={group.id}
            open={totalInGroup > 0}
            className="rounded-xl border border-border bg-card overflow-hidden"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-foreground">{group.label}</p>
                <p className="text-xs text-muted-foreground">
                  {totalInGroup > 0
                    ? `${totalInGroup} uploaded document${totalInGroup === 1 ? '' : 's'}`
                    : 'No uploaded documents yet'}
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span
                  className={`rounded-full border px-2 py-0.5 ${
                    totalInGroup > 0
                      ? 'border-green-200 bg-green-50 text-green-700'
                      : 'border-amber-200 bg-amber-50 text-amber-700'
                  }`}
                >
                  {totalInGroup > 0 ? 'Active' : 'Missing'}
                </span>
              </div>
            </summary>

            <div className="border-t border-border">
              {group.details.map((detail) => {
                const leafDocs = groupedDocs[detail.id] ?? []
                const summary = summarizeLeaf(leafDocs)

                return (
                  <div
                    key={detail.id}
                    className="flex flex-col gap-3 border-b border-border/70 px-4 py-3 last:border-b-0 md:flex-row md:items-center md:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{detail.label}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {leafDocs.length === 0 ? (
                          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-700">
                            Missing
                          </span>
                        ) : (
                          <>
                            <span className="rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-green-700">
                              Uploaded {leafDocs.length}
                            </span>
                            {summary.currentCount > 0 && <span>Current {summary.currentCount}</span>}
                            {summary.historicalCount > 0 && <span>Historical {summary.historicalCount}</span>}
                            {summary.processingCount > 0 && <span>Processing {summary.processingCount}</span>}
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" asChild>
                        <Link
                          href={`/documents/upload?aircraft=${aircraftId}&document_group=${group.id}&document_detail=${detail.id}`}
                        >
                          Upload
                        </Link>
                      </Button>
                      <Button size="sm" variant="ghost" asChild>
                        <Link
                          href={`/scanner?aircraft=${aircraftId}&document_group=${group.id}&document_detail=${detail.id}`}
                        >
                          Scan
                        </Link>
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </details>
        )
      })}
    </div>
  )
}
