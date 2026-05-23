/**
 * GET /api/investor/model.csv
 *
 * Returns the bottoms-up financial model as a CSV download. Admin-gated
 * — only platform admins (the founder + invited investors with admin
 * role) can read this. Investors hitting the download from inside the
 * Investor Room will be authenticated; outside parties get 403.
 */
import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { modelToCsv } from '@/lib/investor/financial-model'

export const runtime = 'nodejs'

export async function GET() {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('is_platform_admin')
    .eq('id', user.id)
    .single()
  if (!profile?.is_platform_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const csv = modelToCsv()
  const filename = `myaircraft-financial-model-${new Date().toISOString().slice(0, 10)}.csv`
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
