import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import { fetchAtaChapters } from '@/lib/taxonomy/queries'

export async function GET(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const supabase = createServerSupabase()
    const chapters = await fetchAtaChapters(supabase)
    return NextResponse.json({ ata_chapters: chapters })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load ATA chapters' },
      { status: 500 },
    )
  }
}
