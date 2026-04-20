import { redirect } from 'next/navigation'
import Link from '@/components/shared/tenant-link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Topbar } from '@/components/shared/topbar'
import { GdrivePickerClient } from '@/components/documents/gdrive-picker-client'
import { createServerSupabase } from '@/lib/supabase/server'
import { tenantAppHref } from '@/lib/auth/server-tenant'
import type { DocType, UserProfile } from '@/types'
import {
  inferLegacyClassification,
  isDocumentDetailId,
  isDocumentGroupId,
} from '@/lib/documents/taxonomy'

export const metadata = { title: 'Google Drive Import' }

const VALID_DOC_TYPES: DocType[] = [
  'logbook',
  'poh',
  'afm',
  'afm_supplement',
  'maintenance_manual',
  'service_manual',
  'parts_catalog',
  'service_bulletin',
  'airworthiness_directive',
  'work_order',
  'inspection_report',
  'form_337',
  'form_8130',
  'lease_ownership',
  'insurance',
  'compliance',
  'miscellaneous',
]

export default async function GdrivePickerPage({
  searchParams,
}: {
  searchParams?: {
    aircraft?: string
    doc_type?: string
    document_group?: string
    document_detail?: string
    document_subtype?: string
  }
}) {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [profileRes, membershipRes] = await Promise.all([
    supabase.from('user_profiles').select('*').eq('id', user.id).single(),
    supabase
      .from('organization_memberships')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .not('accepted_at', 'is', null)
      .single(),
  ])

  const profile = profileRes.data as UserProfile
  if (!profile) redirect('/login')

  const membership = membershipRes.data
  if (!membership) redirect('/onboarding')

  const orgId = membership.organization_id

  const [{ data: aircraftRows }, { data: gdriveRow }] = await Promise.all([
    supabase
      .from('aircraft')
      .select('id, tail_number, make, model')
      .eq('organization_id', orgId)
      .eq('is_archived', false)
      .order('tail_number'),
    supabase
      .from('gdrive_connections')
      .select('id, google_email, is_active')
      .eq('organization_id', orgId)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle(),
  ])

  if (!gdriveRow) {
    redirect(tenantAppHref('/documents/upload'))
  }

  const aircraftOptions = (
    aircraftRows ?? []
  ) as { id: string; tail_number: string; make: string; model: string }[]

  const defaultAircraftId = aircraftOptions.some((aircraft) => aircraft.id === searchParams?.aircraft)
    ? searchParams?.aircraft
    : undefined

  const defaultDocType = VALID_DOC_TYPES.includes(searchParams?.doc_type as DocType)
    ? (searchParams?.doc_type as DocType)
    : 'miscellaneous'

  const legacyClassification = inferLegacyClassification(defaultDocType)
  const defaultDocumentGroupId = isDocumentGroupId(searchParams?.document_group)
    ? searchParams?.document_group
    : legacyClassification.groupId
  const defaultDocumentDetailId = isDocumentDetailId(searchParams?.document_detail)
    ? searchParams?.document_detail
    : legacyClassification.detailId
  const defaultDocumentSubtype = searchParams?.document_subtype?.trim() || undefined

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={profile}
        breadcrumbs={[
          { label: 'Documents', href: '/documents' },
          { label: 'Upload', href: '/documents/upload' },
          { label: 'Google Drive' },
        ]}
        actions={
          <Button variant="ghost" size="sm" asChild>
            <Link href="/documents/upload">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Back
            </Link>
          </Button>
        }
      />

      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Google Drive Import</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Browse connected Drive PDFs, then file them into the correct aircraft record category before import.
            </p>
          </div>

          <GdrivePickerClient
            aircraftOptions={aircraftOptions}
            defaultAircraftId={defaultAircraftId}
            defaultDocType={defaultDocType}
            defaultDocumentGroupId={defaultDocumentGroupId}
            defaultDocumentDetailId={defaultDocumentDetailId}
            defaultDocumentSubtype={defaultDocumentSubtype}
            googleEmail={gdriveRow.google_email ?? null}
          />
        </div>
      </main>
    </div>
  )
}
