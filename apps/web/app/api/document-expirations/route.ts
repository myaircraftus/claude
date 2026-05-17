/**
 * GET  /api/document-expirations — list document expiration records.
 *      ?scope=aircraft|shop|owner   filter by scope
 * POST /api/document-expirations — create a record. scope='owner' rows are
 *      bound to the authenticated user (personal lockbox).
 *
 * Backs /expirations/documents and /expirations/owner-documents.
 */
import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const SCOPES = ['aircraft', 'shop', 'owner']

export async function GET(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const { searchParams } = new URL(req.url)

  let query = supabase
    .from('document_expirations')
    .select('*')
    .eq('organization_id', ctx.organizationId)
    .order('expiration_date', { ascending: true, nullsFirst: false })
    .limit(500)

  const scope = searchParams.get('scope')
  if (scope && SCOPES.includes(scope)) query = query.eq('scope', scope)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ documents: data ?? [] })
}

export async function POST(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const documentName = typeof body.document_name === 'string' ? body.document_name.trim() : ''
  if (!documentName) {
    return NextResponse.json({ error: 'document_name required' }, { status: 400 })
  }
  const scope = SCOPES.includes(body.scope) ? body.scope : 'aircraft'
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('document_expirations')
    .insert({
      organization_id: ctx.organizationId,
      scope,
      aircraft_id: typeof body.aircraft_id === 'string' && body.aircraft_id ? body.aircraft_id : null,
      // owner-lockbox rows are always bound to the authenticated user.
      owner_user_id: scope === 'owner' ? ctx.user.id : null,
      document_name: documentName,
      document_type: str(body.document_type),
      document_number: str(body.document_number),
      issuing_authority: str(body.issuing_authority),
      issue_date: str(body.issue_date),
      expiration_date: str(body.expiration_date),
      file_url: str(body.file_url),
      notes: str(body.notes),
      created_by: ctx.user.id,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ document: data }, { status: 201 })
}
