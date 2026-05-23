/**
 * /admin/inbox-identity — Inbox identity roster.
 *
 * One-screen view of every user with their:
 *   - @myaircraft.us inbox_email
 *   - Twilio inbox_phone (if provisioned)
 *   - handle (driver of the inbox_email)
 *
 * Lets the founder provision an SMS number per user (POST
 * /api/admin/inbox/provision-phone) when a customer asks for one.
 *
 * Admin-only. Server-rendered shell; the per-row Provision button is
 * a client component.
 */
import { redirect } from 'next/navigation'
import { Topbar } from '@/components/shared/topbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import type { UserProfile } from '@/types'
import { ProvisionPhoneButton } from './provision-phone-button'

export const dynamic = 'force-dynamic'

interface IdentityRow {
  id: string
  email: string | null
  full_name: string | null
  handle: string | null
  inbox_email: string | null
  inbox_phone: string | null
  is_platform_admin: boolean | null
}

export default async function InboxIdentityPage() {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()
  const p = profile as UserProfile | null
  if (!p?.is_platform_admin) redirect('/dashboard')

  const service = createServiceSupabase()
  const { data: rows } = await service
    .from('user_profiles')
    .select('id, email, full_name, handle, inbox_email, inbox_phone, is_platform_admin')
    .order('full_name', { ascending: true, nullsFirst: false })
    .limit(500)

  const users = (rows ?? []) as IdentityRow[]
  const provisioned = users.filter((u) => u.inbox_phone).length
  const allocated = users.filter((u) => u.inbox_email).length

  return (
    <div className="flex flex-col h-full">
      <Topbar
        profile={p}
        breadcrumbs={[{ label: 'Admin', href: '/admin' }, { label: 'Inbox identity' }]}
      />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto space-y-5">
          <header>
            <h1 className="text-2xl font-semibold tracking-tight">Inbox identity roster</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {users.length} users · {allocated} have @myaircraft.us addresses ·{' '}
              {provisioned} have provisioned Twilio numbers.
            </p>
          </header>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Users</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-[11px] text-muted-foreground uppercase tracking-wider">
                    <tr className="border-b border-border">
                      <th className="py-2 pr-3">Name</th>
                      <th className="py-2 pr-3">Login email</th>
                      <th className="py-2 pr-3">Handle</th>
                      <th className="py-2 pr-3">Inbox email</th>
                      <th className="py-2 pr-3">Inbox phone</th>
                      <th className="py-2 pr-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {users.map((u) => (
                      <tr key={u.id} className="align-top">
                        <td className="py-2 pr-3 text-[13px]">
                          {u.full_name ?? <span className="text-muted-foreground italic">unknown</span>}
                          {u.is_platform_admin && (
                            <span className="ml-1.5 text-[10px] uppercase tracking-wide text-violet-700">
                              admin
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-3 font-mono text-[12px] text-muted-foreground">
                          {u.email ?? '—'}
                        </td>
                        <td className="py-2 pr-3 font-mono text-[12px]">{u.handle ?? '—'}</td>
                        <td className="py-2 pr-3 font-mono text-[12px]">
                          {u.inbox_email ?? (
                            <span className="text-amber-700">— not allocated</span>
                          )}
                        </td>
                        <td className="py-2 pr-3 font-mono text-[12px]">
                          {u.inbox_phone ?? (
                            <span className="text-muted-foreground italic">— not provisioned</span>
                          )}
                        </td>
                        <td className="py-2 pr-3">
                          {!u.inbox_phone && (
                            <ProvisionPhoneButton userId={u.id} label={u.full_name ?? u.email ?? u.id} />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
