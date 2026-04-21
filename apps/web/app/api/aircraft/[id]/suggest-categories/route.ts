import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import OpenAI from 'openai'
import { rateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'

export const maxDuration = 30

const OPERATION_TYPE_LABELS: Record<string, string> = {
  part_91: 'Part 91 — Private / personal use',
  part_135: 'Part 135 — Charter / commercial operations',
  part_141: 'Part 141 — Structured flight school',
  part_61: 'Part 61 — Independent flight training',
  part_137: 'Part 137 — Agricultural operations',
  part_133: 'Part 133 — Rotorcraft external load operations',
  experimental: 'Experimental / amateur-built',
  unknown: 'General / unknown',
}

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  // Rate limit: 5 AI category suggestions per minute per IP
  const rl = rateLimit(`suggest-categories:${getClientIp(req.headers)}`, { limit: 5, windowSeconds: 60 })
  if (!rl.success) return rateLimitResponse(rl)

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

  // Verify aircraft belongs to user's org
  const { data: aircraft } = await supabase
    .from('aircraft')
    .select('id, organization_id, make, model, year, operation_type')
    .eq('id', params.id)
    .eq('organization_id', membership.organization_id)
    .single()
  if (!aircraft) return NextResponse.json({ error: 'Aircraft not found' }, { status: 404 })

  // Allow operation_type override from request body
  let body: { operation_type?: string } = {}
  try {
    body = await req.json()
  } catch {
    // body is optional
  }

  const operationType = body.operation_type ?? aircraft.operation_type ?? 'unknown'
  const operationLabel = OPERATION_TYPE_LABELS[operationType] ?? operationType

  const aircraftDesc = [aircraft.year, aircraft.make, aircraft.model].filter(Boolean).join(' ')

  const completion = await getOpenAI().chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are an aviation records expert with deep knowledge of FAA regulations and document requirements. Given an aircraft and its operation type, list the document categories the owner/operator should maintain for regulatory compliance and best practice. Return ONLY a valid JSON object with a single key "categories" containing an array of strings. Each string is a category label (e.g. "Engine Logbook", "ETOPS Records", "Part 135 Operations Manual"). Be specific to this aircraft type and operation. Include 8-15 categories.`,
      },
      {
        role: 'user',
        content: `Aircraft: ${aircraftDesc}\nOperation type: ${operationLabel}\n\nList the document categories this operator should maintain.`,
      },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 800,
  })

  let categories: string[] = []
  try {
    const parsed = JSON.parse(completion.choices[0].message.content ?? '{"categories":[]}')
    categories = Array.isArray(parsed.categories) ? parsed.categories : []
  } catch {
    console.error('[suggest-categories] parse error')
    categories = []
  }

  // Save to aircraft record if we have a valid operation_type
  const updatePayload: Record<string, unknown> = {
    suggested_document_categories: categories,
    updated_at: new Date().toISOString(),
  }
  if (operationType && operationType !== 'unknown') {
    updatePayload.operation_type = operationType
  }

  await supabase
    .from('aircraft')
    .update(updatePayload)
    .eq('id', params.id)

  return NextResponse.json({ categories })
}
