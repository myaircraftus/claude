'use client'

/**
 * Floating WorkOrderChatBubble — a persistent bottom-right chat affordance
 * that opens a side drawer scoped per-aircraft.
 *
 * Flow (mirrors the user's mental model):
 *   1. Tap the bubble → side drawer opens
 *   2. Drawer shows: aircraft picker → list of work orders for that aircraft
 *      (open WOs first), each with status, totals, hours logged
 *   3. Tap a WO → drawer body shows:
 *        - pinned summary (estimate $X / hours done / status)
 *        - timeline of squawks + estimates + WO opening events
 *        - chat thread (existing ThreadPanel reused) with composer
 *   4. Owner side approves estimates / additional charges; mechanic side
 *      logs progress, requests approvals, sends pictures.
 *
 * This is the read+chat MVP. Voice recording, real-time push, and inline
 * time-tracking are next-pass enhancements but the data model here is
 * complete enough to plug them in without breaking changes.
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import { MessageCircle, X, Plane, ChevronRight, Wrench, AlertTriangle, Receipt, ChevronLeft, Clock } from 'lucide-react'
import { WorkOrderChatPanel } from './work-order-chat-panel'

type Persona = 'owner' | 'mechanic'

interface AircraftRef {
  id: string
  tail_number: string
  make: string | null
  model: string | null
  year: number | null
}

interface WorkOrderRef {
  id: string
  work_order_number: string | null
  status: string | null
  service_type: string | null
  customer_complaint: string | null
  discrepancy: string | null
  labor_total: number
  parts_total: number
  outside_services_total: number
  total: number
  hours_logged: number
  opened_at: string | null
  closed_at: string | null
  thread_id: string | null
  customer_id: string | null
  is_open: boolean
}

interface SquawkRef {
  id: string
  title: string | null
  description: string | null
  severity: string | null
  status: string | null
  reported_at: string | null
  resolved_at: string | null
  created_at: string | null
}

interface EstimateRef {
  id: string
  estimate_number: string | null
  status: string | null
  total: number | null
  created_at: string | null
  valid_until: string | null
  customer_notes: string | null
  linked_work_order_id: string | null
}

interface ChatSummary {
  aircraft: AircraftRef
  work_orders: WorkOrderRef[]
  squawks: SquawkRef[]
  estimates: EstimateRef[]
}

interface AircraftListItem {
  id: string
  tail_number: string
  make: string | null
  model: string | null
}

function fmtDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function fmtCurrency(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}
function statusColor(status: string | null): string {
  if (!status) return 'bg-slate-50 text-slate-700 border-slate-200'
  const s = status.toLowerCase()
  if (s.includes('progress')) return 'bg-blue-50 text-blue-700 border-blue-200'
  if (s.includes('parts')) return 'bg-violet-50 text-violet-700 border-violet-200'
  if (s.includes('approval') || s.includes('waiting')) return 'bg-amber-50 text-amber-700 border-amber-200'
  if (s.includes('closed') || s.includes('paid') || s.includes('signoff')) return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  return 'bg-slate-50 text-slate-700 border-slate-200'
}

export function WorkOrderChatBubble({
  persona,
  initialAircraftId,
}: {
  persona: Persona
  initialAircraftId?: string | null
}) {
  const [open, setOpen] = useState(false)
  const [aircraftList, setAircraftList] = useState<AircraftListItem[]>([])
  const [selectedAircraftId, setSelectedAircraftId] = useState<string | null>(initialAircraftId ?? null)
  const [summary, setSummary] = useState<ChatSummary | null>(null)
  const [selectedWoId, setSelectedWoId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const drawerRef = useRef<HTMLDivElement>(null)
  const [hasUnread, setHasUnread] = useState(false)
  const [unreadPreview, setUnreadPreview] = useState<{ work_order_id: string | null; aircraft_id: string | null; preview: string } | null>(null)

  // Poll the unread roll-up every 12s so the bubble lights up when the
  // counterpart sends a message. Cheap: one row, one indexed query.
  useEffect(() => {
    let cancelled = false
    async function checkUnread() {
      try {
        const res = await fetch('/api/work-orders/messages-unread')
        if (!res.ok) return
        const json = await res.json()
        if (cancelled) return
        const latestIso = json?.latest?.created_at as string | undefined
        if (!latestIso) {
          setHasUnread(false)
          setUnreadPreview(null)
          return
        }
        // Compare against the highest last-seen across all per-WO last-seen
        // entries the chat panel persists. If the latest message is newer
        // than every "last seen", there's something new.
        const lastSeenAll = (() => {
          if (typeof window === 'undefined') return ''
          let max = ''
          for (let i = 0; i < window.localStorage.length; i++) {
            const k = window.localStorage.key(i)
            if (!k || !k.startsWith('wo-chat-last-seen:')) continue
            const v = window.localStorage.getItem(k) ?? ''
            if (v > max) max = v
          }
          return max
        })()
        if (latestIso > lastSeenAll) {
          setHasUnread(true)
          setUnreadPreview({
            work_order_id: json.latest.work_order_id ?? null,
            aircraft_id: json.latest.aircraft_id ?? null,
            preview: json.latest.preview ?? '',
          })
        } else {
          setHasUnread(false)
          setUnreadPreview(null)
        }
      } catch { /* ignore */ }
    }
    void checkUnread()
    const t = setInterval(checkUnread, 12000)
    return () => { cancelled = true; clearInterval(t) }
  }, [])

  // Hydrate aircraft list once when first opened. Default selection priority
  // (so the drawer never lands on an old aircraft with zero activity):
  //   1. initialAircraftId prop (passed by parent)
  //   2. URL pathname /aircraft/<id-or-tail> (when the bubble opens from an
  //      aircraft detail page, jump straight to that aircraft)
  //   3. localStorage owner_selected_aircraft_id (used everywhere else in the
  //      app — Dashboard, Ask, etc.)
  //   4. The aircraft with the most recent work-order activity (we re-rank
  //      the server's created_at-desc list by opened_at after parallel
  //      chat-summary probes — but only when none of the above match)
  //   5. First in the server list as a final fallback
  useEffect(() => {
    if (!open || aircraftList.length > 0) return
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/aircraft')
        if (!res.ok) return
        const json = await res.json()
        if (cancelled) return
        const list = (Array.isArray(json) ? json : (json.aircraft ?? [])) as any[]
        const mapped: AircraftListItem[] = list.map((a) => ({
          id: a.id,
          tail_number: a.tail_number,
          make: a.make,
          model: a.model,
        }))
        setAircraftList(mapped)

        if (selectedAircraftId) return // already set by props or earlier state

        // (2) URL pathname check — only on /aircraft/<segment>
        let urlAircraftId: string | null = null
        if (typeof window !== 'undefined') {
          const m = window.location.pathname.match(/\/aircraft\/([^/?#]+)/)
          if (m) {
            const seg = decodeURIComponent(m[1])
            const hit = mapped.find((a) => a.id === seg || a.tail_number?.toUpperCase() === seg.toUpperCase())
            if (hit) urlAircraftId = hit.id
          }
        }

        // (3) localStorage fallback used by other surfaces
        const stored =
          typeof window !== 'undefined'
            ? window.localStorage.getItem('owner_selected_aircraft_id')
            : null
        const storedHit = stored && mapped.some((a) => a.id === stored) ? stored : null

        const candidate = urlAircraftId ?? storedHit
        if (candidate) {
          setSelectedAircraftId(candidate)
          return
        }

        // (4) Rank by latest activity — fan out chat-summary on the first 8
        // aircraft (cheap; bounded concurrency) and pick the one whose top
        // work order was opened most recently. Falls back to mapped[0] if
        // every aircraft is empty.
        const probeTargets = mapped.slice(0, 8)
        const probes = await Promise.all(
          probeTargets.map(async (a) => {
            try {
              const r = await fetch(`/api/aircraft/${a.id}/chat-summary`)
              if (!r.ok) return null
              const s = (await r.json()) as ChatSummary
              const latest =
                s.work_orders[0]?.opened_at ??
                s.squawks[0]?.created_at ??
                null
              return { id: a.id, latest }
            } catch {
              return null
            }
          }),
        )
        if (cancelled) return
        const ranked = probes
          .filter((p): p is { id: string; latest: string | null } => Boolean(p?.latest))
          .sort((a, b) => (b.latest ?? '').localeCompare(a.latest ?? ''))
        const winner = ranked[0]?.id ?? mapped[0]?.id ?? null
        if (winner) setSelectedAircraftId(winner)
      } catch (err) {
        console.warn('[chat-bubble] aircraft fetch failed', err)
      }
    })()
    return () => { cancelled = true }
  }, [open, aircraftList.length, selectedAircraftId])

  // Persist the user's manual aircraft choice the same way Dashboard / Ask do
  useEffect(() => {
    if (!selectedAircraftId || typeof window === 'undefined') return
    window.localStorage.setItem('owner_selected_aircraft_id', selectedAircraftId)
  }, [selectedAircraftId])

  // Re-fetch chat summary when aircraft changes (or drawer opens)
  useEffect(() => {
    if (!open || !selectedAircraftId) return
    let cancelled = false
    setLoading(true)
    void (async () => {
      try {
        const res = await fetch(`/api/aircraft/${selectedAircraftId}/chat-summary`)
        if (!res.ok) return
        const json = (await res.json()) as ChatSummary
        if (cancelled) return
        setSummary(json)
        // Auto-pick the first open WO so the chat is visible immediately.
        const firstOpen = json.work_orders.find((w) => w.is_open) ?? json.work_orders[0]
        setSelectedWoId(firstOpen?.id ?? null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [open, selectedAircraftId])

  const selectedWo = summary?.work_orders.find((w) => w.id === selectedWoId) ?? null

  const handleSelectAircraft = useCallback((id: string) => {
    setSelectedAircraftId(id)
    setSelectedWoId(null)
    setSummary(null)
  }, [])

  // Build the timeline events the drawer pins above the chat for context.
  // Sorted oldest → newest so the most recent activity sits next to the chat.
  const timelineEvents = (() => {
    if (!summary || !selectedWo) return []
    type Ev = { kind: 'squawk' | 'estimate' | 'wo_opened' | 'wo_closed'; at: string | null; label: string; sub?: string }
    const out: Ev[] = []
    for (const sq of summary.squawks) {
      out.push({
        kind: 'squawk',
        at: sq.reported_at ?? sq.created_at,
        label: `Squawk: ${sq.title ?? '(untitled)'}`,
        sub: sq.severity ? `Severity: ${sq.severity}` : undefined,
      })
    }
    for (const est of summary.estimates) {
      // Only show estimates linked to this WO (or unlinked recent ones)
      if (est.linked_work_order_id && est.linked_work_order_id !== selectedWo.id) continue
      out.push({
        kind: 'estimate',
        at: est.created_at,
        label: `Estimate ${est.estimate_number ?? ''} — ${fmtCurrency(est.total)}`,
        sub: est.status ?? undefined,
      })
    }
    if (selectedWo.opened_at) {
      out.push({
        kind: 'wo_opened',
        at: selectedWo.opened_at,
        label: `Work order ${selectedWo.work_order_number ?? ''} opened`,
        sub: selectedWo.service_type ?? undefined,
      })
    }
    if (selectedWo.closed_at) {
      out.push({
        kind: 'wo_closed',
        at: selectedWo.closed_at,
        label: `Work order closed`,
      })
    }
    out.sort((a, b) => (a.at ?? '').localeCompare(b.at ?? ''))
    return out
  })()

  return (
    <>
      {/* Floating bubble button — bottom right, always visible */}
      {!open && (
        <button
          type="button"
          onClick={() => {
            // If there's an unread roll-up pointing at a specific WO, deeplink
            // straight into it so the user lands on the latest activity.
            if (unreadPreview?.aircraft_id && unreadPreview.work_order_id) {
              setSelectedAircraftId(unreadPreview.aircraft_id)
              setSelectedWoId(unreadPreview.work_order_id)
            }
            setOpen(true)
          }}
          className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-primary text-white shadow-lg hover:shadow-xl transition-all flex items-center justify-center group"
          aria-label="Open work order chat"
        >
          <MessageCircle className="w-6 h-6 group-hover:scale-110 transition-transform" />
          {hasUnread && (
            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-red-500 ring-2 ring-white animate-pulse" aria-label="New messages" />
          )}
        </button>
      )}

      {/* Drawer */}
      {open && (
        <div className="fixed inset-0 z-50 flex pointer-events-none">
          {/* Click-outside dim */}
          <div
            className="absolute inset-0 bg-black/30 pointer-events-auto"
            onClick={() => setOpen(false)}
          />
          {/* Drawer panel */}
          <div
            ref={drawerRef}
            className="ml-auto h-full w-full max-w-[480px] bg-white shadow-2xl flex flex-col pointer-events-auto"
          >
            {/* Header */}
            <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2 flex-shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                {selectedWoId && summary && (
                  <button
                    type="button"
                    onClick={() => setSelectedWoId(null)}
                    className="p-1.5 -ml-1.5 rounded-lg hover:bg-muted transition-colors"
                    aria-label="Back to work orders"
                  >
                    <ChevronLeft className="w-4 h-4 text-muted-foreground" />
                  </button>
                )}
                <Plane className="w-4 h-4 text-primary shrink-0" />
                <div className="min-w-0">
                  <div className="text-[13px] text-foreground truncate" style={{ fontWeight: 600 }}>
                    {summary?.aircraft.tail_number ?? 'Work order chat'}
                  </div>
                  {summary?.aircraft && (
                    <div className="text-[11px] text-muted-foreground truncate">
                      {summary.aircraft.make} {summary.aircraft.model}
                    </div>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                aria-label="Close chat"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            {/* Aircraft picker (when no WO selected) */}
            {!selectedWoId && (
              <div className="px-4 py-3 border-b border-border bg-muted/20 flex-shrink-0">
                <label className="text-[10px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>
                  Aircraft
                </label>
                <select
                  value={selectedAircraftId ?? ''}
                  onChange={(e) => handleSelectAircraft(e.target.value)}
                  className="mt-1 w-full h-9 px-3 rounded-lg border border-border bg-white text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  {aircraftList.length === 0 && <option value="">Loading…</option>}
                  {aircraftList.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.tail_number} {a.make ? `· ${a.make} ${a.model ?? ''}`.trim() : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Body */}
            <div className="flex-1 min-h-0 overflow-y-auto">
              {loading && (
                <div className="px-4 py-6 text-[12px] text-muted-foreground italic">Loading…</div>
              )}

              {!loading && summary && !selectedWoId && (
                <div className="px-4 py-3 space-y-2">
                  {summary.work_orders.length === 0 && summary.squawks.length === 0 && (
                    <div className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-6 text-center space-y-2">
                      <Wrench className="w-6 h-6 mx-auto text-muted-foreground/40" />
                      <div className="text-[12px] text-foreground" style={{ fontWeight: 500 }}>
                        No work orders or squawks for {summary.aircraft.tail_number} yet
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Switch aircraft above, or open a work order from{' '}
                        <a href={`/aircraft/${summary.aircraft.id}`} className="text-primary hover:underline">
                          the aircraft page
                        </a>{' '}
                        to start a chat thread.
                      </div>
                    </div>
                  )}
                  {summary.work_orders.length === 0 && summary.squawks.length > 0 && (
                    <div className="rounded-lg border border-dashed border-border bg-amber-50/30 px-3 py-3 text-[12px] text-foreground/80">
                      No work orders open yet — but {summary.squawks.length} squawk{summary.squawks.length === 1 ? '' : 's'} reported below.
                    </div>
                  )}
                  {summary.work_orders.map((wo) => (
                    <button
                      key={wo.id}
                      type="button"
                      onClick={() => setSelectedWoId(wo.id)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg border transition-all ${
                        wo.is_open ? 'bg-white border-border hover:border-primary/40' : 'bg-muted/30 border-border hover:border-border'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Wrench className="w-3.5 h-3.5 text-violet-600 shrink-0" />
                          <span className="text-[12px] text-foreground" style={{ fontWeight: 600 }}>
                            {wo.work_order_number ?? 'Untitled WO'}
                          </span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded border ${statusColor(wo.status)}`} style={{ fontWeight: 600 }}>
                            {wo.status ?? 'unknown'}
                          </span>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
                      </div>
                      {wo.discrepancy && (
                        <p className="text-[11px] text-muted-foreground line-clamp-2">{wo.discrepancy}</p>
                      )}
                      <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                        {wo.total > 0 && <span>{fmtCurrency(wo.total)}</span>}
                        {wo.hours_logged > 0 && (
                          <span className="inline-flex items-center gap-0.5">
                            <Clock className="w-3 h-3" /> {wo.hours_logged}h
                          </span>
                        )}
                        {wo.opened_at && <span>opened {fmtDate(wo.opened_at)}</span>}
                      </div>
                    </button>
                  ))}

                  {/* Recent squawks at the bottom of the list */}
                  {summary.squawks.length > 0 && (
                    <div className="pt-2 mt-2 border-t border-border">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5" style={{ fontWeight: 600 }}>
                        Recent squawks
                      </div>
                      {summary.squawks.slice(0, 5).map((sq) => (
                        <div key={sq.id} className="flex items-start gap-2 py-1.5 text-[11px]">
                          <AlertTriangle className="w-3 h-3 text-amber-600 mt-0.5 shrink-0" />
                          <div className="min-w-0">
                            <div className="text-foreground truncate" style={{ fontWeight: 500 }}>
                              {sq.title ?? '(untitled)'}
                            </div>
                            {sq.description && (
                              <div className="text-muted-foreground line-clamp-1">{sq.description}</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Selected WO — pinned summary + timeline + chat */}
              {!loading && selectedWo && (
                <div className="flex flex-col h-full">
                  {/* Pinned summary */}
                  <div className="px-4 py-3 border-b border-border bg-amber-50/30 flex-shrink-0 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[12px] text-foreground" style={{ fontWeight: 600 }}>
                        {selectedWo.work_order_number}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${statusColor(selectedWo.status)}`} style={{ fontWeight: 600 }}>
                        {selectedWo.status ?? 'unknown'}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-[11px]">
                      <div>
                        <div className="text-muted-foreground uppercase tracking-wide" style={{ fontWeight: 600 }}>Total</div>
                        <div className="text-foreground" style={{ fontWeight: 600 }}>{fmtCurrency(selectedWo.total)}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground uppercase tracking-wide" style={{ fontWeight: 600 }}>Labor</div>
                        <div className="text-foreground" style={{ fontWeight: 600 }}>{fmtCurrency(selectedWo.labor_total)}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground uppercase tracking-wide" style={{ fontWeight: 600 }}>Hours</div>
                        <div className="text-foreground" style={{ fontWeight: 600 }}>{selectedWo.hours_logged}h</div>
                      </div>
                    </div>
                    {selectedWo.discrepancy && (
                      <p className="text-[11px] text-foreground/80 leading-relaxed">{selectedWo.discrepancy}</p>
                    )}
                  </div>

                  {/* Timeline strip */}
                  {timelineEvents.length > 0 && (
                    <div className="px-4 py-2 border-b border-border max-h-32 overflow-y-auto flex-shrink-0">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1" style={{ fontWeight: 600 }}>
                        Timeline
                      </div>
                      <ol className="space-y-1">
                        {timelineEvents.map((ev, i) => (
                          <li key={i} className="flex items-start gap-2 text-[11px]">
                            <span className="text-muted-foreground tabular-nums shrink-0">{fmtDate(ev.at)}</span>
                            <div className="min-w-0">
                              <span className="text-foreground" style={{ fontWeight: 500 }}>{ev.label}</span>
                              {ev.sub && <span className="text-muted-foreground"> · {ev.sub}</span>}
                            </div>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}

                  {/* Rich chat panel — text, attachments, voice memos
                      (Whisper-transcribed), time tracker, polled real-time */}
                  <div className="flex-1 min-h-0">
                    <WorkOrderChatPanel
                      workOrderId={selectedWo.id}
                      viewerRole={persona === 'mechanic' ? 'mechanic' : 'owner'}
                      onMessageActivity={(iso) => {
                        // Tell the bubble: messages this thread saw last at iso.
                        // The unread sync hook below picks this up.
                        if (typeof window !== 'undefined') {
                          window.localStorage.setItem(
                            `wo-chat-last-seen:${selectedWo.id}`,
                            iso,
                          )
                        }
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
