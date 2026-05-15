/**
 * GET /api/admin/sop — list all SOPs (admin only).
 *
 * Returns a slim payload suitable for the SOP Library cards. The full
 * markdown body is NOT included; use /api/admin/sop/[slug] for that.
 *
 * Auth: requires a Supabase session AND `user_profiles.is_platform_admin = true`.
 * Anyone else gets a 403.
 */

import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { listSops } from '@/lib/sop/parser'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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

  const sops = await listSops()
  return NextResponse.json({
    sops: sops.map((s) => ({
      slug: s.slug,
      title: s.frontmatter.title,
      module: s.frontmatter.module,
      order: s.frontmatter.order,
      faa_refs: s.frontmatter.faa_refs,
      version: s.frontmatter.version,
      last_updated: s.frontmatter.last_updated,
      status: s.frontmatter.status,
      excerpt: s.excerpt,
    })),
  })
}
