import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Pull last 50 maintenance events for AI analysis
  const { data: events } = await supabase
    .from('maintenance_events')
    .select('entry_date, event_type, aircraft_total_time, work_description, certifying_mechanic_cert')
    .eq('aircraft_id', params.id)
    .order('entry_date', { ascending: true })
    .limit(50)

  if (!events?.length) return NextResponse.json({ discrepancies: [] })

  const eventSummary = events.map(e =>
    `${e.entry_date} | ${e.event_type} | TTAF: ${e.aircraft_total_time ?? 'N/A'} | Cert: ${e.certifying_mechanic_cert ?? 'N/A'} | "${e.work_description?.substring(0, 100)}"`
  ).join('\n')

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{
      role: 'system',
      content: `You are an aviation records analyst with expertise in FAA regulations and aircraft logbook standards.
      Analyze the following aircraft maintenance log entries for discrepancies, inconsistencies, or red flags.
      Focus on: time anomalies, missing signatures, conflicting information, regulatory compliance gaps, and anything unusual.
      Return a JSON array of findings with fields: type, severity (critical/warning/info), title, description.
      Be specific and cite the dates/times involved.`
    }, {
      role: 'user',
      content: `Analyze these maintenance log entries for discrepancies:\n\n${eventSummary}`
    }],
    response_format: { type: 'json_object' },
    max_tokens: 1500,
  })

  const result = JSON.parse(completion.choices[0].message.content ?? '{"findings":[]}')

  return NextResponse.json({ discrepancies: result.findings ?? [] })
}
