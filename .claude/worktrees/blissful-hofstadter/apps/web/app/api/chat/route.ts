import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

// ─── Intent detection system prompt ───────────────────────────────────────────
const INTENT_SYSTEM_PROMPT = `You are an aviation maintenance AI assistant for myaircraft.us. Analyze the user's message and determine intent + generate a response.

You must return VALID JSON with this exact structure:
{
  "intent": "logbook_entry" | "work_order" | "invoice" | "parts_lookup" | "customer" | "question" | "general",
  "artifact_type": "logbook_entry" | "work_order" | "invoice" | "parts_search" | "customer_card" | null,
  "response": "Your conversational reply to the user",
  "artifact_data": { ... } | null,
  "missing_fields": ["field1", "field2"] | [],
  "follow_up_questions": ["question1"] | [],
  "compliance_notes": ["note1"] | []
}

INTENT MAPPING:
- logbook_entry: "prepare a logbook entry", "make an entry", "create return to service", "generate annual", "log this work", "write an entry"
- work_order: "generate a work order", "start a work order", "open a job", "create work sheet", "new work card"
- invoice: "generate invoice", "bill customer", "create invoice", "prepare invoice", "summarize charges"
- parts_lookup: "find part", "look up part number", "search IPC", "find alternator", "find oil filter"
- customer: "show customer", "create customer", "customer history", "find customer"
- question: asking a question about the aircraft, records, maintenance
- general: everything else

ARTIFACT DATA STRUCTURES:

For logbook_entry:
{
  "entry_type": "annual" | "100hr" | "oil_change" | "maintenance" | "inspection" | "ad_compliance" | "return_to_service" | "custom",
  "logbook_type": "airframe" | "engine" | "prop",
  "entry_date": "YYYY-MM-DD or null",
  "entry_text": "The draft maintenance entry wording",
  "hobbs_time": number | null,
  "tach_time": number | null,
  "total_time_after": number | null,
  "parts_used": [],
  "mechanic_name": "from profile or null",
  "mechanic_certificate": "A&P" | "IA" | null,
  "mechanic_cert_number": "from profile or null",
  "return_to_service": true | false,
  "missing_fields": ["hobbs_time", "tach_time", etc]
}

For work_order:
{
  "work_order_number": "WO-XXXXX",
  "status": "draft",
  "customer_complaint": "string or null",
  "discrepancy": "string or null",
  "labor_lines": [],
  "parts_lines": [],
  "corrective_action": "string or null"
}

For invoice:
{
  "invoice_number": "INV-XXXXX",
  "status": "draft",
  "line_items": [],
  "subtotal": 0,
  "tax_rate": 0.08,
  "total": 0,
  "due_date": null,
  "notes": null
}

For parts_search:
{
  "query": "the search query",
  "results": [
    {
      "part_number": "string",
      "description": "string",
      "manufacturer": "string",
      "fit_confidence": "confirmed" | "likely" | "possible" | "unknown",
      "condition": "new" | "overhauled" | "serviceable",
      "price_estimate": null,
      "notes": "string"
    }
  ]
}

CRITICAL RULES:
1. NEVER invent part numbers, serial numbers, certificate numbers, or times
2. Use [MISSING] for required fields you don't have
3. Draft entries should use professional aviation maintenance language
4. For logbook entries, use regulatory wording (FAR Part 43 style)
5. Always flag if FAA Form 337 may be required
6. Never claim airworthiness determinations
7. If aircraft context is provided, use it to pre-fill known values`

export async function POST(req: NextRequest) {
  try {
    const supabase = createServerSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: membership } = await supabase
      .from('organization_memberships')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .not('accepted_at', 'is', null)
      .single()

    if (!membership) return NextResponse.json({ error: 'No organization' }, { status: 403 })

    const body = await req.json()
    const { message, threadId, aircraftId, messageHistory = [] } = body

    // Load aircraft context if provided
    let aircraftContext = ''
    if (aircraftId) {
      const { data: aircraft } = await supabase
        .from('aircraft')
        .select('tail_number, make, model, year, engine_make, engine_model, serial_number, total_time_hours, engine_serial, prop_make, prop_model')
        .eq('id', aircraftId)
        .eq('organization_id', membership.organization_id)
        .single()

      if (aircraft) {
        aircraftContext = `
CURRENT AIRCRAFT CONTEXT:
- Tail Number: ${aircraft.tail_number}
- Aircraft: ${aircraft.year ?? ''} ${aircraft.make} ${aircraft.model}
- Serial: ${aircraft.serial_number ?? '[not set]'}
- Total Time: ${aircraft.total_time_hours ? aircraft.total_time_hours + ' hrs' : '[not set]'}
- Engine: ${aircraft.engine_make ?? ''} ${aircraft.engine_model ?? ''}
- Engine Serial: ${aircraft.engine_serial ?? '[not set]'}
- Prop: ${aircraft.prop_make ?? ''} ${aircraft.prop_model ?? ''}
`
      }
    }

    // Load user profile for mechanic info
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('full_name, job_title')
      .eq('id', user.id)
      .single()

    const mechContext = profile?.full_name
      ? `\nMECHANIC ON FILE: ${profile.full_name} (${profile.job_title ?? 'Mechanic'})`
      : ''

    // Build messages for OpenAI
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: INTENT_SYSTEM_PROMPT + (aircraftContext ? '\n\n' + aircraftContext : '') + mechContext
      },
      ...messageHistory.slice(-10).map((m: { role: string; content: string }) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content
      })),
      { role: 'user', content: message }
    ]

    // Stream the response using ReadableStream
    const encoder = new TextEncoder()

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Call OpenAI with json_object mode for structured response
          const completion = await openai.chat.completions.create({
            model: process.env.OPENAI_CHAT_MODEL ?? 'gpt-4o',
            messages,
            response_format: { type: 'json_object' },
            temperature: 0.2,
            max_tokens: 2000,
          })

          const raw = completion.choices[0]?.message?.content ?? '{}'
          let parsed: any = {}

          try {
            parsed = JSON.parse(raw)
          } catch {
            parsed = {
              intent: 'general',
              artifact_type: null,
              response: "I couldn't process that. Please try again.",
              artifact_data: null,
              missing_fields: [],
              follow_up_questions: [],
              compliance_notes: []
            }
          }

          // Send intent chunk first (fast signal to client)
          const intentChunk = JSON.stringify({
            type: 'intent',
            intent: parsed.intent ?? 'general',
            artifact_type: parsed.artifact_type ?? null,
          }) + '\n'
          controller.enqueue(encoder.encode(intentChunk))

          // Simulate streaming the response text word by word
          const words = (parsed.response ?? '').split(' ')
          for (let i = 0; i < words.length; i++) {
            const delta = (i === 0 ? '' : ' ') + words[i]
            const chunk = JSON.stringify({ type: 'delta', content: delta }) + '\n'
            controller.enqueue(encoder.encode(chunk))
          }

          // Send artifact if present
          if (parsed.artifact_data) {
            const artifactChunk = JSON.stringify({
              type: 'artifact',
              artifact_type: parsed.artifact_type,
              data: parsed.artifact_data,
              missing_fields: parsed.missing_fields ?? [],
              compliance_notes: parsed.compliance_notes ?? [],
              follow_up_questions: parsed.follow_up_questions ?? [],
            }) + '\n'
            controller.enqueue(encoder.encode(artifactChunk))
          }

          // Save messages to DB if thread exists
          if (threadId) {
            const orgId = membership.organization_id

            // Save user message
            await supabase.from('thread_messages').insert({
              thread_id: threadId,
              organization_id: orgId,
              role: 'user',
              content: message,
            })

            // Save assistant message
            await supabase.from('thread_messages').insert({
              thread_id: threadId,
              organization_id: orgId,
              role: 'assistant',
              content: parsed.response ?? '',
              intent_type: parsed.intent,
              artifact_type: parsed.artifact_type,
              artifact_data: parsed.artifact_data,
            })

            // Update thread last_message_at and increment count
            await supabase
              .from('conversation_threads')
              .update({
                last_message_at: new Date().toISOString(),
                message_count: supabase.rpc('increment', { row_id: threadId }) as any,
                updated_at: new Date().toISOString(),
              })
              .eq('id', threadId)
              .eq('organization_id', orgId)
          }

          // Send done
          controller.enqueue(encoder.encode(JSON.stringify({ type: 'done' }) + '\n'))
          controller.close()
        } catch (err) {
          const errChunk = JSON.stringify({
            type: 'error',
            error: err instanceof Error ? err.message : 'Unknown error'
          }) + '\n'
          controller.enqueue(encoder.encode(errChunk))
          controller.close()
        }
      }
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      }
    })
  } catch (err) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
