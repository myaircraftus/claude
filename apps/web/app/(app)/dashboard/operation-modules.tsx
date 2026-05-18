'use client'

/**
 * SOP-DOC-001 Item 4 — operation-type-aware owner dashboard modules.
 *
 * Renders the module set returned by getOwnerModules(operation_type) and an
 * inline selector to change the operation type. Modules without a route yet
 * render as "coming soon" cards so the operation-type wiring is fully
 * visible. operation_type changes never affect document permissions.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from '@/components/shared/tenant-link'
import { ArrowRight, Lock, LayoutGrid } from 'lucide-react'
import type { OrganizationOperationType } from '@/types'
import {
  getOwnerModules,
  OWNER_MODULE_META,
  OWNER_OPERATION_TYPE_LABELS,
} from '@/lib/dashboard/owner-modules'

const OPERATION_TYPES: OrganizationOperationType[] = [
  'private',
  'partnership',
  'flight_school',
  'flying_club',
  'corporate',
]

export function OperationModules({
  organizationId,
  operationType,
}: {
  organizationId: string
  operationType: OrganizationOperationType
}) {
  const router = useRouter()
  const [current, setCurrent] = useState<OrganizationOperationType>(operationType)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function changeOperationType(next: OrganizationOperationType) {
    if (next === current || saving) return
    const prev = current
    setCurrent(next)
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/organizations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organization_id: organizationId, operation_type: next }),
      })
      if (!res.ok) throw new Error('Update failed')
      router.refresh()
    } catch {
      setCurrent(prev)
      setError('Could not update operation type. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const modules = getOwnerModules(current)

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h2
          className="flex items-center gap-1.5 text-[14px] text-foreground"
          style={{ fontWeight: 700 }}
        >
          <LayoutGrid className="h-4 w-4 text-muted-foreground" /> Dashboard Modules
        </h2>
        <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
          Operation type
          <select
            value={current}
            disabled={saving}
            onChange={(e) => changeOperationType(e.target.value as OrganizationOperationType)}
            className="h-8 rounded-md border border-border bg-background px-2 text-[12px] text-foreground disabled:opacity-60"
          >
            {OPERATION_TYPES.map((t) => (
              <option key={t} value={t}>
                {OWNER_OPERATION_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && <p className="mb-2 text-[12px] text-destructive">{error}</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((key) => {
          const meta = OWNER_MODULE_META[key]
          if (!meta) return null
          const card = (
            <div
              className={`flex h-full flex-col rounded-2xl border border-border bg-white p-4 ${
                meta.href ? 'transition-all hover:border-primary/40 hover:shadow-sm' : ''
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13.5px] text-foreground" style={{ fontWeight: 700 }}>
                  {meta.label}
                </span>
                {meta.href ? (
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                ) : (
                  <span className="inline-flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
                    <Lock className="h-3 w-3" /> Coming soon
                  </span>
                )}
              </div>
              <p className="mt-1 text-[11.5px] text-muted-foreground">{meta.description}</p>
            </div>
          )
          return meta.href ? (
            <Link key={key} href={meta.href}>
              {card}
            </Link>
          ) : (
            <div key={key}>{card}</div>
          )
        })}
      </div>
    </section>
  )
}
