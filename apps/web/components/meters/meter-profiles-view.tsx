'use client'

/**
 * MetersPage view (Spec 1.1) — list of meter profiles + their meter
 * definitions. Mechanic+ can add and delete profiles inline.
 */

import { useEffect, useState } from 'react'
import { Gauge, Plus, Trash2, Loader2, Ruler } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { MeterProfileForm } from './meter-profile-form'
import type { MeterProfile, MeterDefinition, OrgRole } from '@/types'

type ProfileWithMeters = MeterProfile & { meters: MeterDefinition[] }

const READ_ONLY_ROLES = new Set<OrgRole>(['viewer', 'auditor', 'pilot'])

const UNIT_LABEL: Record<MeterDefinition['unit'], string> = {
  hours: 'hours',
  cycles: 'cycles',
  landings: 'landings',
  minutes: 'min',
  starts: 'starts',
}

export function MeterProfilesView({ userRole }: { userRole: OrgRole }) {
  const canMutate = !READ_ONLY_ROLES.has(userRole)
  const [profiles, setProfiles] = useState<ProfileWithMeters[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  async function load() {
    try {
      const res = await fetch('/api/meter-profiles', { cache: 'no-store' })
      if (!res.ok) return
      const payload = await res.json()
      setProfiles((payload.profiles ?? []) as ProfileWithMeters[])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete meter profile "${name}"? Aircraft using it will be unassigned and all readings under its meters will be removed.`)) return
    try {
      const res = await fetch(`/api/meter-profiles/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        toast.error(j?.error || 'Could not delete profile')
        return
      }
      toast.success(`Deleted "${name}"`)
      setProfiles((p) => p.filter((x) => x.id !== id))
    } catch {
      toast.error('Could not delete profile')
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>
            Meter profiles
          </h1>
          <p className="text-[13px] text-muted-foreground mt-1">
            Templates that bundle the meters your aircraft track — Hobbs, Tach, cycles,
            landings. Assign a profile to an aircraft, then log readings to drive
            compliance + AI insights.
          </p>
        </div>
        {canMutate && !creating && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            New profile
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
            <MeterProfileForm
              onCancel={() => setCreating(false)}
              onCreated={() => { setCreating(false); load() }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : profiles.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-10 text-center">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-white border border-border flex items-center justify-center mb-3">
            <Gauge className="h-5 w-5 text-muted-foreground" />
          </div>
          <h3 className="text-[14px] text-foreground" style={{ fontWeight: 600 }}>
            No meter profiles yet
          </h3>
          <p className="text-[12.5px] text-muted-foreground mt-1 max-w-md mx-auto">
            Create your first profile — most piston operators want a "Piston Single"
            profile with Hobbs and Tach meters.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          <AnimatePresence>
            {profiles.map((p) => (
              <motion.li
                key={p.id}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.12 }}
                className="bg-white rounded-2xl border border-border p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Gauge className="h-4 w-4 text-muted-foreground" />
                      <h3 className="text-[14px] text-foreground" style={{ fontWeight: 700 }}>
                        {p.name}
                      </h3>
                      {p.is_template && (
                        <span className="text-[10px] uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded-full" style={{ fontWeight: 700 }}>
                          template
                        </span>
                      )}
                    </div>
                    {p.description && (
                      <p className="text-[12px] text-muted-foreground mt-1">{p.description}</p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {p.meters.map((m) => (
                        <span
                          key={m.id}
                          className={cn(
                            'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border',
                            'bg-muted/40 text-foreground border-border',
                          )}
                          style={{ fontWeight: 500 }}
                        >
                          <Ruler className="h-2.5 w-2.5 text-muted-foreground" />
                          {m.name} <span className="text-muted-foreground">{UNIT_LABEL[m.unit]} · {m.decimal_places}.dp</span>
                        </span>
                      ))}
                    </div>
                  </div>
                  {canMutate && (
                    <button
                      onClick={() => handleDelete(p.id, p.name)}
                      title="Delete profile"
                      className="p-2 rounded-lg text-muted-foreground hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  )
}
