/**
 * /admin/ops-assistant — Phase 16 Sprint 16.8 chat surface.
 *
 * Server-renders the empty-state with example prompts. The actual chat
 * UI is the OpsChat client component.
 */
import { redirect } from 'next/navigation'
import { Topbar } from '@/components/shared/topbar'
import { Card, CardContent } from '@/components/ui/card'
import { createServerSupabase } from '@/lib/supabase/server'
import type { UserProfile } from '@/types'
import { OpsChat } from './ops-chat'

export const metadata = { title: 'AI Ops Assistant' }
export const dynamic = 'force-dynamic'

const EXAMPLES = [
  "Show me orgs that haven't logged in this week",
  "What's broken on /aircraft pages today?",
  "Which customers are at churn risk?",
  "Why is the queue backed up?",
  "How much did we spend on Modal yesterday?",
  "Are there any P0 tickets right now?",
]

export default async function OpsAssistantPage() {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profileRow } = await supabase.from('user_profiles').select('*').eq('id', user.id).single()
  if (!profileRow) redirect('/login')
  const profile = profileRow as UserProfile
  if (!profile.is_platform_admin) redirect('/dashboard')

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar profile={profile} breadcrumbs={[
        { label: 'Admin', href: '/admin' },
        { label: 'AI Ops Assistant' },
      ]} />
      <main className="flex-1 overflow-hidden flex flex-col">
        <div className="border-b border-border bg-white px-6 py-4">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-2xl tracking-tight" style={{ fontWeight: 700 }}>AI Ops Assistant</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Ask anything about platform state. The assistant uses read-only tools — it can&rsquo;t mutate data, send emails, or execute side effects.
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto p-6">
            <OpsChat examples={EXAMPLES} />
          </div>
        </div>
      </main>
    </div>
  )
}
