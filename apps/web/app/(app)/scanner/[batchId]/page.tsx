import { redirect, notFound } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { Topbar } from '@/components/shared/topbar'
import type { UserProfile } from '@/types'
import { BatchCaptureView } from './batch-capture-view'

export const metadata = { title: 'Scanner · Batch' }

export default async function ScannerBatchPage({ params }: { params: { batchId: string } }) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('user_profiles').select('*').eq('id', user.id).single()
  if (!profile) redirect('/login')

  const { data: batch } = await supabase
    .from('scan_batches')
    .select(`
      id, title, notes, batch_type, source_mode, status, page_count, batch_pdf_path,
      submitted_at, completed_at, created_at, updated_at, aircraft_id, organization_id,
      aircraft:aircraft_id (id, tail_number, make, model)
    `)
    .eq('id', params.batchId)
    .single()
  if (!batch) notFound()

  const { data: pages } = await supabase
    .from('scan_pages')
    .select('id, page_number, capture_quality_score, capture_warnings, user_marked_unreadable, upload_status, processing_status, original_image_path')
    .eq('scan_batch_id', params.batchId)
    .order('page_number', { ascending: true })

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={profile as UserProfile}
        breadcrumbs={[{ label: 'Scanner', href: '/scanner' }, { label: batch.title ?? batch.id.slice(0, 8) }]}
      />
      <main className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="max-w-4xl mx-auto">
          <BatchCaptureView batch={batch as any} initialPages={(pages ?? []) as any} />
        </div>
      </main>
    </div>
  )
}
