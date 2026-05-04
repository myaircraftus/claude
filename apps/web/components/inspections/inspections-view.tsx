'use client'

/**
 * InspectionsPage view (Spec 1.3 + Spec 2.4 multi-view).
 *
 * Sprint 2.4: replaced the original status-filter chips + list block with
 * the generic <ModuleViewShell module="inspections"> from
 * components/views/. The shell handles list / calendar / table / board
 * via the module config in lib/views/configs.ts.
 */

import { useEffect, useMemo, useState } from 'react'
import { Plus, ClipboardList, Plane, ChevronRight, Loader2 } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { toast } from 'sonner'
import Link from '@/components/shared/tenant-link'
import { Button } from '@/components/ui/button'
import { CameraButton } from '@/components/camera/CameraButton'
import { cn } from '@/lib/utils'
import { INSPECTION_STATUS_LABEL } from '@/lib/inspections/status'
import { ModuleViewShell } from '@/components/views/module-view-shell'
import { useTenantRouter } from '@/components/shared/tenant-link'
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
  const router = useTenantRouter()
  const [inspections, setInspections] = useState<Inspection[]>([])
  const [aircraft, setAircraft] = useState<AircraftLite[]>([])
  const [procedures, setProcedures] = useState<ProcedureFull[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

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

  // Hydrate the rows passed into ModuleViewShell with display-friendly fields
  // so the table/board/calendar views can render names instead of UUIDs.
  // Note: filtering / sorting / grouping is applied INSIDE the shell based on
  // the active saved view; we just denormalize the inputs.
  const rows = useMemo(
    () => inspections.map((i) => ({
      ...i,
      // Override aircraft_id with the tail number for display purposes —
      // the field config still reads aircraft_id, so the table column shows
      // a tail. Keep the original on _aircraft_id_uuid for click-through.
      _aircraft_id_uuid: i.aircraft_id,
      aircraft_id: tailById.get(i.aircraft_id) ?? i.aircraft_id,
      procedure_name_snapshot: i.procedure_name_snapshot || procNameById.get(i.procedure_id) || '(unknown procedure)',
    })),
    [inspections, tailById, procNameById],
  )

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
          <div className="inline-flex items-center gap-2">
            {/* Spec polish.voice-camera-rollout — scan an inspection
                sheet (paper checklist photo) → /api/vision/scan-logbook
                returns a structured draft for review. */}
            <CameraButton mode="scan-logbook" label="Scan sheet" />
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              New inspection
            </Button>
          </div>
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

      {/* Sprint 2.4 multi-view shell — replaces the original status-filter
          chips + flat list. The shell pulls saved views from the
          'inspections' module config (lib/views/configs.ts) and renders
          list / calendar / table / board with filter + sort + groupBy. */}
      <ModuleViewShell
        module="inspections"
        rows={rows}
        loading={loading}
        emptyState={
          <>
            <div className="mx-auto w-12 h-12 rounded-2xl bg-white border border-border flex items-center justify-center mb-3">
              <ClipboardList className="h-5 w-5 text-muted-foreground" />
            </div>
            <h3 className="text-[14px] text-foreground" style={{ fontWeight: 600 }}>
              No inspections
            </h3>
            <p className="text-[12.5px] text-muted-foreground mt-1 max-w-md mx-auto">
              Create one to start running a procedure on an aircraft, or pick a
              different saved view.
            </p>
          </>
        }
        renderListRow={(i) => (
          <motion.div
            layout
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.12 }}
            className="bg-white rounded-2xl border border-border hover:border-primary/40 hover:shadow-sm transition-all"
          >
            <Link href={`/inspections/${i.id}`} className="flex items-center gap-3 p-4 group">
              <div className={cn('w-10 h-10 rounded-xl border flex items-center justify-center shrink-0', STATUS_TINT[i.status as InspectionStatus] ?? STATUS_TINT.draft)}>
                <ClipboardList className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-[14px] text-foreground" style={{ fontWeight: 700 }}>
                    {(i as any).procedure_name_snapshot}
                  </h3>
                  <span className={cn('inline-flex items-center text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border', STATUS_TINT[i.status as InspectionStatus] ?? STATUS_TINT.draft)} style={{ fontWeight: 700 }}>
                    {INSPECTION_STATUS_LABEL[i.status as InspectionStatus] ?? i.status}
                  </span>
                </div>
                <div className="text-[11.5px] text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                  <Plane className="h-3 w-3" />
                  <span>{(i as any).aircraft_id}</span>
                  {i.due_date && <span>· due {i.due_date}</span>}
                  {i.completed_date && <span>· completed {String(i.completed_date).slice(0,10)}</span>}
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </Link>
          </motion.div>
        )}
        onRowClick={(i) => router.push(`/inspections/${i.id}`)}
      />
    </div>
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
