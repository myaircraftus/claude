// Expirations — Aircraft & Shop Documents. Backed by the document_expirations
// table (non-owner rows); status derived from expiration_date.
import { requireAppServerSession } from '@/lib/auth/server-app'
import { Topbar } from '@/components/shared/topbar'
import { DocumentsExpirationClient } from './documents-expiration-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Aircraft & Shop Documents' }

export default async function DocumentsExpirationPage() {
  const { supabase, profile, membership } = await requireAppServerSession()
  const orgId = membership.organization_id

  const { data: documents } = await supabase
    .from('document_expirations')
    .select('*')
    .eq('organization_id', orgId)
    .neq('scope', 'owner')
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
      <Topbar profile={profile} breadcrumbs={[{ label: 'Expirations' }, { label: 'Documents' }]} />
      <main className="flex-1 overflow-hidden">
        <DocumentsExpirationClient
          documents={(documents ?? []) as any[]}
          aircraft={(aircraft ?? []) as any[]}
        />
      </main>
    </div>
  )
}
