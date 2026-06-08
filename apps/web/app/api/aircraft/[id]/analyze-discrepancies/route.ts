import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createServerSupabase } from '@/lib/supabase/server'
import { generateLlmObject } from '@/lib/ai/llm'
import { rateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'

// Migrated to the unified AI SDK layer (lib/ai/llm).

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  // OpenAI cost — rate-limit per IP (security-audit §5.8).
  const rl = rateLimit(`analyze-discrepancies:${getClientIp(req.headers)}`, { limit: 10, windowSeconds: 60 })
  if (!rl.success) return rateLimitResponse(rl)

  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Pull last 50 maintenance events for AI analysis
  const { data: events } = await supabase
    .from('maintenance_events')
    .select('event_date, event_type, airframe_tt, description, mechanic_cert')
    .eq('aircraft_id', params.id)
    .order('event_date', { ascending: true })
    .limit(50)

  if (!events?.length) return NextResponse.json({ discrepancies: [] })

  const eventSummary = events.map(e =>
    `${e.event_date} | ${e.event_type} | TTAF: ${e.airframe_tt ?? 'N/A'} | Cert: ${e.mechanic_cert ?? 'N/A'} | "${e.description?.substring(0, 100)}"`
  ).join('\n')

  // Permissive schema — primitives only, every field nullish so an off-spec
  // response coerces instead of failing (mirrors the prior loose JSON.parse).
  const FindingsSchema = z.object({
    findings: z
      .array(
        z.object({
          type: z.string().nullish(),
          severity: z.string().nullish(),
          title: z.string().nullish(),
          description: z.string().nullish(),
        }),
      )
      .nullish(),
  })

  const { object: result } = await generateLlmObject({
    model: 'gpt-4o',
    schema: FindingsSchema,
    system: `You are an aviation records analyst with expertise in FAA regulations and aircraft logbook standards.
      Analyze the following aircraft maintenance log entries for discrepancies, inconsistencies, or red flags.
      Focus on: time anomalies, missing signatures, conflicting information, regulatory compliance gaps, and anything unusual.
      Return a JSON array of findings with fields: type, severity (critical/warning/info), title, description.
      Be specific and cite the dates/times involved.`,
    prompt: `Analyze these maintenance log entries for discrepancies:\n\n${eventSummary}`,
    maxOutputTokens: 1500,
  })

  return NextResponse.json({ discrepancies: result.findings ?? [] })
}
