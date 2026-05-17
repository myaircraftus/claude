/**
 * PATCH  /api/mechanic-certificates/[id] — update a certificate.
 * DELETE /api/mechanic-certificates/[id] — remove a certificate.
 */
import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const EDITABLE = [
  'user_id', 'mechanic_name', 'certificate_type', 'certificate_number',
  'issuing_authority', 'issue_date', 'expiration_date', 'renewal_reminder', 'notes',
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
    .from('mechanic_certificates')
    .update(patch)
    .eq('organization_id', ctx.organizationId)
    .eq('id', params.id)
    .select('*')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Certificate not found' }, { status: 404 })
  return NextResponse.json({ certificate: data })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const { error } = await supabase
    .from('mechanic_certificates')
    .delete()
    .eq('organization_id', ctx.organizationId)
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
