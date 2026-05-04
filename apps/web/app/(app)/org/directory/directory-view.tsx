'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, AlertCircle, UserX, UserCheck, Mail } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Member {
  id: string
  user_id: string
  organization_id: string
  role: 'owner' | 'admin' | 'mechanic' | 'pilot' | 'viewer' | 'auditor'
  persona: 'owner' | 'mechanic' | 'shop' | 'admin' | null
  accepted_at: string | null
  deactivated_at: string | null
  invited_at: string
  user_profiles: { id: string; email: string; full_name: string | null; avatar_url: string | null } | { id: string; email: string; full_name: string | null; avatar_url: string | null }[] | null
}

const ROLES = ['owner', 'admin', 'mechanic', 'pilot', 'viewer', 'auditor'] as const

function profileOf(m: Member) {
  const p = m.user_profiles
  return Array.isArray(p) ? p[0] : p
}

export function DirectoryView() {
  const [members, setMembers] = useState<Member[]>([])
  const [canManage, setCanManage] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/memberships')
      const json = (await res.json()) as { members?: Member[]; can_manage?: boolean; error?: string }
      if (!res.ok) { setError(json.error ?? `HTTP ${res.status}`); return }
      setMembers(json.members ?? [])
      setCanManage(!!json.can_manage)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function patch(id: string, body: Record<string, unknown>) {
    setBusy(id)
    try {
      const res = await fetch(`/api/memberships/${id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`)
      toast.success('Updated')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setBusy(null)
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
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[22px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>Directory</h1>
          <p className="text-[13px] text-muted-foreground mt-1">{members.length} members. Owner/admin can change role / persona / deactivation status.</p>
        </div>
        {canManage && (
          <a href="/org/invite" className="inline-flex items-center gap-1 text-[13px] text-primary hover:underline">
            <Mail className="h-3.5 w-3.5" /> Invite member
          </a>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-white overflow-hidden">
        <table className="w-full text-[12.5px]">
          <thead className="bg-muted/15 border-b border-border">
            <tr>
              {['Member', 'Role', 'Persona', 'Status', ''].map((h, i) => (
                <th key={i} className="text-left px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {members.map((m) => {
              const p = profileOf(m)
              const isInvited = !m.accepted_at && !m.deactivated_at
              const isDeactivated = !!m.deactivated_at
              const tone = isDeactivated ? 'bg-rose-50 text-rose-700 border-rose-200' :
                          isInvited ? 'bg-amber-50 text-amber-700 border-amber-200' :
                          'bg-emerald-50 text-emerald-700 border-emerald-200'
              const status = isDeactivated ? 'Deactivated' : isInvited ? 'Invited' : 'Active'

              return (
                <tr key={m.id} className="hover:bg-muted/15">
                  <td className="px-3 py-2">
                    <div className="text-foreground" style={{ fontWeight: 600 }}>{p?.full_name ?? p?.email ?? 'Unnamed'}</div>
                    {p?.email && <div className="text-[10.5px] text-muted-foreground">{p.email}</div>}
                  </td>
                  <td className="px-3 py-2">
                    {canManage ? (
                      <select value={m.role} disabled={busy === m.id}
                        onChange={(e) => void patch(m.id, { role: e.target.value })}
                        className="border border-border rounded-md px-2 py-0.5 text-[12px] bg-white">
                        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    ) : <span className="capitalize">{m.role}</span>}
                  </td>
                  <td className="px-3 py-2">
                    {canManage ? (
                      <select value={m.persona ?? ''} disabled={busy === m.id}
                        onChange={(e) => void patch(m.id, { persona: e.target.value || null })}
                        className="border border-border rounded-md px-2 py-0.5 text-[12px] bg-white">
                        <option value="">—</option>
                        <option value="owner">owner</option>
                        <option value="mechanic">mechanic</option>
                        <option value="shop">shop</option>
                      </select>
                    ) : <span className="capitalize">{m.persona ?? '—'}</span>}
                  </td>
                  <td className="px-3 py-2">
                    <span className={cn('inline-flex items-center text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border', tone)} style={{ fontWeight: 700 }}>{status}</span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {canManage && !isInvited && (
                      isDeactivated ? (
                        <Button variant="outline" size="sm" disabled={busy === m.id}
                          onClick={() => void patch(m.id, { action: 'reactivate' })}>
                          <UserCheck className="h-3 w-3 mr-1" /> Reactivate
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" disabled={busy === m.id}
                          onClick={() => void patch(m.id, { action: 'deactivate' })}
                          className="text-rose-700 hover:bg-rose-50">
                          <UserX className="h-3 w-3 mr-1" /> Deactivate
                        </Button>
                      )
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
