import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { MECHANIC_AND_ABOVE } from '@/lib/roles'
import { rateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'
import OpenAI from 'openai'

async function getOrgMembership(supabase: any, userId: string) {
  const { data } = await supabase
    .from('organization_memberships')
    .select('organization_id, role')
    .eq('user_id', userId)
    .not('accepted_at', 'is', null)
    .single()
  return data ?? null
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: 'AI summary service is not configured (missing OPENAI_API_KEY).' },
      { status: 503 }
    )
  }

  // Rate limit: 5 per minute per IP
  const ip = getClientIp(req.headers)
  const rl = rateLimit(`estimate-summary:${ip}`, { limit: 5, windowSeconds: 60 })
  if (!rl.success) return rateLimitResponse(rl)

  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const membership = await getOrgMembership(supabase, user.id)
  if (!membership) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  if (!MECHANIC_AND_ABOVE.includes(membership.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const orgId = membership.organization_id

  // Fetch estimate + line items + aircraft + customer
  const { data: estimate, error: estError } = await supabase
    .from('estimates')
    .select(`
      *,
      aircraft:aircraft_id (id, tail_number, make, model, year),
      customer:customer_id (id, name, email, company),
      line_items:estimate_line_items (*)
    `)
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .single()

  if (estError || !estimate) {
    return NextResponse.json({ error: 'Estimate not found' }, { status: 404 })
  }

  const aircraft = estimate.aircraft as any
  const lineItems = ((estimate.line_items ?? []) as any[]).sort(
    (a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
  )

  // Fetch linked squawks
  const squawkIds: string[] = Array.isArray(estimate.linked_squawk_ids)
    ? estimate.linked_squawk_ids
    : []
  let squawks: any[] = []
  if (squawkIds.length > 0) {
    const { data } = await supabase
      .from('squawks')
      .select('id, title, description, severity')
      .in('id', squawkIds)
    squawks = data ?? []
  }

  // Build prompt context
  const aircraftLabel = aircraft
    ? `${aircraft.tail_number ?? ''} ${aircraft.make ?? ''} ${aircraft.model ?? ''}`.trim()
    : 'Unknown aircraft'

  const squawksText = squawks.length > 0
    ? squawks.map((s: any) => `- [${s.severity?.toUpperCase() ?? 'NORMAL'}] ${s.title}${s.description ? ': ' + s.description : ''}`).join('\n')
    : estimate.customer_notes
      ? `(No linked squawks — customer scope: ${estimate.customer_notes})`
      : '(No squawks recorded)'

  const lineItemsText = lineItems.length > 0
    ? lineItems.map((li: any) => {
        const type = li.item_type ?? 'service'
        const qty = li.hours ?? li.quantity ?? 1
        const unit = li.item_type === 'labor' ? 'hrs' : 'x'
        const amount = formatCurrency(Number(li.line_total ?? (Number(li.quantity ?? 1) * Number(li.unit_price ?? 0))))
        return `- [${type}] ${li.description} (${qty} ${unit} @ ${formatCurrency(Number(li.unit_price ?? 0))}) = ${amount}`
      }).join('\n')
    : '(No line items yet)'

  const totalLabel = formatCurrency(Number(estimate.total ?? 0))
  const serviceType = estimate.service_type ? ` — ${estimate.service_type}` : ''

  const systemPrompt = `You are drafting a customer-facing summary for an aircraft maintenance estimate.
Tone: professional, clear, concise. No jargon without context. Write for an aircraft owner who may not be a mechanic.`

  const userPrompt = `Aircraft: ${aircraftLabel}${serviceType}
Estimate: ${estimate.estimate_number}, Total: ${totalLabel}

Reported squawks (what the customer described):
${squawksText}

Line items on estimate (proposed work):
${lineItemsText}

${estimate.assumptions ? `Assumptions: ${estimate.assumptions}\n` : ''}
Write 2-3 short paragraphs that:
1. Summarize what was reported (squawks / customer-described issues)
2. Explain what work is proposed (line items grouped logically, e.g. labor + inspection first, then parts/outside services)
3. State the total with a brief justification and close with next steps: customer approval leads to scheduling`

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.4,
      max_tokens: 600,
    })

    const summary = completion.choices[0].message.content?.trim() ?? ''

    // Persist to estimate
    await supabase
      .from('estimates')
      .update({
        ai_summary: summary,
        ai_summary_generated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.id)
      .eq('organization_id', orgId)

    return NextResponse.json({ summary })
  } catch (err: any) {
    console.error('[estimate/generate-summary] Error:', err)
    return NextResponse.json({ error: err.message ?? 'Failed to generate summary' }, { status: 500 })
  }
}
