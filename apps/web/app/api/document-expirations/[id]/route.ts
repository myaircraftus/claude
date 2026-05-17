/**
 * PATCH  /api/document-expirations/[id] — update a record.
 * DELETE /api/document-expirations/[id] — remove a record.
 *
 * owner_user_id is intentionally NOT editable — lockbox ownership is fixed
 * at creation by the POST handler.
 */
import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const EDITABLE = [
  'scope', 'aircraft_id', 'document_name', 'document_type', 'document_number',
  'issuing_authority', 'issue_date', 'expiration_date', 'file_url', 'notes',
]

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const patch: Record<string, unknown> = {}
  for (const key of EDITABLE) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      const value = body[key]
      patch[key] = value === '' ? null : value
    }
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No updatable fields supplied' }, { status: 400 })
  }

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('document_expirations')
    .update(patch)
    .eq('organization_id', ctx.organizationId)
    .eq('id', params.id)
    .select('*')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  return NextResponse.json({ document: data })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const { error } = await supabase
    .from('document_expirations')
    .delete()
    .eq('organization_id', ctx.organizationId)
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
