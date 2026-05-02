'use client'

/**
 * InspectionsPage view (Spec 1.3) — list of inspections with status filters
 * and an inline create flow (pick aircraft + procedure).
 */

import { useEffect, useMemo, useState } from 'react'
import { Plus, ClipboardList, Loader2, ChevronRight, Plane } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { toast } from 'sonner'
import Link from '@/components/shared/tenant-link'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { INSPECTION_STATUS_LABEL } from '@/lib/inspections/status'
import type { Inspection, InspectionStatus, OrgRole, Procedure, ProcedureSection, ProcedureItem } from '@/types'

const READ_ONLY_ROLES = new Set<OrgRole>(['viewer', 'auditor'])

const STATUS_TINT: Record<InspectionStatus, string> = {
  draft:                          'bg-slate-100 text-slate-600 border-slate-200',
  'in-progress':                  'bg-blue-50 text-blue-700 border-blue-200',
  complete:                       'bg-emerald-50 text-emerald-700 border-emerald-200',
  'complete-requires-attention':  'bg-amber-50 text-amber-700 border-amber-200',
}

interface AircraftLite { id: string; tail_number: string }
type ProcedureFull = Procedure & { sections: Array<ProcedureSection & { items: ProcedureItem[] }> }

export function InspectionsView({ userRole }: { userRole: OrgRole }) {
  const canMutate = !READ_ONLY_ROLES.has(userRole)
  const [inspections, setInspections] = useState<Inspection[]>([])
  const [aircraft, setAircraft] = useState<AircraftLite[]>([])
  const [procedures, setProcedures] = useState<ProcedureFull[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'all' | InspectionStatus>('all')

  async function load() {
    try {
      const [iRes, aRes, pRes] = await Promise.all([
        fetch('/api/inspections?limit=300', { cache: 'no-store' }),
        fetch('/api/aircraft', { cache: 'no-store' }),
        fetch('/api/procedures', { cache: 'no-store' }),
      ])
      if (iRes.ok) setInspections(((await iRes.json()).inspections ?? []) as Inspection[])
      if (aRes.ok) {
        const p = await aRes.json()
        const rows = Array.isArray(p?.aircraft) ? p.aircraft : Array.isArray(p) ? p : []
        setAircraft(rows.map((a: any) => ({ id: String(a.id), tail_number: String(a.tail_number ?? '') })))
      }
      if (pRes.ok) setProcedures(((await pRes.json()).procedures ?? []) as ProcedureFull[])
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
  const procNameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of procedures) m.set(p.id, p.name)
    return m
  }, [procedures])

  const filtered = statusFilter === 'all'
    ? inspections
    : inspections.filter((i) => i.status === statusFilter)

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>
            Inspections
          </h1>
          <p className="text-[13px] text-muted-foreground mt-1">
            Run a procedure against an aircraft. Track status, complete checklist
            items with values / pass-fail / photos.
          </p>
        </div>
        {canMutate && !creating && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            New inspection
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
            <InspectionCreateForm
              aircraft={aircraft}
              procedures={procedures}
              onCancel={() => setCreating(false)}
              onCreated={() => { setCreating(false); load() }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filter row */}
      <div className="flex items-center gap-1 flex-wrap">
        <FilterChip active={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>All</FilterChip>
        {(Object.keys(INSPECTION_STATUS_LABEL) as InspectionStatus[]).map((s) => (
          <FilterChip
            key={s}
            active={statusFilter === s}
            onClick={() => setStatusFilter(s)}
          >
            {INSPECTION_STATUS_LABEL[s]}
            <span className="ml-1 text-[10px] text-muted-foreground/70">
              {inspections.filter((i) => i.status === s).length}
            </span>
          </FilterChip>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-10 text-center">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-white border border-border flex items-center justify-center mb-3">
            <ClipboardList className="h-5 w-5 text-muted-foreground" />
          </div>
          <h3 className="text-[14px] text-foreground" style={{ fontWeight: 600 }}>
            {statusFilter === 'all' ? 'No inspections yet' : 'Nothing in this status'}
          </h3>
          <p className="text-[12.5px] text-muted-foreground mt-1 max-w-md mx-auto">
            {statusFilter === 'all'
              ? 'Create one to start running a procedure on an aircraft.'
              : 'Try a different filter or kick off a new inspection.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          <AnimatePresence>
            {filtered.map((i) => {
              const tail = tailById.get(i.aircraft_id) || i.aircraft_id.slice(0, 8)
              const procName = i.procedure_name_snapshot || procNameById.get(i.procedure_id) || '(unknown procedure)'
              return (
                <motion.li
                  key={i.id}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.12 }}
                  className="bg-white rounded-2xl border border-border hover:border-primary/40 hover:shadow-sm transition-all"
                >
                  <Link href={`/inspections/${i.id}`} className="flex items-center gap-3 p-4 group">
                    <div className={cn('w-10 h-10 rounded-xl border flex items-center justify-center shrink-0', STATUS_TINT[i.status])}>
                      <ClipboardList className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-[14px] text-foreground" style={{ fontWeight: 700 }}>
                          {procName}
                        </h3>
                        <span className={cn('inline-flex items-center text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border', STATUS_TINT[i.status])} style={{ fontWeight: 700 }}>
                          {INSPECTION_STATUS_LABEL[i.status]}
                        </span>
                      </div>
                      <div className="text-[11.5px] text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                        <Plane className="h-3 w-3" />
                        <span>{tail}</span>
                        {i.due_date && <span>· due {i.due_date}</span>}
                        {i.completed_date && <span>· completed {i.completed_date.slice(0,10)}</span>}
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

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-2.5 py-1 rounded-full text-[11.5px] border transition-colors',
        active
          ? 'bg-foreground text-background border-foreground'
          : 'bg-white text-foreground border-border hover:bg-muted',
      )}
      style={{ fontWeight: 500 }}
    >
      {children}
    </button>
  )
}

function InspectionCreateForm({
  aircraft,
  procedures,
  onCancel,
  onCreated,
}: {
  aircraft: AircraftLite[]
  procedures: ProcedureFull[]
  onCancel: () => void
  onCreated: () => void
}) {
  const [aircraftId, setAircraftId]     = useState<string>(aircraft[0]?.id ?? '')
  const [procedureId, setProcedureId]   = useState<string>(procedures[0]?.id ?? '')
  const [dueDate, setDueDate]           = useState<string>('')
  const [submitting, setSubmitting]     = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!aircraftId)  { toast.error('Pick an aircraft'); return }
    if (!procedureId) { toast.error('Pick a procedure'); return }
    setSubmitting(true)
    try {
      const res = await fetch('/api/inspections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aircraft_id: aircraftId,
          procedure_id: procedureId,
          due_date: dueDate || null,
        }),
      })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(out?.error || 'Failed to create inspection')
        return
      }
      toast.success('Inspection created')
      onCreated()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-border p-5 space-y-3">
      <h3 className="text-[14px] text-foreground" style={{ fontWeight: 700 }}>New inspection</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
        <Field label="Aircraft">
          <select value={aircraftId} onChange={(e) => setAircraftId(e.target.value)} className={inputCls}>
            {aircraft.length === 0 && <option value="">No aircraft</option>}
            {aircraft.map((a) => <option key={a.id} value={a.id}>{a.tail_number}</option>)}
          </select>
        </Field>
        <Field label="Procedure">
          <select value={procedureId} onChange={(e) => setProcedureId(e.target.value)} className={inputCls}>
            {procedures.length === 0 && <option value="">No procedures</option>}
            {procedures.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Due date (optional)">
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputCls} />
        </Field>
      </div>
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>Cancel</Button>
        <Button type="submit" disabled={submitting}>
          {submitting && <Loader2 className="h-3 w-3 animate-spin mr-1.5" />}
          Create
        </Button>
      </div>
    </form>
  )
}

const inputCls =
  'mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-[13px] outline-none focus:border-primary'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 600 }}>
        {label}
      </label>
      {children}
    </div>
  )
}
