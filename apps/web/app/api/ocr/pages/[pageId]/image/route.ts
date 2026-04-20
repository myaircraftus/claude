import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'

export async function GET(
  req: NextRequest,
  { params }: { params: { pageId: string } }
) {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()

  if (!membership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: page } = await supabase
    .from('ocr_page_jobs')
    .select('id, organization_id, page_image_path, processed_image_path')
    .eq('id', params.pageId)
    .maybeSingle()

  if (!page) {
    return NextResponse.json({ error: 'Page not found' }, { status: 404 })
  }

  if (page.organization_id !== membership.organization_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const variantParam = new URL(req.url).searchParams.get('variant')
  const preferred = variantParam === 'original' ? 'original' : 'processed'
  let storagePath =
    preferred === 'processed' ? page.processed_image_path : page.page_image_path
  let resolvedVariant = preferred

  if (!storagePath && preferred === 'processed' && page.page_image_path) {
    storagePath = page.page_image_path
    resolvedVariant = 'original'
  }

  if (!storagePath) {
    return NextResponse.json({
      url: null,
      variant: resolvedVariant,
      message: 'No page image available',
    })
  }

  const cleanedPath = storagePath.replace(/^scanner-captures\//, '')
  const service = createServiceSupabase()
  const { data, error } = await service.storage
    .from('scanner-captures')
    .createSignedUrl(cleanedPath, 60 * 60)

  if (error || !data?.signedUrl) {
    return NextResponse.json(
      { error: error?.message ?? 'Failed to sign image URL' },
      { status: 500 }
    )
  }

  return NextResponse.json({
    url: data.signedUrl,
    variant: resolvedVariant,
  })
}
