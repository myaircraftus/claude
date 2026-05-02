'use client'

/**
 * AircraftMeterPanel (Spec 1.1) — embeddable per-aircraft view.
 *
 * Top: current values (one card per meter on the assigned profile, blank
 *      placeholders if no profile assigned).
 * Mid: log-a-new-reading inline form.
 * Bot: history list, newest first, with edit/delete (mechanic+).
 *
 * Self-contained: pulls /api/aircraft/[id]/meters for the entire shape on
 * mount and after every mutation, so consumers (the aircraft detail page,
 * future tabs in AircraftDetail.tsx) just mount it and forget.
 */

import { useCallback, useEffect, useState } from 'react'
import { Gauge, Loader2, Pencil, Trash2, ArrowRight } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { toast } from 'sonner'
import Link from '@/components/shared/tenant-link'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { MeterReadingForm } from './meter-reading-form'
import { formatMeterValue } from '@/lib/meters/current'
import type {
  MeterDefinition,
  MeterProfile,
  MeterReading,
  OrgRole,
} from '@/types'

const READ_ONLY_ROLES = new Set<OrgRole>(['viewer', 'auditor'])

interface PanelData {
  aircraft: { id: string; tail_number: string; meter_profile_id: string | null }
  profile: (MeterProfile & { meters: MeterDefinition[] }) | null
  current: Array<{ definition: MeterDefinition; current: MeterReading | null }>
  history: MeterReading[]
}

export function AircraftMeterPanel({
  aircraftId,
  userRole,
}: {
  aircraftId: string
  userRole: OrgRole
}) {
  const canMutate = !READ_ONLY_ROLES.has(userRole)
  const [data, setData] = useState<PanelData | null>(null)
  const [loading, setLoading] = useState(true)
  const [profiles, setProfiles] = useState<Array<MeterProfile & { meters: MeterDefinition[] }>>([])
  const [assigning, setAssigning] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/aircraft/${aircraftId}/meters`, { cache: 'no-store' })
      if (!res.ok) return
      const payload = await res.json()
      setData(payload as PanelData)
    } finally {
      setLoading(false)
    }
  }, [aircraftId])

  useEffect(() => { refresh() }, [refresh])

  async function loadProfiles() {
    try {
      const res = await fetch('/api/meter-profiles', { cache: 'no-store' })
      if (!res.ok) return
      const payload = await res.json()
      setProfiles((payload.profiles ?? []) as Array<MeterProfile & { meters: MeterDefinition[] }>)
    } catch { /* noop */ }
  }

  async function assignProfile(profileId: string | null) {
    setAssigning(true)
    try {
      const res = await fetch(`/api/aircraft/${aircraftId}/meters`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meter_profile_id: profileId }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(payload?.error || 'Could not assign profile')
        return
      }
      toast.success(profileId ? 'Profile assigned' : 'Profile cleared')
      refresh()
    } catch {
      toast.error('Could not assign profile')
    } finally {
      setAssigning(false)
    }
  }

  async function deleteReading(id: string) {
    if (!confirm('Delete this reading? Cannot be undone.')) return
    try {
      const res = await fetch(`/api/meter-readings/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        toast.error(j?.error || 'Could not delete reading')
        return
      }
      toast.success('Reading deleted')
      refresh()
    } catch {
      toast.error('Could not delete reading')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    )
  }
  if (!data) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-8 text-center">
        <p className="text-[12.5px] text-muted-foreground">
          Could not load meter data for this aircraft.
        </p>
      </div>
    )
  }

  const profile = data.profile
  const definitions = profile?.meters ?? []
  const definitionById = new Map(definitions.map((m) => [m.id, m]))

  return (
    <div className="space-y-5">
      {/* Profile selector */}
      <div className="bg-white rounded-2xl border border-border p-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Gauge className="h-4 w-4 text-muted-foreground" />
            <span className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>
              Meter profile
            </span>
            {profile ? (
              <span className="text-[12.5px] text-muted-foreground">
                · {profile.name}
              </span>
            ) : (
              <span className="text-[12.5px] text-muted-foreground italic">
                · not assigned
              </span>
            )}
          </div>
          {canMutate && (
            <div className="flex items-center gap-2">
              <ProfilePicker
                profiles={profiles}
                onLoad={loadProfiles}
                currentProfileId={profile?.id ?? null}
                onPick={assignProfile}
                disabled={assigning}
              />
              {profile && (
                <Button variant="ghost" size="sm" onClick={() => assignProfile(null)} disabled={assigning}>
                  Clear
                </Button>
              )}
              <Link
                href="/meters"
                className="text-[11.5px] text-primary hover:underline inline-flex items-center gap-0.5"
                style={{ fontWeight: 500 }}
              >
                Manage profiles <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Current values */}
      {profile && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {data.current.map((entry) => (
            <CurrentMeterCard key={entry.definition.id} entry={entry} />
          ))}
        </div>
      )}

      {/* Log a reading */}
      {profile && canMutate && (
        <div className="bg-white rounded-2xl border border-border p-4">
          <h3 className="text-[12px] uppercase tracking-wider text-muted-foreground mb-2" style={{ fontWeight: 700 }}>
            Log a reading
          </h3>
          <MeterReadingForm
            aircraftId={aircraftId}
            definitions={definitions}
            onCreated={refresh}
          />
        </div>
      )}

      {/* History */}
      <div className="bg-white rounded-2xl border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h3 className="text-[12px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>
            History ({data.history.length})
          </h3>
        </div>
        {data.history.length === 0 ? (
          <div className="p-8 text-center text-[12.5px] text-muted-foreground">
            No readings logged yet.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            <AnimatePresence>
              {data.history.map((r) => {
                const def = definitionById.get(r.meter_definition_id)
                const editing = editingId === r.id
                return (
                  <motion.li
                    key={r.id}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.12 }}
                    className="px-4 py-2.5 flex items-center gap-3"
                  >
                    <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-[100px,1fr,auto,auto] sm:items-center gap-1 sm:gap-3">
                      <span className="text-[12px] text-muted-foreground font-mono">{r.reading_date}</span>
                      <span className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>
                        {def?.name ?? 'Unknown meter'}{' '}
                        <span className="font-mono text-foreground">
                          {formatMeterValue(Number(r.value), def?.decimal_places ?? 1)}
                        </span>{' '}
                        <span className="text-muted-foreground text-[11px]">{def?.unit ?? ''}</span>
                      </span>
                      <span className="text-[10px] uppercase tracking-wider bg-muted/50 text-muted-foreground px-1.5 py-0.5 rounded-full" style={{ fontWeight: 600 }}>
                        {r.source}
                      </span>
                      {r.notes && (
                        <span className="text-[11.5px] text-muted-foreground truncate" title={r.notes}>
                          {r.notes}
                        </span>
                      )}
                    </div>
                    {canMutate && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setEditingId(editing ? null : r.id)}
                          title="Edit"
                          className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => deleteReading(r.id)}
                          title="Delete"
                          className="p-1.5 rounded-md text-muted-foreground hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                    {editing && def && (
                      <EditReadingInline
                        reading={r}
                        decimalPlaces={def.decimal_places}
                        onClose={() => setEditingId(null)}
                        onSaved={() => { setEditingId(null); refresh() }}
                      />
                    )}
                  </motion.li>
                )
              })}
            </AnimatePresence>
          </ul>
        )}
      </div>
    </div>
  )
}

function CurrentMeterCard({
  entry,
}: {
  entry: { definition: MeterDefinition; current: MeterReading | null }
}) {
  const def = entry.definition
  const cur = entry.current
  return (
    <div className={cn(
      'bg-white rounded-2xl border border-border p-4',
      cur && 'border-primary/30',
    )}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>
        {def.name}
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-[24px] text-foreground font-mono" style={{ fontWeight: 700 }}>
          {formatMeterValue(cur ? Number(cur.value) : null, def.decimal_places)}
        </span>
        <span className="text-[11.5px] text-muted-foreground">{def.unit}</span>
      </div>
      {cur ? (
        <div className="text-[11px] text-muted-foreground mt-1">
          as of {cur.reading_date}{' '}
          <span className="text-muted-foreground/60">· {cur.source}</span>
        </div>
      ) : (
        <div className="text-[11px] text-muted-foreground italic mt-1">no readings yet</div>
      )}
    </div>
  )
}

function ProfilePicker({
  profiles,
  onLoad,
  currentProfileId,
  onPick,
  disabled,
}: {
  profiles: Array<MeterProfile & { meters: MeterDefinition[] }>
  onLoad: () => void
  currentProfileId: string | null
  onPick: (id: string | null) => void
  disabled: boolean
}) {
  const [open, setOpen] = useState(false)

  function handleClick() {
    if (!open) onLoad()
    setOpen((o) => !o)
  }

  return (
    <div className="relative">
      <Button variant="outline" size="sm" onClick={handleClick} disabled={disabled}>
        Assign profile
      </Button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 w-64 bg-white border border-border rounded-xl shadow-lg overflow-hidden">
          <div className="max-h-64 overflow-y-auto">
            {profiles.length === 0 ? (
              <div className="p-3 text-[12px] text-muted-foreground">
                No profiles yet. Create one on /meters.
              </div>
            ) : (
              <ul>
                {profiles.map((p) => {
                  const active = p.id === currentProfileId
                  return (
                    <li key={p.id}>
                      <button
                        onClick={() => { setOpen(false); onPick(p.id) }}
                        className={cn(
                          'w-full text-left px-3 py-2 text-[12.5px] hover:bg-muted',
                          active && 'bg-blue-50/50',
                        )}
                      >
                        <div className="text-foreground" style={{ fontWeight: active ? 600 : 500 }}>{p.name}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {p.meters.map((m) => m.name).join(', ')}
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function EditReadingInline({
  reading,
  decimalPlaces,
  onClose,
  onSaved,
}: {
  reading: MeterReading
  decimalPlaces: number
  onClose: () => void
  onSaved: () => void
}) {
  const [value, setValue] = useState(String(Number(reading.value).toFixed(decimalPlaces)))
  const [date, setDate] = useState(reading.reading_date)
  const [notes, setNotes] = useState(reading.notes ?? '')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch(`/api/meter-readings/${reading.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          value: Number(value),
          reading_date: date,
          notes: notes.trim() || null,
        }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(payload?.error || 'Save failed')
        return
      }
      toast.success('Reading updated')
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="absolute inset-x-0 mt-12 z-10 bg-white border border-border rounded-xl shadow-lg p-3 grid grid-cols-1 md:grid-cols-[1fr,1fr,1fr,auto,auto] gap-2 items-end">
      <input
        type="number"
        step="any"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="rounded-lg border border-border bg-white px-3 py-2 text-[13px] outline-none focus:border-primary"
      />
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="rounded-lg border border-border bg-white px-3 py-2 text-[13px] outline-none focus:border-primary"
      />
      <input
        type="text"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes"
        className="rounded-lg border border-border bg-white px-3 py-2 text-[13px] outline-none focus:border-primary"
      />
      <Button size="sm" onClick={handleSave} disabled={saving}>
        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save'}
      </Button>
      <Button size="sm" variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
    </div>
  )
}
