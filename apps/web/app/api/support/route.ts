import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'

export async function GET(req: NextRequest) {
  const context = await resolveRequestOrgContext(req)
  if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('support_tickets')
    .select('id, type, severity, status, subject, description, created_at, updated_at')
    .eq('organization_id', context.organizationId)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tickets: data ?? [] })
}

export async function POST(req: NextRequest) {
  const context = await resolveRequestOrgContext(req)
  if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body?.subject || !body?.description) {
    return NextResponse.json({ error: 'subject and description are required' }, { status: 400 })
  }

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('support_tickets')
    .insert({
      organization_id: context.organizationId,
      user_id: context.user.id,
      type: body.type ?? 'general',
      severity: body.severity ?? 'medium',
      status: 'open',
      subject: body.subject,
      description: body.description,
      notes: body.notes ?? null,
    })
    .select('id, type, severity, status, subject, description, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
