import { requireAppServerSession } from '@/lib/auth/server-app'
import { Topbar } from '@/components/shared/topbar'
import { IntakeView } from './intake-view'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Cost Intake' }

/**
 * /(app)/costs/intake (Spec 7.2) — receipt + email-forward inbox.
 *
 * Drag-drop or upload PDFs/images. Forwarded emails (SendGrid Inbound
 * Parse → /api/costs/email-webhook) appear here automatically. 7.3
 * extracts; 7.1 list view shows the resulting cost_entries.
 */
export default async function CostIntakePage() {
  const { profile, membership } = await requireAppServerSession()
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={profile}
        breadcrumbs={[{ label: 'Costs', href: '/costs' }, { label: 'Intake' }]}
      />
      <main className="flex-1 overflow-hidden">
        <IntakeView orgId={membership.organization_id} />
      </main>
    </div>
  )
}
