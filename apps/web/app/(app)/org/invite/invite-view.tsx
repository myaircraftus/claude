'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Send, Copy, Trash2, CheckCircle2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Invite {
  id: string
  email: string
  role: string
  persona: string | null
  expires_at: string
  accepted_at: string | null
  revoked_at: string | null
  created_at: string
}

const ROLES = ['mechanic', 'admin', 'pilot', 'viewer', 'auditor', 'owner'] as const

export function InviteView() {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('mechanic')
  const [persona, setPersona] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [invites, setInvites] = useState<Invite[]>([])

  const load = useCallback(async () => {
    const res = await fetch('/api/invites')
    const json = (await res.json()) as { invites?: Invite[] }
    setInvites(json.invites ?? [])
  }, [])

  useEffect(() => { void load() }, [load])

  async function send() {
    if (!email) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/invites', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, role, persona: persona || null }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`)
      const link = (json as { magic_link?: string }).magic_link
      if (link) {
        await navigator.clipboard.writeText(link).catch(() => {})
        toast.success('Invite sent — magic link copied to clipboard')
      } else {
        toast.success('Invite sent')
      }
      setEmail('')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Send failed')
    } finally {
      setSubmitting(false)
    }
  }

  async function revoke(id: string) {
    try {
      const res = await fetch(`/api/invites/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      toast.success('Revoked')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Revoke failed')
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[22px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>Invite member</h1>
        <p className="text-[13px] text-muted-foreground mt-1">Send a magic link. Recipient signs up; the token activates the membership on first sign-in.</p>
      </div>

      <div className="rounded-2xl border border-border bg-white p-5 grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="md:col-span-2">
          <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="user@example.com"
            className="mt-1 w-full border border-border rounded-md px-2 py-1.5 text-[12.5px]" />
        </div>
        <div>
          <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>Role</span>
          <select value={role} onChange={(e) => setRole(e.target.value)}
            className="mt-1 w-full border border-border rounded-md px-2 py-1.5 text-[12.5px] bg-white">
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <span className="text-[10.5px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>Persona (optional)</span>
          <select value={persona} onChange={(e) => setPersona(e.target.value)}
            className="mt-1 w-full border border-border rounded-md px-2 py-1.5 text-[12.5px] bg-white">
            <option value="">—</option>
            <option value="owner">owner</option>
            <option value="mechanic">mechanic</option>
            <option value="shop">shop</option>
          </select>
        </div>
        <div className="md:col-span-3 flex justify-end">
          <Button onClick={() => void send()} disabled={submitting || !email}>
            {submitting ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1" />}
            Send invite
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-white overflow-hidden">
        <div className="px-4 py-2 border-b border-border bg-muted/15">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 700 }}>
            Recent invites ({invites.length})
          </div>
        </div>
        {invites.length === 0 ? (
          <div className="text-[12px] text-muted-foreground text-center py-8">No invites yet.</div>
        ) : (
          <table className="w-full text-[12.5px]">
            <tbody className="divide-y divide-border">
              {invites.map((i) => {
                const status = i.accepted_at ? 'accepted' : i.revoked_at ? 'revoked' : Date.parse(i.expires_at) < Date.now() ? 'expired' : 'pending'
                const tone = status === 'accepted' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                             status === 'pending' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                             'bg-rose-50 text-rose-700 border-rose-200'
                return (
                  <tr key={i.id} className="hover:bg-muted/15">
                    <td className="px-3 py-2">{i.email}</td>
                    <td className="px-3 py-2 capitalize">{i.role}{i.persona ? ` · ${i.persona}` : ''}</td>
                    <td className="px-3 py-2">
                      <span className={cn('inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full border', tone)} style={{ fontWeight: 700 }}>
                        {status === 'accepted' && <CheckCircle2 className="h-2.5 w-2.5" />}
                        {(status === 'revoked' || status === 'expired') && <X className="h-2.5 w-2.5" />}
                        {status}
                      </span>
                    </td>
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">{new Date(i.created_at).toLocaleDateString()}</td>
                    <td className="px-3 py-2 text-right">
                      {status === 'pending' && (
                        <Button variant="outline" size="sm" onClick={() => void revoke(i.id)} className="text-rose-700 hover:bg-rose-50">
                          <Trash2 className="h-3 w-3 mr-1" /> Revoke
                        </Button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
