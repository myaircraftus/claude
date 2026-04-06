import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createServerSupabase } from '@/lib/supabase/server'
import { Topbar } from '@/components/shared/topbar'
import { UploadDropzone } from '@/components/documents/upload-dropzone'
import { GdriveImportSection } from '@/components/documents/gdrive-import-section'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Upload, HardDrive } from 'lucide-react'
import type { UserProfile } from '@/types'

export const metadata = { title: 'Upload Documents' }

export default async function DocumentUploadPage() {
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

  // ── Fetch aircraft list for the dropzone ──────────────────────────────────
  const { data: aircraftRows } = await supabase
    .from('aircraft')
    .select('id, tail_number, make, model')
    .eq('organization_id', orgId)
    .eq('is_archived', false)
    .order('tail_number')

  const aircraftOptions = (
    aircraftRows ?? []
  ) as { id: string; tail_number: string; make: string; model: string }[]

  // ── Check Google Drive connection ─────────────────────────────────────────
  const { data: gdriveRow } = await supabase
    .from('gdrive_connections')
    .select('id, google_email, is_active')
    .eq('organization_id', orgId)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  const gdriveConnected = !!gdriveRow

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={profile}
        breadcrumbs={[
          { label: 'Documents', href: '/documents' },
          { label: 'Upload' },
        ]}
        actions={
          <Button variant="ghost" size="sm" asChild>
            <Link href="/documents">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Back
            </Link>
          </Button>
        }
      />

      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto space-y-8">

          {/* Header */}
          <div>
            <h1 className="text-2xl font-bold text-foreground">Upload Documents</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Add PDFs to your document library. Files are parsed and indexed automatically.
            </p>
          </div>

          {/* Section 1: Upload files */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md bg-brand-50 flex items-center justify-center">
                <Upload className="h-3.5 w-3.5 text-brand-600" />
              </div>
              <h2 className="text-base font-semibold text-foreground">Upload Files</h2>
            </div>

            <UploadDropzone
              aircraftOptions={aircraftOptions}
              onUploadComplete={() => {
                // Client-side redirect handled inside the component
              }}
            />
          </section>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">or</span>
            </div>
          </div>

          {/* Section 2: Google Drive import */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md bg-blue-50 flex items-center justify-center">
                <HardDrive className="h-3.5 w-3.5 text-blue-600" />
              </div>
              <h2 className="text-base font-semibold text-foreground">Import from Google Drive</h2>
            </div>

            <GdriveImportSection
              connected={gdriveConnected}
              googleEmail={gdriveRow?.google_email ?? null}
            />
          </section>

        </div>
      </main>
    </div>
  )
}
