'use client'

/**
 * OrgSettingsView (Spec 6.2) — defaults that fall back into the
 * resolveLaborRate (3.1), reminder scheduler (cross-cutting C1), and
 * predictor narration (5.3).
 */

import { useEffect, useState } from 'react'
import { Loader2, Save, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

interface Settings {
  default_labor_rates?: Record<string, number>
  tax_profile?: { rate?: number; jurisdiction?: string; exempt?: boolean; exemption_id?: string | null }
  notification_preferences?: { in_app?: boolean; email?: boolean; push?: boolean; sms?: boolean }
  ai_behavior?: 'aggressive' | 'balanced' | 'conservative'
}

const DEPTS = ['airframe', 'engine', 'avionics', 'interior', 'shop'] as const

export function OrgSettingsView({ canWrite }: { canWrite: boolean }) {
  const [settings, setSettings] = useState<Settings>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/org/settings').then((r) => r.json())
      .then((j: { settings?: Settings; error?: string }) => {
        if (j.error) setError(j.error)
        else setSettings(j.settings ?? {})
      })
      .finally(() => setLoading(false))
  }, [])

  async function save() {
    setSaving(true)
    try {
      const res = await fetch('/api/org/settings', {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(settings),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`)
      toast.success('Settings saved')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="rounded-2xl border border-border bg-white p-8 text-center text-[12px] text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mx-auto" /></div>
  }
  if (error) {
    return <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-[12px] text-rose-800 flex gap-2"><AlertCircle className="h-4 w-4 shrink-0 mt-0.5" /> {error}</div>
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[22px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>Organization settings</h1>
        <p className="text-[13px] text-muted-foreground mt-1">Defaults that fall back into the labor-rate resolver, reminder scheduler, and AI predictor narration.</p>
      </div>

      <Card title="Default labor rates" subtitle="Per-department fallback when an aircraft has no contract rate (Spec 3.1).">
        <div className="space-y-2">
          {DEPTS.map((d) => (
            <div key={d} className="flex items-center gap-2">
              <span className="w-24 text-[12px] capitalize text-muted-foreground">{d}</span>
              <span className="text-[12px] text-muted-foreground">$</span>
              <input
                type="number" step="0.01" min="0"
                value={settings.default_labor_rates?.[d] ?? ''}
                disabled={!canWrite}
                onChange={(e) => setSettings((s) => ({
                  ...s,
                  default_labor_rates: {
                    ...(s.default_labor_rates ?? {}),
                    [d]: parseFloat(e.target.value) || 0,
                  },
                }))}
                className="flex-1 border border-border rounded-md px-2 py-1.5 text-[12.5px] tabular-nums"
              />
              <span className="text-[11px] text-muted-foreground">/hr</span>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Tax profile" subtitle="Default tax applied to invoices when an aircraft has no override.">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Rate %">
            <input type="number" step="0.01" min="0" max="100"
              value={settings.tax_profile?.rate ?? 0} disabled={!canWrite}
              onChange={(e) => setSettings((s) => ({ ...s, tax_profile: { ...(s.tax_profile ?? {}), rate: parseFloat(e.target.value) || 0 } }))}
              className="w-full border border-border rounded-md px-2 py-1.5 text-[12.5px] tabular-nums" />
          </Field>
          <Field label="Jurisdiction">
            <input type="text" value={settings.tax_profile?.jurisdiction ?? ''} disabled={!canWrite}
              onChange={(e) => setSettings((s) => ({ ...s, tax_profile: { ...(s.tax_profile ?? {}), jurisdiction: e.target.value } }))}
              className="w-full border border-border rounded-md px-2 py-1.5 text-[12.5px]" />
          </Field>
          <label className="col-span-2 inline-flex items-center gap-2 text-[12px]">
            <input type="checkbox" disabled={!canWrite}
              checked={!!settings.tax_profile?.exempt}
              onChange={(e) => setSettings((s) => ({ ...s, tax_profile: { ...(s.tax_profile ?? {}), exempt: e.target.checked } }))}
            /> Tax-exempt
          </label>
        </div>
      </Card>

      <Card title="Notification preferences" subtitle="Channels enabled for outbound notifications.">
        <div className="grid grid-cols-2 gap-2">
          {(['in_app', 'email', 'push', 'sms'] as const).map((ch) => (
            <label key={ch} className="inline-flex items-center gap-2 text-[12px] capitalize cursor-pointer">
              <input type="checkbox" disabled={!canWrite}
                checked={settings.notification_preferences?.[ch] ?? (ch === 'in_app')}
                onChange={(e) => setSettings((s) => ({ ...s, notification_preferences: { ...(s.notification_preferences ?? {}), [ch]: e.target.checked } }))}
              /> {ch.replace('_', '-')}
            </label>
          ))}
        </div>
      </Card>

      <Card title="AI behavior" subtitle="Tone for predictor narration + AI-generated bodies (Spec 5.3 + 7.6).">
        <select value={settings.ai_behavior ?? 'balanced'} disabled={!canWrite}
          onChange={(e) => setSettings((s) => ({ ...s, ai_behavior: e.target.value as Settings['ai_behavior'] }))}
          className="border border-border rounded-md px-2 py-1.5 text-[12.5px] bg-white">
          <option value="conservative">Conservative — surface high-confidence findings only</option>
          <option value="balanced">Balanced — default</option>
          <option value="aggressive">Aggressive — surface lower-confidence speculation too</option>
        </select>
      </Card>

      {canWrite && (
        <div className="flex justify-end">
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
            Save settings
          </Button>
        </div>
      )}
    </div>
  )
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-white p-5">
      <h3 className="text-[14px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>{title}</h3>
      {subtitle && <p className="text-[11.5px] text-muted-foreground mt-0.5 mb-3">{subtitle}</p>}
      {children}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  )
}
