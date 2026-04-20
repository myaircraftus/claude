import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'

export async function GET(req: NextRequest) {
  const context = await resolveRequestOrgContext(req)
  if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('feedback')
    .select('id, message, page, status, created_at, user_id')
    .eq('organization_id', context.organizationId)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ feedback: data ?? [] })
}

export async function POST(req: NextRequest) {
  const context = await resolveRequestOrgContext(req)
  if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body?.message) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 })
  }

  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('feedback')
    .insert({
      organization_id: context.organizationId,
      user_id: context.user.id,
      message: body.message,
      page: body.page ?? null,
      status: 'open',
    })
    .select('id, message, page, status, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
