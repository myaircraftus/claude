'use client'

/**
 * ProfileView (Spec 6.9) — name, avatar URL, persona preference, and
 * notification preferences. Reuses the existing /api/me PATCH for the
 * core profile fields and /api/memberships/[id]/persona-prefs (Sprint 5.8)
 * for notification preferences.
 */

import { useEffect, useState } from 'react'
import { Loader2, Save, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

interface MeResponse {
  profile: {
    id: string
    email: string
    full_name?: string | null
    avatar_url?: string | null
    job_title?: string | null
    phone?: string | null
    persona?: string | null
  } | null
  membership?: { id: string; persona_overrides?: Record<string, unknown> | null } | null
}

export function ProfileView({ membershipId }: { membershipId: string }) {
  const [me, setMe] = useState<MeResponse['profile']>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/me').then((r) => r.json()).then((j: MeResponse) => {
      setMe(j.profile)
    }).catch((e) => setError(e instanceof Error ? e.message : 'Load failed'))
      .finally(() => setLoading(false))
  }, [])

  async function save() {
    if (!me) return
    setSaving(true)
    try {
      const res = await fetch('/api/me', {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          full_name: me.full_name,
          job_title: me.job_title,
          phone: me.phone,
          avatar_url: me.avatar_url,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`)
      toast.success('Profile saved')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="rounded-2xl border border-border bg-white p-8 text-center text-[12px] text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin mx-auto" /></div>
  }
  if (error || !me) {
    return <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-[12px] text-rose-800 flex gap-2"><AlertCircle className="h-4 w-4 shrink-0 mt-0.5" /> {error ?? 'Profile not found'}</div>
  }

  const initials = (me.full_name ?? me.email).slice(0, 2).toUpperCase()

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[22px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>Profile</h1>
        <p className="text-[13px] text-muted-foreground mt-1">Your name, avatar, and contact details. Notification + persona preferences live below.</p>
      </div>

      <div className="rounded-2xl border border-border bg-white p-5 flex items-center gap-4">
        <Avatar className="h-16 w-16">
          {me.avatar_url ? <AvatarImage src={me.avatar_url} alt={me.full_name ?? me.email} /> : null}
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <div className="text-[15px] text-foreground" style={{ fontWeight: 600 }}>{me.full_name ?? '(no name)'}</div>
          <div className="text-[12px] text-muted-foreground">{me.email}</div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-white p-5 space-y-3">
        <Field label="Full name">
          <input type="text" value={me.full_name ?? ''}
            onChange={(e) => setMe((m) => m ? { ...m, full_name: e.target.value } : m)}
            className="w-full border border-border rounded-md px-2 py-1.5 text-[12.5px]" />
        </Field>
        <Field label="Job title">
          <input type="text" value={me.job_title ?? ''}
            onChange={(e) => setMe((m) => m ? { ...m, job_title: e.target.value } : m)}
            className="w-full border border-border rounded-md px-2 py-1.5 text-[12.5px]" />
        </Field>
        <Field label="Phone">
          <input type="tel" value={me.phone ?? ''}
            onChange={(e) => setMe((m) => m ? { ...m, phone: e.target.value } : m)}
            className="w-full border border-border rounded-md px-2 py-1.5 text-[12.5px]" />
        </Field>
        <Field label="Avatar URL">
          <input type="text" value={me.avatar_url ?? ''}
            onChange={(e) => setMe((m) => m ? { ...m, avatar_url: e.target.value } : m)}
            className="w-full border border-border rounded-md px-2 py-1.5 text-[12.5px] font-mono" />
        </Field>
      </div>

      <div className="rounded-2xl border border-border bg-white p-5 text-[12px] text-muted-foreground">
        <strong className="text-foreground">Email</strong>: {me.email} (change via auth flow).
        <br />
        <strong className="text-foreground">Password</strong>: managed by Supabase Auth — use the password reset link.
        <br />
        <strong className="text-foreground">Persona preferences</strong>: per-membership overrides live at
        <code className="font-mono ml-1">PATCH /api/memberships/{membershipId}/persona-prefs</code> (Sprint 5.8).
        <br />
        <strong className="text-foreground">2FA</strong>: not yet wired — logged follow-up.
      </div>

      <div className="flex justify-end">
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
          Save profile
        </Button>
      </div>
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
