import { NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { MARKETING_DEFAULTS } from '@/lib/marketing/defaults'

async function requirePlatformAdmin() {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('is_platform_admin')
    .eq('id', user.id)
    .single()
  if (!profile?.is_platform_admin) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { user }
}

/**
 * POST /api/admin/marketing-content/seed
 * Seeds all default content for every marketing page.
 * Uses INSERT ... ON CONFLICT DO NOTHING so existing values are preserved.
 */
export async function POST() {
  const guard = await requirePlatformAdmin()
  if (guard.error) return guard.error

  const service = createServiceSupabase()
  const rows: Array<{
    page: string
    slot: string
    content_type: string
    value: string
    metadata: any
    updated_by: string
  }> = []

  for (const [page, slots] of Object.entries(MARKETING_DEFAULTS)) {
    for (const [slot, def] of Object.entries(slots)) {
      rows.push({
        page,
        slot,
        content_type: def.content_type,
        value: def.value,
        metadata: {
          ...(def.metadata ?? {}),
          label: def.label ?? slot,
          description: def.description ?? null,
        },
        updated_by: guard.user!.id,
      })
    }
  }

  // Check which rows are already present so we don't overwrite user edits.
  const { data: existing } = await service
    .from('marketing_content')
    .select('page, slot')

  const existingSet = new Set(
    ((existing ?? []) as any[]).map((r) => `${r.page}::${r.slot}`)
  )
  const toInsert = rows.filter((r) => !existingSet.has(`${r.page}::${r.slot}`))

  if (toInsert.length === 0) {
    return NextResponse.json({ inserted: 0, skipped: rows.length, message: 'All slots already seeded' })
  }

  const { error } = await service.from('marketing_content').insert(toInsert)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    inserted: toInsert.length,
    skipped: rows.length - toInsert.length,
  })
}
