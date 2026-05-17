/**
 * GET  /api/mechanic-certificates — list all mechanic licenses/certs for the org.
 * POST /api/mechanic-certificates — create a certificate record.
 *
 * Backs /expirations/licenses.
 */
import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('mechanic_certificates')
    .select('*')
    .eq('organization_id', ctx.organizationId)
    .order('expiration_date', { ascending: true, nullsFirst: false })
    .limit(500)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ certificates: data ?? [] })
}

export async function POST(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const certificateType = typeof body.certificate_type === 'string' ? body.certificate_type.trim() : ''
  if (!certificateType) {
    return NextResponse.json({ error: 'certificate_type required' }, { status: 400 })
  }
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('mechanic_certificates')
    .insert({
      organization_id: ctx.organizationId,
      user_id: typeof body.user_id === 'string' && body.user_id ? body.user_id : null,
      mechanic_name: str(body.mechanic_name),
      certificate_type: certificateType,
      certificate_number: str(body.certificate_number),
      issuing_authority: str(body.issuing_authority),
      issue_date: str(body.issue_date),
      expiration_date: str(body.expiration_date),
      renewal_reminder: body.renewal_reminder !== false,
      notes: str(body.notes),
      created_by: ctx.user.id,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ certificate: data }, { status: 201 })
}
