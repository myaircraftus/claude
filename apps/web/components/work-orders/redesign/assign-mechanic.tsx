'use client'

/**
 * AssignMechanic — assign / reassign a work order to a team member.
 *
 * Self-contained: fetches the org team from /api/team, shows a small pill
 * dropdown (current assignee or "Assign mechanic"), and PATCHes
 * /api/work-orders/[id] { assigned_mechanic_id } on select. The PATCH route
 * already whitelists assigned_mechanic_id, so no API change is needed.
 *
 * This is the write side of the mechanic "my work" loop — once a WO has an
 * assignee, it shows up in that mechanic's "My Assignments" on the dashboard
 * and (optionally) under the "Assigned to me" filter on the work-order list.
 */

import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface Member {
  id: string
  name: string
  role: string
}

// Roles that actually perform shop work and can own a work order.
const ASSIGNABLE_ROLES = new Set(['owner', 'admin', 'mechanic'])

export function AssignMechanic({
  workOrderId,
  value,
  onChange,
}: {
  workOrderId: string
  value: string | null
  onChange: (id: string | null) => void
}) {
  const [members, setMembers] = useState<Member[]>([])
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/team')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j) return
        const list: Member[] = (j.members ?? [])
          .filter((m: any) => ASSIGNABLE_ROLES.has(m.role) && m.profile)
          .map((m: any) => ({
            id: m.profile.id ?? m.user_id,
            name: m.profile.full_name || m.profile.email || 'Team member',
            role: m.role,
          }))
        setMembers(list)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const current = members.find((m) => m.id === value) ?? null
  const label = current ? current.name : value ? 'Assigned' : 'Assign mechanic'

  async function assign(id: string | null) {
    setOpen(false)
    if (id === value) return
    setSaving(true)
    try {
      const res = await fetch(`/api/work-orders/${workOrderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigned_mechanic_id: id }),
      })
      if (!res.ok) throw new Error('patch failed')
      onChange(id)
      toast.success(id ? `Assigned to ${members.find((m) => m.id === id)?.name ?? 'mechanic'}` : 'Unassigned')
    } catch {
      toast.error('Could not update assignment')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={saving}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors disabled:opacity-50',
          current ? 'border-border bg-muted text-foreground hover:opacity-80' : 'border-dashed border-border text-muted-foreground hover:text-foreground',
        )}
      >
        <UserRound className="h-3 w-3" />
        {label}
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>
      {open && (
        <div className="absolute left-0 z-20 mt-1 w-56 rounded-xl border border-border bg-background py-1 shadow-lg">
          <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">Assign to</div>
          <button
            onClick={() => assign(null)}
            className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted"
          >
            <span className="text-muted-foreground">Unassigned</span>
            {value == null && <Check className="h-3.5 w-3.5 shrink-0" />}
          </button>
          {members.map((m) => (
            <button
              key={m.id}
              onClick={() => assign(m.id)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
            >
              <span className="truncate">{m.name}</span>
              {m.id === value && <Check className="h-3.5 w-3.5 shrink-0" />}
            </button>
          ))}
          {members.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground">No team members found.</div>}
        </div>
      )}
    </div>
  )
}
