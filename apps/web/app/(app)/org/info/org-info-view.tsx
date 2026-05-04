'use client'

import { useEffect, useState } from 'react'
import { Loader2, Save, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

interface OrgInfo {
  id: string
  name: string
  slug: string
  org_type?: string | null
  home_base?: string | null
  billing_email?: string | null
  logo_url?: string | null
}

export function OrgInfoView({ canWrite }: { canWrite: boolean }) {
  const [org, setOrg] = useState<OrgInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/org/info').then((r) => r.json()).then((j: { organization?: OrgInfo; error?: string }) => {
      if (j.error) setError(j.error)
      else setOrg(j.organization ?? null)
    }).finally(() => setLoading(false))
  }, [])

  async function save() {
    if (!org) return
    setSaving(true)
    try {
      const res = await fetch('/api/org/info', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: org.name, org_type: org.org_type, home_base: org.home_base,
          billing_email: org.billing_email, logo_url: org.logo_url,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`)
      toast.success('Organization saved')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Loader />
  if (error || !org) return <ErrorBox message={error ?? 'Org not found'} />

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[22px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>Organization info</h1>
        <p className="text-[13px] text-muted-foreground mt-1">Name, type, base, contact + billing emails. Owner/admin only.</p>
      </div>
      <div className="rounded-2xl border border-border bg-white p-5 space-y-3">
        <Field label="Name">
          <input type="text" value={org.name} disabled={!canWrite}
            onChange={(e) => setOrg((o) => o ? { ...o, name: e.target.value } : o)}
            className="w-full border border-border rounded-md px-2 py-1.5 text-[12.5px]" />
        </Field>
        <Field label="Type">
          <select value={org.org_type ?? ''} disabled={!canWrite}
            onChange={(e) => setOrg((o) => o ? { ...o, org_type: e.target.value || null } : o)}
            className="w-full border border-border rounded-md px-2 py-1.5 text-[12.5px] bg-white">
            <option value="">—</option>
            <option value="owner">Owner</option>
            <option value="shop">Shop</option>
            <option value="flight-school">Flight school</option>
            <option value="fbo">FBO</option>
            <option value="operator">Operator</option>
          </select>
        </Field>
        <Field label="Home base (ICAO/IATA)">
          <input type="text" value={org.home_base ?? ''} disabled={!canWrite}
            onChange={(e) => setOrg((o) => o ? { ...o, home_base: e.target.value || null } : o)}
            className="w-full border border-border rounded-md px-2 py-1.5 text-[12.5px] font-mono uppercase" />
        </Field>
        <Field label="Billing email">
          <input type="email" value={org.billing_email ?? ''} disabled={!canWrite}
            onChange={(e) => setOrg((o) => o ? { ...o, billing_email: e.target.value || null } : o)}
            className="w-full border border-border rounded-md px-2 py-1.5 text-[12.5px]" />
        </Field>
        <Field label="Logo URL (Supabase Storage path or public URL)">
          <input type="text" value={org.logo_url ?? ''} disabled={!canWrite}
            onChange={(e) => setOrg((o) => o ? { ...o, logo_url: e.target.value || null } : o)}
            className="w-full border border-border rounded-md px-2 py-1.5 text-[12.5px] font-mono" />
        </Field>
      </div>
      {canWrite && (
        <div className="flex justify-end">
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
            Save
          </Button>
        </div>
      )}
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

function Loader() {
  return (
    <div className="rounded-2xl border border-border bg-white p-8 text-center text-[12px] text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" /> Loading…
    </div>
  )
}
function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-[12px] text-rose-800 flex gap-2">
      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" /> {message}
    </div>
  )
}
