// Generates a shareable link for a completed report (for prebuy/lender/insurer packets)
import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createServerSupabase } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { job_id, expires_days = 30 } = await req.json()

  const { data: job } = await supabase
    .from('report_jobs')
    .select('id, status, aircraft_id')
    .eq('id', job_id)
    .single()

  if (!job || job.status !== 'completed') {
    return NextResponse.json({ error: 'Report not ready' }, { status: 400 })
  }

  const shareToken = randomUUID()
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + expires_days)

  await (supabase as any).from('report_jobs').update({
    share_token: shareToken,
    share_token_expires_at: expiresAt.toISOString(),
  }).eq('id', job_id)

  const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL}/reports/${job_id}?share_token=${shareToken}`

  return NextResponse.json({ share_url: shareUrl, expires_at: expiresAt.toISOString() })
}
