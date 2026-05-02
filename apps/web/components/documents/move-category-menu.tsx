'use client'

/**
 * Move-to-category dropdown — fix-up tool for when the AI classifier picks
 * the wrong bucket. Click the move icon on a doc row, see a flat list of
 * the most common categories grouped by section, click the target → the
 * doc moves to that bucket via PATCH /api/documents/[id].
 *
 * The full taxonomy has 100+ detail buckets. This menu surfaces the
 * common ones (engine/airframe/prop logbooks, POH, AFM, work order, AD,
 * SB, 337, 8130, weight & balance) and includes a search box for the
 * long tail.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRightLeft, Loader2, Search, Check } from 'lucide-react'
import {
  DOCUMENT_TAXONOMY_GROUPS,
  deriveDocTypeFromClassification,
} from '@/lib/documents/taxonomy'
import { searchDocumentTaxonomy } from '@/lib/documents/classification'

interface MoveCategoryMenuProps {
  documentId: string
  currentDetailId: string | null | undefined
  onMoved: (next: { groupId: string; detailId: string; docType: string }) => void
  /** Compact icon-only trigger (default) vs labeled button. */
  variant?: 'icon' | 'labeled'
}

// Common categories shown at the top of the menu before "All categories".
const QUICK_CATEGORIES: Array<{ groupId: string; detailId: string; label: string }> = [
  { groupId: 'aircraft_logbooks_and_permanent_records', detailId: 'engine_logbooks', label: 'Engine Logbook' },
  { groupId: 'aircraft_logbooks_and_permanent_records', detailId: 'airframe_logbooks', label: 'Airframe Logbook' },
  { groupId: 'aircraft_logbooks_and_permanent_records', detailId: 'propeller_logbooks', label: 'Propeller Logbook' },
  { groupId: 'aircraft_logbooks_and_permanent_records', detailId: 'avionics_and_radio_logs', label: 'Avionics Log' },
  { groupId: 'flight_crew_and_operating_documents', detailId: 'pilot_s_operating_handbook_poh', label: 'POH' },
  { groupId: 'flight_crew_and_operating_documents', detailId: 'airplane_flight_manual_afm', label: 'AFM' },
  { groupId: 'work_orders_and_shop_records', detailId: 'maintenance_work_orders', label: 'Work Order' },
  { groupId: 'ad_sb_and_service_information', detailId: 'ad_compliance_records', label: 'AD Compliance' },
  { groupId: 'ad_sb_and_service_information', detailId: 'service_bulletins', label: 'Service Bulletin' },
  { groupId: 'airworthiness_and_certification', detailId: 'faa_form_337_records', label: 'FAA Form 337' },
  { groupId: 'airworthiness_and_certification', detailId: 'faa_form_8130_documents', label: 'FAA Form 8130' },
  { groupId: 'recurring_compliance_and_required_checks', detailId: 'updated_weight_and_balance_records', label: 'Weight & Balance' },
]

export function MoveCategoryMenu({
  documentId,
  currentDetailId,
  onMoved,
  variant = 'icon',
}: MoveCategoryMenuProps) {
  const [open, setOpen] = useState(false)
  const [moving, setMoving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  // Close on outside click.
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const searchMatches = useMemo(() => {
    if (search.trim().length === 0) return []
    return searchDocumentTaxonomy(search).slice(0, 8)
  }, [search])

  async function move(groupId: string, detailId: string) {
    setMoving(true)
    setError(null)
    try {
      const res = await fetch(`/api/documents/${documentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_group_id: groupId,
          document_detail_id: detailId,
          doc_type: deriveDocTypeFromClassification(detailId),
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j?.error ?? `HTTP ${res.status}`)
      }
      onMoved({ groupId, detailId, docType: deriveDocTypeFromClassification(detailId) })
      setOpen(false)
      setSearch('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setMoving(false)
    }
  }

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen((o) => !o)
        }}
        className={
          variant === 'labeled'
            ? 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] border border-border hover:bg-muted/40 transition-colors'
            : 'p-1.5 hover:bg-muted rounded-lg transition-colors'
        }
        title="Move to a different category"
        aria-label="Move to category"
      >
        {moving ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
        ) : (
          <ArrowRightLeft className="w-3.5 h-3.5 text-muted-foreground" />
        )}
        {variant === 'labeled' && <span>Move</span>}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 w-72 max-h-96 overflow-auto rounded-lg border border-border bg-white shadow-lg z-30"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-2 border-b border-border bg-muted/20">
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
              Move to category
            </div>
            <div className="relative mt-1.5">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search all 100+ categories..."
                className="w-full pl-7 pr-2 py-1.5 text-[12px] border border-border rounded-md outline-none focus:ring-1 focus:ring-primary/30"
              />
            </div>
          </div>

          {error && (
            <div className="px-3 py-2 text-[11px] text-red-700 bg-red-50 border-b border-red-200">
              {error}
            </div>
          )}

          {/* Search results take precedence */}
          {searchMatches.length > 0 ? (
            <div className="py-1">
              {searchMatches.map((match) => {
                const isCurrent = match.detailId === currentDetailId
                return (
                  <button
                    key={`${match.groupId}:${match.detailId}`}
                    type="button"
                    onClick={() => void move(match.groupId, match.detailId)}
                    disabled={moving || isCurrent}
                    className="w-full px-3 py-1.5 text-left text-[12px] hover:bg-muted/40 disabled:opacity-50 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="text-foreground truncate">{match.detailLabel}</div>
                      <div className="text-[10px] text-muted-foreground truncate">{match.groupLabel}</div>
                    </div>
                    {isCurrent && <Check className="w-3 h-3 text-emerald-600 shrink-0" />}
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="py-1">
              <div className="px-3 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Common categories
              </div>
              {QUICK_CATEGORIES.map((cat) => {
                const isCurrent = cat.detailId === currentDetailId
                return (
                  <button
                    key={cat.detailId}
                    type="button"
                    onClick={() => void move(cat.groupId, cat.detailId)}
                    disabled={moving || isCurrent}
                    className="w-full px-3 py-1.5 text-left text-[12px] hover:bg-muted/40 disabled:opacity-50 flex items-center justify-between gap-2"
                  >
                    <span className="text-foreground truncate">{cat.label}</span>
                    {isCurrent && <Check className="w-3 h-3 text-emerald-600 shrink-0" />}
                  </button>
                )
              })}
              <div className="px-3 pt-2 mt-1 border-t border-border text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Browse all sections
              </div>
              {DOCUMENT_TAXONOMY_GROUPS.slice(0, 12).map((group) => (
                <details key={group.id} className="group">
                  <summary className="px-3 py-1.5 text-[11px] cursor-pointer hover:bg-muted/40 list-none flex items-center justify-between">
                    <span className="text-foreground">{group.label}</span>
                    <span className="text-muted-foreground text-[10px]">{group.details.length}</span>
                  </summary>
                  <div className="bg-muted/10 pb-1">
                    {group.details.map((d) => {
                      const isCurrent = d.id === currentDetailId
                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => void move(group.id, d.id)}
                          disabled={moving || isCurrent}
                          className="w-full pl-6 pr-3 py-1 text-left text-[11px] hover:bg-muted/40 disabled:opacity-50 flex items-center justify-between"
                        >
                          <span className="truncate">{d.label}</span>
                          {isCurrent && <Check className="w-3 h-3 text-emerald-600 shrink-0" />}
                        </button>
                      )
                    })}
                  </div>
                </details>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
