/**
 * GET /api/admin/sop/[slug] — full markdown body + parsed frontmatter
 * for a single SOP. Admin only.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { readSop } from '@/lib/sop/parser'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RouteContext {
  params: { slug: string }
}

export async function GET(_req: NextRequest, { params }: RouteContext) {
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

  const sop = await readSop(params.slug)
  if (!sop) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({
    slug: sop.slug,
    frontmatter: sop.frontmatter,
    body: sop.body,
    excerpt: sop.excerpt,
  })
}
