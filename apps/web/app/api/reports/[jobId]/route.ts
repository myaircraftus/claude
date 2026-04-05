import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

export async function GET(
  req: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const supabase = createServerSupabase()

  // Allow public access via share token
  const { searchParams } = new URL(req.url)
  const shareToken = searchParams.get('share_token')

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
      // Increment access counter
      await supabase
        .from('report_jobs')
        .update({ share_accessed_count: job.share_accessed_count + 1 })
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

  // Refresh signed URL if it's expiring soon (< 1 day)
  if (job.status === 'completed' && job.storage_path) {
    const expiresAt = new Date(job.signed_url_expires)
    if (expiresAt.getTime() - Date.now() < 86400000) {
      const supabaseAdmin = createServerSupabase() // use service role for storage
      const { data: { signedUrl } } = await supabaseAdmin.storage
        .from('aircraft-reports')
        .createSignedUrl(job.storage_path, 60 * 60 * 24 * 7)
      await supabaseAdmin.from('report_jobs').update({
        signed_url: signedUrl,
        signed_url_expires: new Date(Date.now() + 60 * 60 * 24 * 7 * 1000).toISOString(),
      }).eq('id', params.jobId)
      job.signed_url = signedUrl
    }
  }

  return NextResponse.json({ job })
}
