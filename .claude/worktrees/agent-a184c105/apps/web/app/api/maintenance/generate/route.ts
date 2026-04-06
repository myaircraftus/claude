import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { prompt, aircraft_id, entry_type, logbook_type } = body

  if (!prompt?.trim()) return NextResponse.json({ error: 'Prompt required' }, { status: 400 })

  // Get org membership
  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()

  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Get aircraft details if provided
  let aircraft: Record<string, unknown> | null = null
  if (aircraft_id) {
    const { data } = await supabase
      .from('aircraft')
      .select('*')
      .eq('id', aircraft_id)
      .single()
    aircraft = data
  }

  const systemPrompt = `You are a professional aviation maintenance record specialist with deep knowledge of FAA regulations, Part 43 maintenance requirements, and standard logbook entry format.

Your job is to convert plain English descriptions of aircraft maintenance into properly formatted, FAA-compliant maintenance logbook entries.

Rules:
1. Use professional, accurate aviation terminology
2. Include all required elements per Part 43 Appendix B:
   - Date of work
   - Description of work performed (detailed but concise)
   - Aircraft identification (tail number if known)
   - Part numbers and serial numbers if mentioned
   - References (AD numbers, SB numbers, FAR sections)
   - Approval for return to service (if applicable)
   - Signature block placeholder
3. Do NOT fabricate compliance information not in the original description
4. Flag if the work described requires FAA Form 337
5. Suggest which logbook(s) should receive the entry
6. Identify if this is a recurring item and note the next due interval

Aircraft context: ${
    aircraft
      ? `${aircraft.tail_number} - ${aircraft.make} ${aircraft.model} ${aircraft.year ?? ''} (Engine: ${aircraft.engine_make ?? 'N/A'} ${aircraft.engine_model ?? ''})`
      : 'Not specified'
  }
Entry type: ${entry_type ?? 'Not specified'}
Logbook type: ${logbook_type ?? 'Not specified'}
Today's date: ${new Date().toISOString().split('T')[0]}

Respond with a JSON object:
{
  "formatted_entry": "The complete formatted logbook entry text",
  "structured_fields": {
    "date": "YYYY-MM-DD or null",
    "entry_type": "100hr|annual|oil_change|repair|maintenance|overhaul|ad_compliance|other",
    "logbook_type": "airframe|engine|prop|avionics|multiple",
    "tach_reference": "extracted tach/hobbs if mentioned, or null",
    "airframe_tt": "extracted total time if mentioned, or null",
    "parts_referenced": ["list of part numbers mentioned"],
    "ad_references": ["list of AD numbers mentioned"],
    "sb_references": ["list of SB numbers mentioned"],
    "requires_337": true,
    "337_reason": "reason if requires_337 is true, or null",
    "next_due_interval": "e.g. '100 hours' or '12 calendar months' or null",
    "suggested_logbooks": ["airframe", "engine", etc.]
  },
  "warnings": ["any warnings about the entry"],
  "notes": "any additional notes for the mechanic"
}`

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    })

    const result = JSON.parse(completion.choices[0].message.content ?? '{}')

    // Save draft to database (gracefully handle if table doesn't exist)
    let draft: Record<string, unknown> | null = null
    try {
      const { data } = await supabase
        .from('maintenance_entry_drafts')
        .insert({
          organization_id: membership.organization_id,
          aircraft_id: aircraft_id ?? null,
          created_by: user.id,
          entry_type: result.structured_fields?.entry_type ?? entry_type ?? null,
          logbook_type: result.structured_fields?.logbook_type ?? logbook_type ?? null,
          ai_prompt: prompt,
          ai_generated_text: result.formatted_entry ?? null,
          structured_fields: result.structured_fields ?? null,
          status: 'draft',
        })
        .select()
        .single()
      draft = data
    } catch {
      // Table may not exist yet — non-fatal
    }

    return NextResponse.json({ ...result, draft_id: draft?.id ?? null })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[maintenance/generate] Error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
