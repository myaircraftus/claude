'use client'

/**
 * NotificationPreferencesView — per-category × per-channel toggle grid (Spec 0.4).
 *
 * Reads /api/notifications/preferences, displays a category × channel matrix,
 * each cell is a toggle. Saving a toggle PUTs to the same endpoint. Missing
 * rows fall back to the channel defaults defined in lib/notifications/dispatch.ts.
 */

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { NotificationChannel, NotificationPreference } from '@/lib/notifications/types'

interface CategoryDef {
  key: string
  label: string
  description: string
}

const CATEGORIES: CategoryDef[] = [
  { key: 'compliance',  label: 'Compliance',     description: 'Annuals, ADs, SBs, and regulatory items.' },
  { key: 'expiration',  label: 'Expirations',    description: 'Pilot certs, mediclas, registrations, insurance.' },
  { key: 'maintenance', label: 'Maintenance',    description: 'Squawks, work-order updates, parts arrivals.' },
  { key: 'approval',    label: 'Approvals',      description: 'Customer approval requests + responses.' },
  { key: 'anomaly',     label: 'Anomalies',      description: 'AI / ML-flagged trends and outliers.' },
  { key: 'insight',     label: 'Insights',       description: 'AI-generated maintenance suggestions.' },
  { key: 'reminder',    label: 'Reminders',      description: 'Time-based reminders you scheduled.' },
  { key: 'system',      label: 'System',         description: 'Billing, integration health, account-level.' },
]

const CHANNELS: { key: NotificationChannel; label: string }[] = [
  { key: 'in-app', label: 'In-app' },
  { key: 'email',  label: 'Email' },
  { key: 'push',   label: 'Push' },
  { key: 'sms',    label: 'SMS' },
]

// Mirror of CHANNEL_DEFAULTS in lib/notifications/dispatch.ts so the UI
// shows the right state for cells that have no preference row yet. Kept
// as a const map rather than imported to avoid pulling server code into
// the client bundle.
const CHANNEL_DEFAULTS: Record<string, Record<NotificationChannel, boolean>> = {
  compliance:  { 'in-app': true, email: true,  push: false, sms: false },
  expiration:  { 'in-app': true, email: true,  push: false, sms: false },
  maintenance: { 'in-app': true, email: false, push: false, sms: false },
  approval:    { 'in-app': true, email: true,  push: false, sms: false },
  anomaly:     { 'in-app': true, email: true,  push: false, sms: false },
  insight:     { 'in-app': true, email: false, push: false, sms: false },
  reminder:    { 'in-app': true, email: true,  push: false, sms: false },
  system:      { 'in-app': true, email: false, push: false, sms: false },
}

function key(category: string, channel: NotificationChannel) {
  return `${category}::${channel}`
}

export function NotificationPreferencesView() {
  const [loading, setLoading] = useState(true)
  const [prefMap, setPrefMap] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/notifications/preferences', { cache: 'no-store' })
        if (!res.ok) return
        const payload = await res.json()
        if (cancelled) return
        const m: Record<string, boolean> = {}
        for (const p of (payload.preferences ?? []) as NotificationPreference[]) {
          m[key(p.category, p.channel)] = p.enabled
        }
        setPrefMap(m)
      } catch {
        toast.error('Could not load preferences')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  function isOn(category: string, channel: NotificationChannel): boolean {
    const k = key(category, channel)
    if (k in prefMap) return prefMap[k]
    return CHANNEL_DEFAULTS[category]?.[channel] ?? false
  }

  async function toggle(category: string, channel: NotificationChannel) {
    const next = !isOn(category, channel)
    const k = key(category, channel)
    setSaving(k)
    setPrefMap((m) => ({ ...m, [k]: next }))
    try {
      const res = await fetch('/api/notifications/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, channel, enabled: next }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error || 'Save failed')
      }
    } catch (e: any) {
      // Roll back on failure
      setPrefMap((m) => ({ ...m, [k]: !next }))
      toast.error(e?.message || 'Could not save preference')
    } finally {
      setSaving(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-[22px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>
          Notification preferences
        </h1>
        <p className="text-[13px] text-muted-foreground mt-1">
          Choose which channels each category fires on. In-app is always available — email,
          push, and SMS deliver once their integrations are configured (currently TODO).
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-white overflow-hidden">
        {/* Header row */}
        <div className="grid grid-cols-[1fr,repeat(4,80px)] items-center px-4 py-2.5 bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>
          <div>Category</div>
          {CHANNELS.map((c) => (
            <div key={c.key} className="text-center">{c.label}</div>
          ))}
        </div>
        <ul className="divide-y divide-border">
          {CATEGORIES.map((cat) => (
            <li key={cat.key} className="grid grid-cols-[1fr,repeat(4,80px)] items-start px-4 py-3">
              <div className="pr-3">
                <div className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>
                  {cat.label}
                </div>
                <div className="text-[11.5px] text-muted-foreground mt-0.5 leading-relaxed">
                  {cat.description}
                </div>
              </div>
              {CHANNELS.map((ch) => {
                const k = key(cat.key, ch.key)
                const on = isOn(cat.key, ch.key)
                const busy = saving === k
                const disabled = ch.key !== 'in-app' // adapter TODO — see dispatch.ts
                return (
                  <div key={ch.key} className="flex justify-center">
                    <button
                      onClick={() => !busy && !disabled && toggle(cat.key, ch.key)}
                      disabled={busy || disabled}
                      title={disabled ? `${ch.label} adapter not yet wired (TODO)` : undefined}
                      className={cn(
                        'relative w-9 h-5 rounded-full transition-colors',
                        on ? 'bg-blue-500' : 'bg-muted',
                        (busy || disabled) && 'opacity-60 cursor-not-allowed',
                      )}
                    >
                      <span
                        className={cn(
                          'absolute top-0.5 h-4 w-4 bg-white rounded-full shadow transition-all',
                          on ? 'left-[18px]' : 'left-0.5',
                        )}
                      />
                    </button>
                  </div>
                )
              })}
            </li>
          ))}
        </ul>
      </div>

      <p className="text-[11px] text-muted-foreground/80">
        Email, push, and SMS adapters are stubbed pending vendor integration (SendGrid /
        Web Push / Twilio). In-app deliveries always work.
      </p>
    </div>
  )
}
