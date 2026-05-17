// Expirations — Owner Document Lockbox. Backed by the document_expirations
// table (scope='owner'); status derived from expiration_date. Database RLS
// restricts scope='owner' rows to the authenticated user.
import { requireAppServerSession } from '@/lib/auth/server-app'
import { Topbar } from '@/components/shared/topbar'
import { OwnerDocumentsClient } from './owner-documents-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Owner Document Lockbox' }

export default async function OwnerDocumentsPage() {
  const { supabase, profile, membership } = await requireAppServerSession()
  const orgId = membership.organization_id

  const { data: documents } = await supabase
    .from('document_expirations')
    .select('*')
    .eq('organization_id', orgId)
    .eq('scope', 'owner')
    .order('expiration_date', { ascending: true, nullsFirst: false })
    .limit(500)

  const { data: aircraft } = await supabase
    .from('aircraft')
    .select('id, tail_number, make, model')
    .eq('organization_id', orgId)
    .eq('is_archived', false)
    .order('tail_number')

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar profile={profile} breadcrumbs={[{ label: 'Expirations' }, { label: 'Owner Documents' }]} />
      <main className="flex-1 overflow-hidden">
        <OwnerDocumentsClient
          documents={(documents ?? []) as any[]}
          aircraft={(aircraft ?? []) as any[]}
        />
      </main>
    </div>
  )
}
