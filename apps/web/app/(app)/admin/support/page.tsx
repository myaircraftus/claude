import { redirect } from 'next/navigation'
import Link from '@/components/shared/tenant-link'
import { ChevronRight, AlertTriangle, LifeBuoy } from 'lucide-react'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { Topbar } from '@/components/shared/topbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SupportTable } from '@/components/admin/support-table'
import type { UserProfile } from '@/types'

export const metadata = { title: 'Admin — Support' }

function ForbiddenCard() {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <Card className="max-w-md w-full">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
            <CardTitle className="text-lg">Access Denied</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            You do not have platform administrator privileges.
          </p>
          <div className="mt-4">
            <Link
              href="/dashboard"
              className="text-sm text-primary hover:underline flex items-center gap-1"
            >
              Return to dashboard
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default async function AdminSupportPage() {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profileRow } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profileRow) redirect('/login')
  const profile = profileRow as UserProfile

  if (!profile.is_platform_admin) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <Topbar profile={profile} breadcrumbs={[{ label: 'Admin', href: '/admin' }, { label: 'Support' }]} />
        <main className="flex-1 overflow-y-auto">
          <ForbiddenCard />
        </main>
      </div>
    )
  }

  // Phase 15.5 Task 1.5 — schema-collision shim. Reads from the new
  // Phase 16 ops-spine schema and aliases columns back to the shape
  // SupportTable consumes (type ← category, description ← body,
  // user_id ← submitter_user_id). Sprint 16.2 will replace this whole
  // page with the proper /admin/support/inbox.
  const service = createServiceSupabase()
  const { data: rows } = await service
    .from('support_tickets')
    .select(
      'id, category, severity, status, subject, body, created_at, organization_id, organizations(name), submitter_user_id, user_profiles!support_tickets_submitter_user_id_fkey(full_name, email)'
    )
    .order('created_at', { ascending: false })
    .limit(500)

  const data = (rows ?? []).map((row: Record<string, unknown>) => ({
    id: row.id,
    type: row.category,
    severity: row.severity,
    status: row.status,
    subject: row.subject,
    description: row.body,
    created_at: row.created_at,
    organization_id: row.organization_id,
    organizations: row.organizations,
    user_id: row.submitter_user_id,
    user_profiles: row.user_profiles,
  }))

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={profile}
        breadcrumbs={[
          { label: 'Admin', href: '/admin' },
          { label: 'Support' },
        ]}
      />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <LifeBuoy className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Support Tickets</h1>
              <p className="text-sm text-muted-foreground">Operational support and dispute tracking.</p>
            </div>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">All tickets</CardTitle>
            </CardHeader>
            <CardContent>
              <SupportTable initialTickets={(data ?? []) as any[]} />
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
