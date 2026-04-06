import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'

export async function GET(
  req: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const { searchParams } = new URL(req.url)
  const shareToken = searchParams.get('share_token')

  const supabase = createServerSupabase()
  const service = createServiceSupabase()

  let job: any

  if (shareToken) {
    const { data } = await supabase
      .from('report_jobs')
      .select('*')
      .eq('id', params.jobId)
      .eq('share_token', shareToken)
      .gt('share_token_expires_at', new Date().toISOString())
      .single()
    job = data

    if (job) {
      await service
        .from('report_jobs')
        .update({ share_accessed_count: (job.share_accessed_count ?? 0) + 1 })
        .eq('id', params.jobId)
    }
  } else {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data } = await supabase
      .from('report_jobs')
      .select('*')
      .eq('id', params.jobId)
      .single()
    job = data
  }

  if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Refresh signed URL if expiring within 1 day
  if (job.status === 'completed' && job.storage_path) {
    const expiresAt = new Date(job.signed_url_expires ?? 0)
    if (expiresAt.getTime() - Date.now() < 86400000) {
      const { data: urlData } = await service.storage
        .from('aircraft-reports')
        .createSignedUrl(job.storage_path, 60 * 60 * 24 * 7)

      if (urlData?.signedUrl) {
        await service
          .from('report_jobs')
          .update({
            signed_url: urlData.signedUrl,
            signed_url_expires: new Date(Date.now() + 60 * 60 * 24 * 7 * 1000).toISOString(),
          })
          .eq('id', params.jobId)
        job.signed_url = urlData.signedUrl
      }
    }
  }

  return NextResponse.json({ job })
}
