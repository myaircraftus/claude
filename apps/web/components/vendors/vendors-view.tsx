'use client'

/**
 * VendorsView (Spec 2.2) — operator-side vendor list.
 *
 * Type filter, search, approved-only toggle, inline create + edit + archive.
 * Each row shows usage counts (parts / POs / WO lines) so operators see at
 * a glance which vendors are actively in use.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  Building2, Plus, Loader2, Pencil, Trash2, ShieldCheck, ShieldOff,
  ExternalLink, Mail, Phone, MapPin,
} from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { VendorForm } from './vendor-form'
import type { Vendor, VendorType, OrgRole } from '@/types'

const READ_ONLY_ROLES = new Set<OrgRole>(['viewer', 'auditor', 'pilot'])

const TYPE_TINT: Record<VendorType, string> = {
  parts:   'bg-blue-50 text-blue-700 border-blue-200',
  osr:     'bg-violet-50 text-violet-700 border-violet-200',
  service: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  freight: 'bg-amber-50 text-amber-700 border-amber-200',
  other:   'bg-slate-100 text-slate-600 border-slate-200',
}

const TYPE_LABEL: Record<VendorType, string> = {
  parts:   'Parts',
  osr:     'OSR',
  service: 'Service',
  freight: 'Freight',
  other:   'Other',
}

interface VendorWithUsage extends Vendor {
  usage?: { parts: number; pos: number; wo_lines: number }
}

export function VendorsView({ userRole }: { userRole: OrgRole }) {
  const canMutate = !READ_ONLY_ROLES.has(userRole)
  const [vendors, setVendors] = useState<VendorWithUsage[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | VendorType>('all')
  const [approvedOnly, setApprovedOnly] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function load() {
    try {
      const params = new URLSearchParams()
      if (search.trim()) params.set('q', search.trim())
      if (typeFilter !== 'all') params.set('vendor_type', typeFilter)
      if (approvedOnly) params.set('approved', '1')
      const res = await fetch(`/api/vendors?${params.toString()}`, { cache: 'no-store' })
      if (!res.ok) return
      const payload = await res.json()
      setVendors((payload.vendors ?? []) as VendorWithUsage[])
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [search, typeFilter, approvedOnly])

  async function archive(id: string, name: string) {
    if (!confirm(`Archive vendor "${name}"? Existing parts / POs / WO lines that reference it will keep working.`)) return
    setBusyId(id)
    try {
      const res = await fetch(`/api/vendors/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const out = await res.json().catch(() => ({}))
        toast.error(out?.error || 'Could not archive')
        return
      }
      toast.success('Archived')
      load()
    } finally {
      setBusyId(null)
    }
  }

  async function toggleApproved(v: VendorWithUsage) {
    setBusyId(v.id)
    try {
      const res = await fetch(`/api/vendors/${v.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved: !v.approved }),
      })
      if (!res.ok) {
        const out = await res.json().catch(() => ({}))
        toast.error(out?.error || 'Update failed')
        return
      }
      toast.success(v.approved ? 'Approval removed' : 'Vendor approved')
      load()
    } finally {
      setBusyId(null)
    }
  }

  const counts = useMemo(() => {
    const m: Record<VendorType, number> = { parts: 0, osr: 0, service: 0, freight: 0, other: 0 }
    for (const v of vendors) m[v.vendor_type] = (m[v.vendor_type] ?? 0) + 1
    return m
  }, [vendors])
  const approvedCount = vendors.filter((v) => v.approved).length

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>
            Vendors
          </h1>
          <p className="text-[13px] text-muted-foreground mt-1">
            Master list of suppliers, OSR shops, freight, and service vendors.
            Used by parts inventory, purchase orders, and outside-service work-order lines.
          </p>
        </div>
        {canMutate && !creating && !editingId && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            New vendor
          </Button>
        )}
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <Stat label="Vendors" value={vendors.length.toString()} tint="bg-blue-50 text-blue-700 border-blue-200" />
        <Stat label="Approved" value={approvedCount.toString()} tint={approvedCount > 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'} />
        <Stat label="OSR" value={(counts.osr ?? 0).toString()} tint="bg-violet-50 text-violet-700 border-violet-200" />
        <Stat label="Parts" value={(counts.parts ?? 0).toString()} tint="bg-blue-50 text-blue-700 border-blue-200" />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search vendor name, contact, email…"
          className="flex-1 min-w-[200px] rounded-lg border border-border bg-white px-3 py-2 text-[13px] outline-none focus:border-primary"
        />
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as 'all' | VendorType)} className="rounded-lg border border-border bg-white px-3 py-2 text-[13px] outline-none focus:border-primary">
          <option value="all">All types</option>
          {(Object.keys(TYPE_LABEL) as VendorType[]).map((t) => (
            <option key={t} value={t}>{TYPE_LABEL[t]}</option>
          ))}
        </select>
        <button
          onClick={() => setApprovedOnly((x) => !x)}
          className={cn(
            'px-3 py-2 rounded-lg text-[12px] border transition-colors inline-flex items-center gap-1.5',
            approvedOnly
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-white text-muted-foreground border-border hover:bg-muted',
          )}
          style={{ fontWeight: 500 }}
        >
          <ShieldCheck className="h-3 w-3" />
          Approved only
        </button>
      </div>

      <AnimatePresence>
        {creating && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
            <VendorForm onCancel={() => setCreating(false)} onSaved={() => { setCreating(false); load() }} />
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : vendors.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-10 text-center">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-white border border-border flex items-center justify-center mb-3">
            <Building2 className="h-5 w-5 text-muted-foreground" />
          </div>
          <h3 className="text-[14px] text-foreground" style={{ fontWeight: 600 }}>
            {search || typeFilter !== 'all' || approvedOnly ? 'No matches' : 'No vendors yet'}
          </h3>
          <p className="text-[12.5px] text-muted-foreground mt-1 max-w-md mx-auto">
            {search || typeFilter !== 'all' || approvedOnly
              ? 'Try clearing filters.'
              : 'Add your suppliers, OSR shops, and freight vendors here so POs + outside-service WO lines link to them by reference.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          <AnimatePresence>
            {vendors.map((v) => {
              const editing = editingId === v.id
              const busy = busyId === v.id
              const usage = v.usage ?? { parts: 0, pos: 0, wo_lines: 0 }
              return (
                <motion.li
                  key={v.id}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.12 }}
                  className="bg-white rounded-2xl border border-border p-4"
                >
                  {editing ? (
                    <VendorForm
                      initial={v}
                      onCancel={() => setEditingId(null)}
                      onSaved={() => { setEditingId(null); load() }}
                    />
                  ) : (
                    <div className="flex items-start gap-3 flex-wrap">
                      <div className={cn('w-10 h-10 rounded-xl border flex items-center justify-center shrink-0', TYPE_TINT[v.vendor_type])}>
                        <Building2 className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[14px] text-foreground" style={{ fontWeight: 700 }}>{v.name}</span>
                          <span className={cn('inline-flex items-center text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border', TYPE_TINT[v.vendor_type])} style={{ fontWeight: 700 }}>
                            {TYPE_LABEL[v.vendor_type]}
                          </span>
                          {v.approved && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded-full" style={{ fontWeight: 700 }}>
                              <ShieldCheck className="h-2.5 w-2.5" />
                              Approved
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-[11.5px] text-muted-foreground flex items-center gap-3 flex-wrap">
                          {v.contact_name && <span>{v.contact_name}</span>}
                          {v.contact_email && (
                            <span className="inline-flex items-center gap-1">
                              <Mail className="h-2.5 w-2.5" />{v.contact_email}
                            </span>
                          )}
                          {v.phone && (
                            <span className="inline-flex items-center gap-1">
                              <Phone className="h-2.5 w-2.5" />{v.phone}
                            </span>
                          )}
                          {v.website && (
                            <a href={v.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
                              <ExternalLink className="h-2.5 w-2.5" /> website
                            </a>
                          )}
                        </div>
                        {v.address && (
                          <div className="mt-1 text-[11px] text-muted-foreground inline-flex items-center gap-1">
                            <MapPin className="h-2.5 w-2.5" />
                            <span className="truncate max-w-md">{v.address}</span>
                          </div>
                        )}
                        <div className="mt-1.5 flex items-center gap-2 text-[10.5px] uppercase tracking-wider text-muted-foreground/80" style={{ fontWeight: 600 }}>
                          <span>{usage.parts} parts</span>
                          <span aria-hidden>·</span>
                          <span>{usage.pos} POs</span>
                          <span aria-hidden>·</span>
                          <span>{usage.wo_lines} WO lines</span>
                        </div>
                      </div>
                      {canMutate && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => toggleApproved(v)}
                            disabled={busy}
                            title={v.approved ? 'Remove approval' : 'Mark approved'}
                            className={cn(
                              'p-1.5 rounded-md hover:bg-muted',
                              v.approved ? 'text-emerald-600' : 'text-muted-foreground hover:text-emerald-600',
                            )}
                          >
                            {v.approved ? <ShieldCheck className="h-3 w-3" /> : <ShieldOff className="h-3 w-3" />}
                          </button>
                          <button
                            onClick={() => setEditingId(v.id)}
                            disabled={busy}
                            title="Edit"
                            className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => archive(v.id, v.name)}
                            disabled={busy}
                            title="Archive"
                            className="p-1.5 rounded-md text-muted-foreground hover:bg-rose-50 hover:text-rose-600"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </motion.li>
              )
            })}
          </AnimatePresence>
        </ul>
      )}
    </div>
  )
}

function Stat({ label, value, tint }: { label: string; value: string; tint: string }) {
  return (
    <div className={`rounded-2xl border px-4 py-3 ${tint}`}>
      <div className="text-[10px] uppercase tracking-wider" style={{ fontWeight: 700 }}>{label}</div>
      <div className="text-[20px] mt-0.5" style={{ fontWeight: 700 }}>{value}</div>
    </div>
  )
}
