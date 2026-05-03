'use client'

/**
 * PricingTab (Spec 3.1) — per-aircraft pricing override editor.
 *
 * Loads the aircraft_pricing row via /api/aircraft/[id]/pricing, lets
 * owner+/admin edit contract rates per department, default discount,
 * tax override, billing profile, and split billing. Saves via PUT.
 */

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Save, Plus, Trash2, AlertCircle, DollarSign } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type {
  AircraftPricing, ContractRate, LaborDepartment, TaxProfile, BillingProfile, SplitBilling,
} from '@/types'

const DEPARTMENTS: LaborDepartment[] = ['airframe', 'engine', 'avionics', 'interior', 'shop']

interface Props {
  aircraftId: string
  tailNumber: string
  canWrite: boolean
}

interface Form {
  contract_rates: ContractRate[]
  default_discount_pct: number
  tax_override: TaxProfile | null
  billing_profile: BillingProfile | null
  split_billing: SplitBilling | null
}

const EMPTY: Form = {
  contract_rates: [],
  default_discount_pct: 0,
  tax_override: null,
  billing_profile: null,
  split_billing: null,
}

export function PricingTab({ aircraftId, tailNumber, canWrite }: Props) {
  const [form, setForm] = useState<Form>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/aircraft/${aircraftId}/pricing`)
      const json = (await res.json()) as { pricing: AircraftPricing | null; error?: string }
      if (!res.ok) { setError(json.error ?? `HTTP ${res.status}`); return }
      if (json.pricing) {
        setForm({
          contract_rates: json.pricing.contract_rates ?? [],
          default_discount_pct: json.pricing.default_discount_pct ?? 0,
          tax_override: json.pricing.tax_override ?? null,
          billing_profile: json.pricing.billing_profile ?? null,
          split_billing: json.pricing.split_billing ?? null,
        })
      }
    } finally {
      setLoading(false)
    }
  }, [aircraftId])

  useEffect(() => { void load() }, [load])

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/aircraft/${aircraftId}/pricing`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`)
      toast.success(`Saved pricing for ${tailNumber}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Save failed'
      setError(msg)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-white p-8 text-center text-[12px] text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" /> Loading pricing…
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-[12px] text-rose-800 flex gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" /> <div>{error}</div>
        </div>
      )}

      {/* Contract rates */}
      <Section title="Contract labor rates" subtitle="Per-department override. Empty list = use org default rates.">
        <div className="space-y-2">
          {form.contract_rates.map((row, i) => (
            <div key={i} className="flex items-center gap-2">
              <select
                value={row.department}
                disabled={!canWrite}
                onChange={(e) => updateRate(i, { ...row, department: e.target.value as LaborDepartment })}
                className="border border-border rounded-md px-2 py-1.5 text-[12.5px] bg-white"
              >
                {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
              <div className="flex-1 inline-flex items-center gap-1">
                <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={row.labor_rate}
                  disabled={!canWrite}
                  onChange={(e) => updateRate(i, { ...row, labor_rate: parseFloat(e.target.value) || 0 })}
                  className="flex-1 border border-border rounded-md px-2 py-1.5 text-[12.5px] tabular-nums"
                />
                <span className="text-[11px] text-muted-foreground">/hr</span>
              </div>
              {canWrite && (
                <button onClick={() => removeRate(i)} className="text-rose-600 hover:bg-rose-50 p-1 rounded">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
          {canWrite && (
            <Button variant="outline" size="sm" onClick={addRate}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add rate
            </Button>
          )}
        </div>
      </Section>

      {/* Default discount */}
      <Section title="Default discount" subtitle="Applied to all parts + labor before tax.">
        <div className="inline-flex items-center gap-2">
          <input
            type="number"
            step="0.5"
            min="0"
            max="100"
            value={form.default_discount_pct}
            disabled={!canWrite}
            onChange={(e) => setForm((f) => ({ ...f, default_discount_pct: parseFloat(e.target.value) || 0 }))}
            className="w-24 border border-border rounded-md px-2 py-1.5 text-[12.5px] tabular-nums"
          />
          <span className="text-[12px] text-muted-foreground">%</span>
        </div>
      </Section>

      {/* Tax override */}
      <Section title="Tax override" subtitle="Use a different tax profile than the org default.">
        <label className="inline-flex items-center gap-2 text-[12px] text-foreground mb-2 cursor-pointer">
          <input
            type="checkbox"
            checked={!!form.tax_override}
            disabled={!canWrite}
            onChange={(e) => setForm((f) => ({
              ...f,
              tax_override: e.target.checked
                ? (f.tax_override ?? { rate: 0, jurisdiction: '', exempt: false })
                : null,
            }))}
          />
          Override tax for this aircraft
        </label>
        {form.tax_override && (
          <div className="grid grid-cols-2 gap-2">
            <Field label="Rate %">
              <input
                type="number" step="0.01" min="0" max="100"
                value={form.tax_override.rate}
                disabled={!canWrite}
                onChange={(e) => setForm((f) => ({
                  ...f,
                  tax_override: f.tax_override
                    ? { ...f.tax_override, rate: parseFloat(e.target.value) || 0 }
                    : null,
                }))}
                className="w-full border border-border rounded-md px-2 py-1.5 text-[12.5px] tabular-nums"
              />
            </Field>
            <Field label="Jurisdiction">
              <input
                type="text"
                value={form.tax_override.jurisdiction}
                disabled={!canWrite}
                onChange={(e) => setForm((f) => ({
                  ...f,
                  tax_override: f.tax_override
                    ? { ...f.tax_override, jurisdiction: e.target.value }
                    : null,
                }))}
                className="w-full border border-border rounded-md px-2 py-1.5 text-[12.5px]"
                placeholder="e.g. CA, KAPA, FL Sales Tax Code 7"
              />
            </Field>
            <label className="col-span-2 inline-flex items-center gap-2 text-[12px] cursor-pointer">
              <input
                type="checkbox"
                checked={form.tax_override.exempt}
                disabled={!canWrite}
                onChange={(e) => setForm((f) => ({
                  ...f,
                  tax_override: f.tax_override
                    ? { ...f.tax_override, exempt: e.target.checked }
                    : null,
                }))}
              />
              Tax-exempt (commercial / interstate)
            </label>
            {form.tax_override.exempt && (
              <Field label="Exemption ID" className="col-span-2">
                <input
                  type="text"
                  value={form.tax_override.exemption_id ?? ''}
                  disabled={!canWrite}
                  onChange={(e) => setForm((f) => ({
                    ...f,
                    tax_override: f.tax_override
                      ? { ...f.tax_override, exemption_id: e.target.value }
                      : null,
                  }))}
                  className="w-full border border-border rounded-md px-2 py-1.5 text-[12.5px] font-mono"
                />
              </Field>
            )}
          </div>
        )}
      </Section>

      {/* Billing profile */}
      <Section title="Billing profile" subtitle="Term days, PO requirement, and invoice cc list.">
        <label className="inline-flex items-center gap-2 text-[12px] text-foreground mb-2 cursor-pointer">
          <input
            type="checkbox"
            checked={!!form.billing_profile}
            disabled={!canWrite}
            onChange={(e) => setForm((f) => ({
              ...f,
              billing_profile: e.target.checked
                ? (f.billing_profile ?? { term_days: 30, po_required: false, email_invoice_to: [] })
                : null,
            }))}
          />
          Configure billing for this aircraft
        </label>
        {form.billing_profile && (
          <div className="grid grid-cols-2 gap-2">
            <Field label="Term (days)">
              <input
                type="number" min="0" max="180"
                value={form.billing_profile.term_days}
                disabled={!canWrite}
                onChange={(e) => setForm((f) => ({
                  ...f,
                  billing_profile: f.billing_profile
                    ? { ...f.billing_profile, term_days: parseInt(e.target.value, 10) || 0 }
                    : null,
                }))}
                className="w-full border border-border rounded-md px-2 py-1.5 text-[12.5px] tabular-nums"
              />
            </Field>
            <label className="inline-flex items-center gap-2 text-[12px] cursor-pointer">
              <input
                type="checkbox"
                checked={form.billing_profile.po_required}
                disabled={!canWrite}
                onChange={(e) => setForm((f) => ({
                  ...f,
                  billing_profile: f.billing_profile
                    ? { ...f.billing_profile, po_required: e.target.checked }
                    : null,
                }))}
              />
              PO required
            </label>
            <Field label="Invoice cc emails (comma-separated)" className="col-span-2">
              <input
                type="text"
                value={(form.billing_profile.email_invoice_to ?? []).join(', ')}
                disabled={!canWrite}
                onChange={(e) => setForm((f) => ({
                  ...f,
                  billing_profile: f.billing_profile
                    ? {
                        ...f.billing_profile,
                        email_invoice_to: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                      }
                    : null,
                }))}
                className="w-full border border-border rounded-md px-2 py-1.5 text-[12.5px]"
                placeholder="ar@customer.com, billing@operator.com"
              />
            </Field>
          </div>
        )}
      </Section>

      {canWrite && (
        <div className="flex justify-end">
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
            Save pricing
          </Button>
        </div>
      )}
    </div>
  )

  function addRate() {
    setForm((f) => ({
      ...f,
      contract_rates: [
        ...f.contract_rates,
        { department: nextAvailableDept(f.contract_rates), labor_rate: 0 },
      ],
    }))
  }
  function updateRate(i: number, next: ContractRate) {
    setForm((f) => ({
      ...f,
      contract_rates: f.contract_rates.map((r, idx) => (idx === i ? next : r)),
    }))
  }
  function removeRate(i: number) {
    setForm((f) => ({
      ...f,
      contract_rates: f.contract_rates.filter((_, idx) => idx !== i),
    }))
  }
}

function nextAvailableDept(existing: ContractRate[]): LaborDepartment {
  const used = new Set(existing.map((r) => r.department))
  return DEPARTMENTS.find((d) => !used.has(d)) ?? 'shop'
}

function Section({
  title, subtitle, children,
}: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-white p-5">
      <h3 className="text-[14px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>{title}</h3>
      {subtitle && <p className="text-[11.5px] text-muted-foreground mt-0.5 mb-3">{subtitle}</p>}
      {children}
    </div>
  )
}

function Field({
  label, children, className,
}: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn('block', className)}>
      <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>
        {label}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  )
}
