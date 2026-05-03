/**
 * POST /api/vision/scan-part  (Spec 5.4)
 *
 * Multipart image upload → Claude Vision → extract part number + match
 * against inventory_parts.part_number / alt_part_numbers. Returns the
 * top-3 inventory matches plus the raw model OCR for the operator to
 * verify before adding to a WO.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'
import { callAnthropic } from '@/lib/ai/anthropic'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
const MAX_BYTES = 10 * 1024 * 1024

const SYSTEM_PROMPT = `You are an aviation parts identification assistant. Extract part number(s) and metadata from a part tag photo.

Output STRICT JSON, no markdown, no commentary:
{ "part_number": "<extracted PN or null>", "alt_part_numbers": ["..."], "manufacturer": "<or null>", "description": "<or null>", "serial_number": "<or null>", "confidence": <0-1>, "raw_text": "<the text you read off the tag>" }

Rules:
- Aviation part numbers can include letters, digits, dashes, periods. Preserve case + dashes verbatim.
- If multiple PNs visible, pick the most prominent one as part_number; list others under alt_part_numbers.
- Never guess: if you can't read it confidently, return null + confidence < 0.4.
- raw_text is whatever text you read off the image, useful for the operator to verify.`

interface ScanResult {
  part_number: string | null
  alt_part_numbers: string[]
  manufacturer: string | null
  description: string | null
  serial_number: string | null
  confidence: number
  raw_text: string
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()
  if (!membership) return NextResponse.json({ error: 'No org' }, { status: 403 })

  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'multipart/form-data required' }, { status: 400 })
  const file = form.get('image')
  if (!(file instanceof File)) return NextResponse.json({ error: 'image required' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Image too large (10MB max)' }, { status: 413 })
  if (!ALLOWED_MIME.has(file.type)) return NextResponse.json({ error: `Unsupported mime: ${file.type}` }, { status: 415 })

  const base64 = Buffer.from(await file.arrayBuffer()).toString('base64')
  const service = createServiceSupabase()

  let parsed: ScanResult
  try {
    const result = await callAnthropic(service, {
      system: SYSTEM_PROMPT,
      user: 'Extract the part number from this image.',
      attachments: [{ kind: 'image', media_type: file.type, data: base64 }],
      max_tokens: 400,
      temperature: 0.0,
    }, {
      organization_id: membership.organization_id,
      user_id: user.id,
      scope: 'vision-scan-part',
      entity_kind: null,
      entity_id: null,
      context: { mime: file.type, size: file.size },
    })
    parsed = parseJson(result.text)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'vision call failed' }, { status: 500 })
  }

  // Match to inventory_parts. Try part_number first, then alt list.
  const candidates = [parsed.part_number, ...parsed.alt_part_numbers].filter((s): s is string => !!s && s.length > 0)
  let matches: Array<{ id: string; part_number: string; description: string; qty_on_hand: number }> = []
  if (candidates.length > 0) {
    const orFilter = candidates.map((c) => `part_number.ilike.%${c.replace(/[%_]/g, '')}%`).join(',')
    const { data } = await supabase
      .from('inventory_parts')
      .select('id, part_number, description, qty_on_hand, alt_part_numbers')
      .eq('organization_id', membership.organization_id)
      .or(orFilter)
      .limit(3)
    matches = ((data ?? []) as Array<{ id: string; part_number: string; description: string; qty_on_hand: number }>)
  }

  return NextResponse.json({ extracted: parsed, matches })
}

function parseJson(text: string): ScanResult {
  const fallback: ScanResult = {
    part_number: null, alt_part_numbers: [], manufacturer: null, description: null,
    serial_number: null, confidence: 0, raw_text: '',
  }
  const trimmed = text.trim()
  const candidate = trimmed.startsWith('{') ? trimmed
    : (trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1]?.trim() ?? null)
  if (!candidate) return fallback
  try {
    const obj = JSON.parse(candidate) as Partial<ScanResult>
    return {
      part_number: typeof obj.part_number === 'string' ? obj.part_number : null,
      alt_part_numbers: Array.isArray(obj.alt_part_numbers) ? obj.alt_part_numbers.filter((s): s is string => typeof s === 'string') : [],
      manufacturer: typeof obj.manufacturer === 'string' ? obj.manufacturer : null,
      description: typeof obj.description === 'string' ? obj.description : null,
      serial_number: typeof obj.serial_number === 'string' ? obj.serial_number : null,
      confidence: typeof obj.confidence === 'number' ? Math.max(0, Math.min(1, obj.confidence)) : 0,
      raw_text: typeof obj.raw_text === 'string' ? obj.raw_text.slice(0, 1000) : '',
    }
  } catch {
    return fallback
  }
}
