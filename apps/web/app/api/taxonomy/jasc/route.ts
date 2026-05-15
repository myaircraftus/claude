import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'
import { fetchAtaChapters, fetchJascCodes, decorateJascCode } from '@/lib/taxonomy/queries'
import { normalizeAtaCode } from '@/lib/taxonomy/format'

export async function GET(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  let ataCode: string | null = null

  try {
    ataCode = normalizeAtaCode(searchParams.get('ata'))
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Invalid ATA code' },
      { status: 400 },
    )
  }

  try {
    const supabase = createServerSupabase()
    const [chapters, jascRows] = await Promise.all([
      fetchAtaChapters(supabase),
      fetchJascCodes(supabase, { ataCode, limit: 1000 }),
    ])
    const ataByCode = new Map(chapters.map((chapter) => [chapter.ata_code, chapter]))

    return NextResponse.json({
      jasc_codes: jascRows.map((row) => decorateJascCode(row, ataByCode.get(row.ata_code))),
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load JASC codes' },
      { status: 500 },
    )
  }
}
