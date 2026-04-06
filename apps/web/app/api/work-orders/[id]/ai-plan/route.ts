import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import OpenAI from 'openai'

async function getOrgId(supabase: any, userId: string) {
  const { data } = await supabase
    .from('organization_memberships')
    .select('organization_id')
    .eq('user_id', userId)
    .not('accepted_at', 'is', null)
    .single()
  return data?.organization_id ?? null
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getOrgId(supabase, user.id)
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'OpenAI not configured' }, { status: 503 })
  }

  // Fetch work order with aircraft
  const { data: wo } = await supabase
    .from('work_orders')
    .select(`
      id, work_order_number, customer_complaint, discrepancy, findings,
      troubleshooting_notes, corrective_action,
      aircraft:aircraft_id (id, tail_number, make, model, year, engine_make, engine_model)
    `)
    .eq('id', params.id)
    .eq('organization_id', orgId)
    .single()

  if (!wo) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Fetch linked squawks
  const { data: squawks } = await supabase
    .from('squawks')
    .select('id, title, description, severity')
    .eq('assigned_work_order_id', params.id)
    .eq('organization_id', orgId)

  // Fetch commonly used parts for context
  const { data: partsLibrary } = await supabase
    .from('parts_library')
    .select('part_number, title, unit_cost')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(50)

  const aircraft = wo.aircraft as any
  const aircraftInfo = aircraft
    ? `${aircraft.make} ${aircraft.model} (${aircraft.tail_number}${aircraft.year ? ', ' + aircraft.year : ''})${aircraft.engine_make ? ', Engine: ' + aircraft.engine_make + ' ' + (aircraft.engine_model ?? '') : ''}`
    : 'Unknown aircraft'

  const squawkList = (squawks ?? [])
    .map((s: any) => `- [${s.severity}] ${s.title}: ${s.description ?? 'No description'}`)
    .join('\n')

  const partsContext = (partsLibrary ?? [])
    .map((p: any) => `${p.part_number}: ${p.title} ($${p.unit_cost ?? 'N/A'})`)
    .join('\n')

  const prompt = `Aircraft: ${aircraftInfo}

Work Order ${wo.work_order_number}:
- Complaint: ${wo.customer_complaint ?? 'None recorded'}
- Discrepancy: ${wo.discrepancy ?? 'None recorded'}
- Findings: ${wo.findings ?? 'None recorded'}
- Troubleshooting: ${wo.troubleshooting_notes ?? 'None recorded'}

${squawkList ? `Linked Squawks:\n${squawkList}` : 'No linked squawks.'}

${partsContext ? `Available parts in inventory (reference):\n${partsContext}` : ''}`

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are an expert A&P mechanic and IA (Inspection Authorization holder). Given the aircraft details and reported squawks/discrepancies, create a detailed work plan.

Return JSON with this exact structure:
{
  "plan_summary": "Brief summary of the work plan",
  "steps": [
    {
      "description": "What to do in this step",
      "estimated_hours": 1.5,
      "category": "inspection|repair|replacement|adjustment|testing",
      "suggested_parts": [
        {
          "part_number": "P/N if known",
          "title": "Part name",
          "estimated_price": 50.00
        }
      ]
    }
  ],
  "total_estimated_hours": 5.0,
  "notes": "Any additional notes or cautions"
}

Be thorough and practical. Include inspection steps, actual repair/replacement steps, and testing/verification. Use industry standard practices and reference common maintenance procedures.`,
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.4,
      max_tokens: 3000,
    })

    const content = completion.choices[0]?.message?.content
    if (!content) {
      return NextResponse.json({ error: 'No response from AI' }, { status: 500 })
    }

    const plan = JSON.parse(content)
    return NextResponse.json(plan)
  } catch (err: any) {
    console.error('AI plan generation error:', err)
    return NextResponse.json({ error: 'Failed to generate plan' }, { status: 500 })
  }
}
