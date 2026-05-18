'use client'

/**
 * SOP-WRK-001 §10 — admin editor for a workforce_employee_profile.
 * Rendered only for the admin workforce role; the API re-checks.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

export interface EmployeeProfileInitial {
  employee_code: string
  role_title: string
  department: string
  employment_status: string
  employment_type: string
  workforce_role: string
  hourly_rate_dollars: string
}

const WORKFORCE_ROLES = ['admin', 'manager', 'mechanic', 'payroll_admin', 'auditor']
const EMPLOYMENT_STATUSES = ['active', 'inactive', 'on_leave']
const EMPLOYMENT_TYPES = ['hourly', 'salary', 'contractor']

const labelCls = 'block text-[12px] font-medium text-muted-foreground mb-1'
const inputCls =
  'h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring'

export function EmployeeProfileForm({
  userId,
  initial,
  canViewPayRates,
}: {
  userId: string
  initial: EmployeeProfileInitial
  canViewPayRates: boolean
}) {
  const router = useRouter()
  const [form, setForm] = useState<EmployeeProfileInitial>(initial)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  function set<K extends keyof EmployeeProfileInitial>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function save() {
    setBusy(true)
    setMsg(null)
    try {
      const rate = form.hourly_rate_dollars.trim()
      const body: Record<string, unknown> = {
        user_id: userId,
        employee_code: form.employee_code.trim() || null,
        role_title: form.role_title.trim() || null,
        department: form.department.trim() || null,
        employment_status: form.employment_status,
        employment_type: form.employment_type,
        workforce_role: form.workforce_role,
      }
      if (canViewPayRates) {
        body.hourly_rate_cents = rate ? Math.round(Number(rate) * 100) : null
      }
      const res = await fetch('/api/workforce/employees', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'Save failed')
      }
      setMsg({ kind: 'ok', text: 'Profile saved.' })
      router.refresh()
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Save failed' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelCls}>Employee code</label>
          <input className={inputCls} value={form.employee_code} onChange={(e) => set('employee_code', e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Role / title</label>
          <input className={inputCls} value={form.role_title} onChange={(e) => set('role_title', e.target.value)} placeholder="A&P Technician" />
        </div>
        <div>
          <label className={labelCls}>Department</label>
          <input className={inputCls} value={form.department} onChange={(e) => set('department', e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Workforce role</label>
          <select className={inputCls} value={form.workforce_role} onChange={(e) => set('workforce_role', e.target.value)}>
            {WORKFORCE_ROLES.map((r) => (
              <option key={r} value={r}>{r.replace('_', ' ')}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Employment status</label>
          <select className={inputCls} value={form.employment_status} onChange={(e) => set('employment_status', e.target.value)}>
            {EMPLOYMENT_STATUSES.map((s) => (
              <option key={s} value={s}>{s.replace('_', ' ')}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Employment type</label>
          <select className={inputCls} value={form.employment_type} onChange={(e) => set('employment_type', e.target.value)}>
            {EMPLOYMENT_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        {canViewPayRates && (
          <div>
            <label className={labelCls}>Hourly rate (USD)</label>
            <input
              className={inputCls}
              type="number"
              min="0"
              step="0.01"
              value={form.hourly_rate_dollars}
              onChange={(e) => set('hourly_rate_dollars', e.target.value)}
              placeholder="e.g. 42.00"
            />
          </div>
        )}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[12px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Save profile
        </button>
        {msg && (
          <span className={`text-[12px] ${msg.kind === 'ok' ? 'text-green-700' : 'text-destructive'}`}>
            {msg.text}
          </span>
        )}
      </div>
    </div>
  )
}
