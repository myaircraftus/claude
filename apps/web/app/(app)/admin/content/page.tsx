import { redirect } from 'next/navigation'
import Link from '@/components/shared/tenant-link'
import { AlertTriangle, ChevronRight, FileText } from 'lucide-react'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { Topbar } from '@/components/shared/topbar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ContentEditor } from './content-editor'
import { MARKETING_PAGES } from '@/lib/marketing/content'
import { MARKETING_DEFAULTS } from '@/lib/marketing/defaults'
import type { UserProfile } from '@/types'

export const metadata = { title: 'Admin \u2014 Marketing CMS' }
export const dynamic = 'force-dynamic'

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

export default async function AdminContentPage() {
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
        <Topbar
          profile={profile}
          breadcrumbs={[{ label: 'Admin', href: '/admin' }, { label: 'Content' }]}
        />
        <main className="flex-1 overflow-y-auto">
          <ForbiddenCard />
        </main>
      </div>
    )
  }

  const service = createServiceSupabase()
  const { data: rows } = await service
    .from('marketing_content')
    .select('id, page, slot, content_type, value, metadata, updated_at, updated_by')
    .order('page', { ascending: true })
    .order('slot', { ascending: true })

  const userIds = Array.from(
    new Set(((rows ?? []) as any[]).map((r) => r.updated_by).filter(Boolean))
  ) as string[]
  let updaters: Record<string, { full_name?: string; email?: string }> = {}
  if (userIds.length > 0) {
    const { data: profiles } = await service
      .from('user_profiles')
      .select('id, full_name, email')
      .in('id', userIds)
    for (const p of (profiles ?? []) as any[]) {
      updaters[p.id] = { full_name: p.full_name, email: p.email }
    }
  }

  const initialContent = ((rows ?? []) as any[]).map((r) => ({
    ...r,
    updated_by_profile: r.updated_by ? updaters[r.updated_by] ?? null : null,
  }))

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={profile}
        breadcrumbs={[
          { label: 'Admin', href: '/admin' },
          { label: 'Marketing CMS' },
        ]}
      />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-sky-100 flex items-center justify-center">
              <FileText className="h-5 w-5 text-sky-600" />
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-foreground">Marketing CMS</h1>
              <p className="text-sm text-muted-foreground">
                Edit text, images, videos, and links across every marketing page. Changes are
                live immediately.
              </p>
            </div>
          </div>

          <ContentEditor
            pages={[...MARKETING_PAGES]}
            defaults={MARKETING_DEFAULTS}
            initialContent={initialContent}
          />
        </div>
      </main>
    </div>
  )
}
