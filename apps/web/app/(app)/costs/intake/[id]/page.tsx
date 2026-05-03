import { notFound } from 'next/navigation'
import { requireAppServerSession } from '@/lib/auth/server-app'
import { Topbar } from '@/components/shared/topbar'
import { createServiceSupabase } from '@/lib/supabase/server'
import { IntakeDetailView } from './intake-detail-view'
import type { CostEntry, ExtractionResult, IntakeDocument } from '@/types'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Intake Document' }

/**
 * /(app)/costs/intake/[id] (Spec 7.3)
 *
 * Operator review surface — original document on the left, AI-extracted
 * fields on the right, approve/reject in the footer. The page does the
 * server-side org guard then hands a hydrated bundle to the client view
 * (no client-side fetch waterfall on first paint).
 */
export default async function IntakeDetailPage({ params }: { params: { id: string } }) {
  const { profile, membership } = await requireAppServerSession()
  const service = createServiceSupabase()

  // Org-scoped read of the intake row.
  const { data: intakeRow } = await service
    .from('intake_documents')
    .select('*')
    .eq('id', params.id)
    .eq('organization_id', membership.organization_id)
    .maybeSingle()
  if (!intakeRow) notFound()
  const intake = intakeRow as IntakeDocument

  const [{ data: extractionRow }, { data: costRows }] = await Promise.all([
    service
      .from('extraction_results')
      .select('*')
      .eq('intake_document_id', intake.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    service
      .from('cost_entries')
      .select('*')
      .eq('intake_document_id', intake.id)
      .eq('organization_id', membership.organization_id)
      .order('cost_date', { ascending: false }),
  ])

  // 10-min signed URL so the inline preview works against the private
  // cost-receipts bucket without minting a public URL.
  let previewUrl: string | null = null
  if (intake.storage_path) {
    const { data: signed } = await service.storage
      .from('cost-receipts')
      .createSignedUrl(intake.storage_path, 600)
    previewUrl = signed?.signedUrl ?? null
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={profile}
        breadcrumbs={[
          { label: 'Costs', href: '/costs' },
          { label: 'Intake', href: '/costs/intake' },
          { label: intake.email_subject ?? intake.filename ?? 'Document' },
        ]}
      />
      <main className="flex-1 overflow-hidden">
        <IntakeDetailView
          intake={intake}
          extraction={(extractionRow as ExtractionResult | null) ?? null}
          costEntries={(costRows as CostEntry[] | null) ?? []}
          previewUrl={previewUrl}
          canWrite={['owner', 'admin', 'mechanic'].includes(membership.role)}
        />
      </main>
    </div>
  )
}
