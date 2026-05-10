'use client'

/**
 * ApprovalsPage view (Spec 1.5) — operator-side list of approval requests.
 * Stat tiles + status filter + inline create.
 */

import { useEffect, useMemo, useState } from 'react'
import { Plus, Loader2, Mailbox, ChevronRight } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import Link from '@/components/shared/tenant-link'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ApprovalForm } from './approval-form'
import type { ApprovalRequest, ApprovalRequestStatus, ApprovalLineItem, OrgRole, Persona } from '@/types'

const READ_ONLY_ROLES = new Set<OrgRole>(['viewer', 'auditor', 'pilot'])

const STATUS_TINT: Record<ApprovalRequestStatus, string> = {
  draft:                'bg-slate-100 text-slate-600 border-slate-200',
  sent:                 'bg-blue-50 text-blue-700 border-blue-200',
  'partially-responded': 'bg-amber-50 text-amber-700 border-amber-200',
  completed:            'bg-emerald-50 text-emerald-700 border-emerald-200',
  expired:              'bg-rose-50 text-rose-700 border-rose-200',
}

const STATUS_LABEL: Record<ApprovalRequestStatus, string> = {
  draft: 'Draft',
  sent:  'Sent',
  'partially-responded': 'Partial',
  completed: 'Completed',
  expired:   'Expired',
}

interface AircraftLite { id: string; tail_number: string }
interface CustomerLite { id: string; name: string }

type FullRequest = ApprovalRequest & { line_items: ApprovalLineItem[] }

export function ApprovalsView({ userRole, persona }: { userRole: OrgRole; persona?: Persona }) {
  const canMutate = !READ_ONLY_ROLES.has(userRole)
  // Phase 15.5 F6 — owner persona gets the receiving framing
  // ("Approvals waiting on me"), shop/mechanic/admin keep the original
  // sending framing ("Send quoted work to customers …").
  const isOwnerView = persona === 'owner'
  const [requests, setRequests] = useState<FullRequest[]>([])
  const [aircraft, setAircraft] = useState<AircraftLite[]>([])
  const [customers, setCustomers] = useState<CustomerLite[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'all' | ApprovalRequestStatus>('all')

  async function load() {
    try {
      const [rRes, aRes, cRes] = await Promise.all([
        fetch('/api/approval-requests?limit=200', { cache: 'no-store' }),
        fetch('/api/aircraft', { cache: 'no-store' }),
        fetch('/api/customers', { cache: 'no-store' }),
      ])
      if (rRes.ok) setRequests((((await rRes.json())?.requests) ?? []) as FullRequest[])
      if (aRes.ok) {
        const p = await aRes.json()
        const rows = Array.isArray(p?.aircraft) ? p.aircraft : Array.isArray(p) ? p : []
        setAircraft(rows.map((a: any) => ({ id: String(a.id), tail_number: String(a.tail_number ?? '') })))
      }
      if (cRes.ok) {
        const p = await cRes.json()
        const rows = Array.isArray(p?.customers) ? p.customers : Array.isArray(p) ? p : []
        setCustomers(rows.map((c: any) => ({ id: String(c.id), name: String(c.name ?? c.full_name ?? '') })))
      }
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const tailById = useMemo(() => {
    const m = new Map<string, string>()
    for (const a of aircraft) m.set(a.id, a.tail_number)
    return m
  }, [aircraft])
  const customerById = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of customers) m.set(c.id, c.name)
    return m
  }, [customers])

  const filtered = statusFilter === 'all'
    ? requests
    : requests.filter((r) => r.status === statusFilter)

  const statCounts = (Object.keys(STATUS_LABEL) as ApprovalRequestStatus[]).reduce<Record<ApprovalRequestStatus, number>>(
    (acc, s) => { acc[s] = requests.filter((r) => r.status === s).length; return acc },
    { draft: 0, sent: 0, 'partially-responded': 0, completed: 0, expired: 0 },
  )

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>
            {isOwnerView ? 'Approvals' : 'Customer Approvals'}
          </h1>
          <p className="text-[13px] text-muted-foreground mt-1">
            {isOwnerView
              ? 'Quoted work waiting for your approval. Each line can be approved, declined, or deferred — your shop sees responses immediately.'
              : 'Send quoted work to customers for per-line approval. They approve, deny, or defer each item via a public link — no login required.'}
          </p>
        </div>
        {/* Owner persona doesn't create approvals (shop does), so the
            "+ New approval" button is hidden in the owner view. */}
        {canMutate && !isOwnerView && !creating && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            New approval
          </Button>
        )}
      </div>

      <AnimatePresence>
        {creating && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
          >
            <ApprovalForm
              aircraftOptions={aircraft}
              customerOptions={customers}
              onCancel={() => setCreating(false)}
              onCreated={() => { setCreating(false); load() }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {(Object.keys(STATUS_LABEL) as ApprovalRequestStatus[]).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(statusFilter === s ? 'all' : s)}
            className={cn(
              'rounded-2xl border px-4 py-3 text-left transition-shadow',
              STATUS_TINT[s],
              statusFilter === s && 'ring-2 ring-foreground/20',
            )}
          >
            <div className="text-[10px] uppercase tracking-wider" style={{ fontWeight: 700 }}>
              {STATUS_LABEL[s]}
            </div>
            <div className="text-[24px] mt-0.5" style={{ fontWeight: 700 }}>{statCounts[s]}</div>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-10 text-center">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-white border border-border flex items-center justify-center mb-3">
            <Mailbox className="h-5 w-5 text-muted-foreground" />
          </div>
          <h3 className="text-[14px] text-foreground" style={{ fontWeight: 600 }}>
            {statusFilter === 'all' ? 'No approvals yet' : 'Nothing in this status'}
          </h3>
          <p className="text-[12.5px] text-muted-foreground mt-1 max-w-md mx-auto">
            {statusFilter === 'all'
              ? 'Build one from a work order or freeform line items.'
              : 'Try a different filter or create a new approval.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          <AnimatePresence>
            {filtered.map((r) => {
              const tail = r.aircraft_id ? tailById.get(r.aircraft_id) : undefined
              const customer = r.customer_id ? customerById.get(r.customer_id) : undefined
              const total = r.line_items.length
              const answered = r.line_items.filter((li) => li.customer_response).length
              return (
                <motion.li
                  key={r.id}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.12 }}
                  className="bg-white rounded-2xl border border-border hover:border-primary/40 hover:shadow-sm transition-all"
                >
                  <Link href={`/approvals/${r.id}`} className="flex items-center gap-3 p-4 group">
                    <div className={cn('w-10 h-10 rounded-xl border flex items-center justify-center shrink-0', STATUS_TINT[r.status])}>
                      <Mailbox className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-[14px] text-foreground" style={{ fontWeight: 700 }}>
                          {r.subject || '(no subject)'}
                        </h3>
                        <span className={cn('inline-flex items-center text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border', STATUS_TINT[r.status])} style={{ fontWeight: 700 }}>
                          {STATUS_LABEL[r.status]}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[11.5px] text-muted-foreground flex items-center gap-2 flex-wrap">
                        {tail && <span>{tail}</span>}
                        {customer && <span>· {customer}</span>}
                        <span>· {answered} / {total} answered</span>
                        {r.sent_date && <span>· sent {r.sent_date.slice(0, 10)}</span>}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </Link>
                </motion.li>
              )
            })}
          </AnimatePresence>
        </ul>
      )}
    </div>
  )
}
