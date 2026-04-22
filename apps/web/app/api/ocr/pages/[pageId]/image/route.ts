import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'

export async function GET(
  req: NextRequest,
  { params }: { params: { pageId: string } }
) {
  const supabase = createServerSupabase()
  const orgContext = await resolveRequestOrgContext(req)
  if (!orgContext) {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    return NextResponse.json({ error: user ? 'Forbidden' : 'Unauthorized' }, { status: user ? 403 : 401 })
  }

  const { data: page } = await supabase
    .from('ocr_page_jobs')
    .select('id, organization_id, page_image_path, processed_image_path')
    .eq('id', params.pageId)
    .maybeSingle()

  if (!page) {
    return NextResponse.json({ error: 'Page not found' }, { status: 404 })
  }

  if (page.organization_id !== orgContext.organizationId) {
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
