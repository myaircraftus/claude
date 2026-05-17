/**
 * POST /api/aviation/suggest-ata-jasc
 *
 * Lightweight AI auto-suggest for ATA/JASC classification. Given a free-text
 * maintenance description, picks the single best-matching FAA JASC code from
 * the seeded `jasc_codes` taxonomy and returns it with its ATA chapter.
 *
 * Request:  { description: string, context?: string }
 * Response: { ata_code, ata_description, jasc_code, jasc_description,
 *             confidence: 'high'|'medium'|'low', rationale? }
 *
 * The model is constrained to the seeded code list and the returned code is
 * re-validated against the DB — a hallucinated code is rejected. AI suggest
 * is an enhancement only: callers treat any non-200 as "no suggestion".
 */
import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const description = typeof body?.description === 'string' ? body.description.trim() : ''
  const context = typeof body?.context === 'string' ? body.context.trim() : ''
  if (!description) {
    return NextResponse.json({ error: 'description is required' }, { status: 400 })
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'AI suggest is not configured' }, { status: 503 })
  }

  const supabase = createServerSupabase()
  const [{ data: jascRows }, { data: ataRows }] = await Promise.all([
    supabase.from('jasc_codes').select('jasc_code, ata_code, title').eq('status', 'active').order('jasc_code'),
    supabase.from('ata_chapters').select('ata_code, title'),
  ])

  if (!jascRows || jascRows.length === 0) {
    return NextResponse.json({ error: 'Taxonomy not loaded' }, { status: 503 })
  }

  const ataByCode = new Map<string, string>((ataRows ?? []).map((a: any) => [a.ata_code, a.title]))
  const candidateList = (jascRows as any[])
    .map((j) => `${j.jasc_code}\t${j.title}\t(ATA ${j.ata_code} ${ataByCode.get(j.ata_code) ?? ''})`)
    .join('\n')

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 12000, maxRetries: 1 })

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You are an aircraft maintenance classifier. Given a maintenance discrepancy or task ' +
            'description, pick the single best-matching FAA JASC code from the provided list. ' +
            'Respond ONLY with JSON: {"jasc_code":"NNNN","confidence":"high"|"medium"|"low","rationale":"one short sentence"}. ' +
            'The jasc_code MUST be exactly one of the four-digit codes in the list. If nothing fits ' +
            'well, choose the closest and use "low" confidence.',
        },
        {
          role: 'user',
          content:
            `Maintenance description: ${description}\n` +
            (context ? `Additional context: ${context}\n` : '') +
            `\nValid JASC codes (code<TAB>title<TAB>ATA chapter):\n${candidateList}`,
        },
      ],
    })

    const raw = completion.choices[0]?.message?.content ?? '{}'
    let parsed: any = {}
    try {
      parsed = JSON.parse(raw)
    } catch {
      return NextResponse.json({ error: 'AI response was not valid JSON' }, { status: 502 })
    }

    const jascCode = String(parsed.jasc_code ?? '').trim()
    const match = (jascRows as any[]).find((j) => j.jasc_code === jascCode)
    if (!match) {
      // Model returned a code outside the taxonomy — treat as no suggestion.
      return NextResponse.json({ error: 'No confident match', confidence: 'low' }, { status: 200 })
    }

    const confidence =
      parsed.confidence === 'high' || parsed.confidence === 'low' ? parsed.confidence : 'medium'

    return NextResponse.json({
      ata_code: match.ata_code,
      ata_description: ataByCode.get(match.ata_code) ?? null,
      jasc_code: match.jasc_code,
      jasc_description: match.title,
      confidence,
      rationale:
        typeof parsed.rationale === 'string' ? parsed.rationale.slice(0, 280) : undefined,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'AI suggest failed' },
      { status: 502 },
    )
  }
}
