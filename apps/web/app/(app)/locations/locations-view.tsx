'use client'

/**
 * LocationsView — full CRUD for org-scoped Locations (Spec 0.1).
 *
 * Layout: header + create-row form + table. Inline edit on click. Optimistic
 * delete with confirm. RLS + role gates are enforced server-side; the UI
 * just hides the create/edit/delete affordances for read-only members.
 */

import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  Plus, MapPin, Loader2, Trash2, Edit3, Save, X, Building2, Plane,
  ParkingCircle, Wrench, Briefcase,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { Location, LocationType } from '@/types'

const TYPE_OPTIONS: Array<{ value: LocationType; label: string; icon: any }> = [
  { value: 'hangar',   label: 'Hangar',    icon: Building2 },
  { value: 'tie-down', label: 'Tie-Down',  icon: Plane },
  { value: 'ramp',     label: 'Ramp',      icon: ParkingCircle },
  { value: 'shop',     label: 'Shop',      icon: Wrench },
  { value: 'office',   label: 'Office',    icon: Briefcase },
]

const TYPE_PILL: Record<LocationType, string> = {
  hangar:   'bg-blue-50 text-blue-700 border-blue-200',
  'tie-down': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  ramp:     'bg-amber-50 text-amber-700 border-amber-200',
  shop:     'bg-violet-50 text-violet-700 border-violet-200',
  office:   'bg-slate-100 text-slate-700 border-slate-200',
}

const READ_ONLY_ROLES = new Set(['viewer', 'auditor', 'pilot'])

export function LocationsView({
  initialLocations,
  userRole,
}: {
  initialLocations: Location[]
  userRole: string
}) {
  const [locations, setLocations] = useState<Location[]>(initialLocations)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState<{ name: string; airport_code: string; location_type: LocationType; address: string }>({
    name: '',
    airport_code: '',
    location_type: 'hangar',
    address: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<Partial<Location> | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const canMutate = !READ_ONLY_ROLES.has(userRole)

  const sortedLocations = useMemo(
    () => [...locations].sort((a, b) => a.name.localeCompare(b.name)),
    [locations],
  )

  const handleCreate = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting || !draft.name.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: draft.name.trim(),
          airport_code: draft.airport_code.trim() || null,
          location_type: draft.location_type,
          address: draft.address.trim() || null,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json?.error || `Create failed (${res.status})`)
        return
      }
      setLocations((prev) => [...prev, json as Location])
      setDraft({ name: '', airport_code: '', location_type: 'hangar', address: '' })
      setCreating(false)
      toast.success(`Location "${json.name}" created`)
    } finally {
      setSubmitting(false)
    }
  }, [draft, submitting])

  const handleStartEdit = useCallback((loc: Location) => {
    setEditingId(loc.id)
    setEditDraft({
      name: loc.name,
      airport_code: loc.airport_code ?? '',
      location_type: loc.location_type,
      address: loc.address ?? '',
    })
  }, [])

  const handleSaveEdit = useCallback(async (id: string) => {
    if (!editDraft || savingEdit) return
    setSavingEdit(true)
    try {
      const res = await fetch(`/api/locations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editDraft.name,
          airport_code: editDraft.airport_code ?? null,
          location_type: editDraft.location_type,
          address: editDraft.address ?? null,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json?.error || 'Save failed')
        return
      }
      setLocations((prev) => prev.map((l) => (l.id === id ? (json as Location) : l)))
      setEditingId(null)
      setEditDraft(null)
      toast.success('Location updated')
    } finally {
      setSavingEdit(false)
    }
  }, [editDraft, savingEdit])

  const handleDelete = useCallback(async (loc: Location) => {
    if (!confirm(`Delete location "${loc.name}"? Aircraft / WOs / etc. tagged to it will become "no location" (records aren't deleted).`)) return
    setDeletingId(loc.id)
    try {
      const res = await fetch(`/api/locations/${loc.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        toast.error(j?.error || 'Delete failed')
        return
      }
      setLocations((prev) => prev.filter((l) => l.id !== loc.id))
      toast.success(`"${loc.name}" deleted`)
    } finally {
      setDeletingId(null)
    }
  }, [])

  return (
    <div className="flex flex-col h-full bg-[#F7F8FA]">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border bg-white flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <MapPin className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-[18px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>
              Locations
            </h1>
            <p className="text-[12px] text-muted-foreground">
              Hangars, tie-downs, ramps, shop bays, and offices in your organization.
            </p>
          </div>
        </div>
        {canMutate && !creating && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            New Location
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {/* Create row */}
        {creating && canMutate && (
          <form
            onSubmit={handleCreate}
            className="bg-white border border-border rounded-xl p-4 mb-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">New Location</h3>
              <button type="button" onClick={() => setCreating(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>
                  Name
                </Label>
                <Input
                  autoFocus
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  placeholder="KAPA Hangar 14"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>
                  Airport Code
                </Label>
                <Input
                  value={draft.airport_code}
                  onChange={(e) => setDraft((d) => ({ ...d, airport_code: e.target.value.toUpperCase() }))}
                  placeholder="KAPA"
                  maxLength={4}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>
                Type
              </Label>
              <div className="flex flex-wrap gap-2">
                {TYPE_OPTIONS.map((opt) => {
                  const Icon = opt.icon
                  const active = draft.location_type === opt.value
                  return (
                    <button
                      type="button"
                      key={opt.value}
                      onClick={() => setDraft((d) => ({ ...d, location_type: opt.value }))}
                      className={cn(
                        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-all',
                        active
                          ? 'border-primary bg-primary/5 text-foreground ring-2 ring-primary/20'
                          : 'border-border text-muted-foreground hover:border-primary/30 hover:bg-muted/30',
                      )}
                      style={{ fontWeight: active ? 600 : 500 }}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground" style={{ fontWeight: 600 }}>
                Address (optional)
              </Label>
              <Input
                value={draft.address}
                onChange={(e) => setDraft((d) => ({ ...d, address: e.target.value }))}
                placeholder="7800 S Peoria St, Englewood CO 80112"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setCreating(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting || !draft.name.trim()}>
                {submitting ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Creating…</> : <><Plus className="h-4 w-4 mr-1" /> Create</>}
              </Button>
            </div>
          </form>
        )}

        {/* Empty state */}
        {sortedLocations.length === 0 && !creating && (
          <div className="flex flex-col items-center justify-center py-16 text-center bg-white border border-border rounded-xl">
            <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-3">
              <MapPin className="h-7 w-7 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">No locations yet</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              Create your first location (e.g. "KAPA Hangar 14"). Aircraft, work orders, invoices, and documents can be tagged with a location so multi-base shops can filter their views.
            </p>
            {canMutate && (
              <Button className="mt-4" onClick={() => setCreating(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                New Location
              </Button>
            )}
          </div>
        )}

        {/* List */}
        {sortedLocations.length > 0 && (
          <div className="bg-white border border-border rounded-xl overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted/30 border-b border-border">
                <tr>
                  {['Name', 'Type', 'Airport', 'Address', 'Created', ''].map((h) => (
                    <th
                      key={h || 'actions'}
                      className="text-left px-4 py-3 text-[11px] text-muted-foreground uppercase tracking-wider whitespace-nowrap"
                      style={{ fontWeight: 600 }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sortedLocations.map((loc) => {
                  const isEditing = editingId === loc.id
                  const Icon = TYPE_OPTIONS.find((t) => t.value === loc.location_type)?.icon ?? Building2
                  return (
                    <tr key={loc.id} className="hover:bg-muted/20 transition-colors">
                      {/* Name */}
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <Input
                            value={editDraft?.name ?? ''}
                            onChange={(e) => setEditDraft((d) => ({ ...(d ?? {}), name: e.target.value }))}
                            className="h-8 text-sm"
                          />
                        ) : (
                          <div className="flex items-center gap-2 text-[13px] text-foreground" style={{ fontWeight: 600 }}>
                            <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                            {loc.name}
                          </div>
                        )}
                      </td>

                      {/* Type */}
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <select
                            value={(editDraft?.location_type as LocationType) ?? 'hangar'}
                            onChange={(e) => setEditDraft((d) => ({ ...(d ?? {}), location_type: e.target.value as LocationType }))}
                            className="h-8 px-2 rounded-md border border-input bg-white text-xs"
                          >
                            {TYPE_OPTIONS.map((t) => (
                              <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                          </select>
                        ) : (
                          <span className={cn(
                            'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] border capitalize',
                            TYPE_PILL[loc.location_type],
                          )} style={{ fontWeight: 600 }}>
                            {loc.location_type.replace('-', ' ')}
                          </span>
                        )}
                      </td>

                      {/* Airport */}
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <Input
                            value={(editDraft?.airport_code as string) ?? ''}
                            onChange={(e) => setEditDraft((d) => ({ ...(d ?? {}), airport_code: e.target.value.toUpperCase() }))}
                            className="h-8 text-sm w-20 font-mono uppercase"
                            maxLength={4}
                          />
                        ) : (
                          <span className="text-[12px] font-mono text-foreground">
                            {loc.airport_code ?? '—'}
                          </span>
                        )}
                      </td>

                      {/* Address */}
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <Input
                            value={(editDraft?.address as string) ?? ''}
                            onChange={(e) => setEditDraft((d) => ({ ...(d ?? {}), address: e.target.value }))}
                            className="h-8 text-sm"
                          />
                        ) : (
                          <span className="text-[12px] text-muted-foreground">{loc.address ?? '—'}</span>
                        )}
                      </td>

                      {/* Created */}
                      <td className="px-4 py-3">
                        <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                          {new Date(loc.created_at).toLocaleDateString()}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-right">
                        {canMutate && (
                          <div className="flex items-center justify-end gap-1">
                            {isEditing ? (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => { setEditingId(null); setEditDraft(null) }}
                                  className="h-7 px-2"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => handleSaveEdit(loc.id)}
                                  disabled={savingEdit}
                                  className="h-7 px-2"
                                >
                                  {savingEdit ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleStartEdit(loc)}
                                  className="h-7 px-2 text-muted-foreground hover:text-foreground"
                                >
                                  <Edit3 className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleDelete(loc)}
                                  disabled={deletingId === loc.id}
                                  className="h-7 px-2 text-muted-foreground hover:text-destructive"
                                >
                                  {deletingId === loc.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                </Button>
                              </>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
