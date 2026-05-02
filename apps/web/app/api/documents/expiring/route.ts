/**
 * /api/documents/expiring  (Spec 2.6.2)
 *
 *   GET  → list of expiring/expired docs for the active org, optionally
 *          filtered by ?persona=owner|mechanic|shop and ?lookAhead=<days>.
 *          Each row gets its expiration_status recomputed against today
 *          so the badge is always accurate.
 *
 *   POST → create a metadata-only expiring doc (no file upload). The full
 *          /api/upload route is the path for parsable PDFs; this one is
 *          for users who just want to track an expiration date for a
 *          paper certificate they'll re-upload later. On success we also
 *          enqueue reminder_schedules rows from reminder_offsets — the
 *          cross-wire to sprint 0d's notification fan-out.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import {
  enqueueReminderSchedules,
  getExpiringDocuments,
  recomputeExpirationStatus,
} from '@/lib/documents/expiration'
import type {
  Document,
  ExpirationPersona,
  ReminderOffsetSpec,
} from '@/types'

export const dynamic = 'force-dynamic'

const PERSONAS = new Set<ExpirationPersona>(['owner', 'mechanic', 'shop'])

function pickPersona(raw: string | null): ExpirationPersona | null {
  if (!raw) return null
  return PERSONAS.has(raw as ExpirationPersona) ? (raw as ExpirationPersona) : null
}

export async function GET(req: NextRequest) {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()
  if (!membership) {
    return NextResponse.json({ error: 'No organization membership found' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const persona = pickPersona(searchParams.get('persona'))
  const lookAheadParam = parseInt(searchParams.get('lookAhead') ?? '60', 10)
  const lookAheadDays = Number.isFinite(lookAheadParam) && lookAheadParam > 0
    ? Math.min(lookAheadParam, 365)
    : 60
  const aircraftId = searchParams.get('aircraft_id')

  const docs = await getExpiringDocuments(supabase, membership.organization_id, {
    persona,
    lookAheadDays,
    aircraftId: aircraftId ?? null,
  })

  // Recompute status against today so the badge is current even if the row's
  // stored expiration_status is stale.
  const now = new Date()
  const enriched = docs.map((d) => ({
    ...d,
    expiration_status: recomputeExpirationStatus(d, now),
  }))

  return NextResponse.json(
    { documents: enriched, total: enriched.length },
    {
      headers: {
        'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
      },
    }
  )
}

interface CreateExpiringDocPayload {
  title?: string
  target_persona?: ExpirationPersona
  expiration_category?: string
  expiration_date?: string
  effective_date?: string | null
  reminder_offsets?: ReminderOffsetSpec[]
  issued_by?: string | null
  document_number?: string | null
  aircraft_id?: string | null
  description?: string | null
}

const ALLOWED_ROLES = new Set(['owner', 'admin', 'mechanic'])

function isYmd(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function sanitizeOffsets(input: unknown): ReminderOffsetSpec[] {
  if (!Array.isArray(input)) return []
  const out: ReminderOffsetSpec[] = []
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue
    const o = raw as { offset_days?: unknown; channels?: unknown }
    if (typeof o.offset_days !== 'number' || !Number.isFinite(o.offset_days)) continue
    const channels = Array.isArray(o.channels)
      ? o.channels.filter((c): c is string => typeof c === 'string')
      : undefined
    out.push({ offset_days: Math.trunc(o.offset_days), channels })
  }
  return out
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()
  if (!membership) {
    return NextResponse.json({ error: 'No organization membership found' }, { status: 403 })
  }
  if (!ALLOWED_ROLES.has(membership.role)) {
    return NextResponse.json(
      { error: 'Insufficient permissions' },
      { status: 403 }
    )
  }

  let body: CreateExpiringDocPayload
  try {
    body = (await req.json()) as CreateExpiringDocPayload
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const title = typeof body.title === 'string' ? body.title.trim() : ''
  if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 })

  const persona = pickPersona(body.target_persona ?? null)
  if (!persona) {
    return NextResponse.json({ error: 'target_persona must be owner|mechanic|shop' }, { status: 400 })
  }

  if (!isYmd(body.expiration_date)) {
    return NextResponse.json({ error: 'expiration_date must be YYYY-MM-DD' }, { status: 400 })
  }
  if (body.effective_date != null && !isYmd(body.effective_date)) {
    return NextResponse.json({ error: 'effective_date must be YYYY-MM-DD' }, { status: 400 })
  }

  const offsets = sanitizeOffsets(body.reminder_offsets)

  const insertRow: Partial<Document> & { organization_id: string; uploaded_by: string } = {
    organization_id: membership.organization_id,
    uploaded_by: user.id,
    title,
    doc_type: 'compliance',
    description: body.description ?? undefined,
    aircraft_id: body.aircraft_id ?? undefined,
    target_persona: persona,
    expiration_category: body.expiration_category?.trim() || null,
    has_expiration: true,
    expiration_date: body.expiration_date,
    effective_date: body.effective_date ?? null,
    reminder_offsets: offsets,
    issued_by: body.issued_by ?? null,
    document_number: body.document_number ?? null,
    // Filled below with the recomputed status
    expiration_status: null,
  }

  insertRow.expiration_status =
    recomputeExpirationStatus(
      {
        has_expiration: true,
        expiration_date: insertRow.expiration_date ?? null,
        reminder_offsets: offsets,
      },
      new Date()
    ) ?? null

  const { data: created, error: insertError } = await supabase
    .from('documents')
    .insert(insertRow as never)
    .select('*')
    .single()

  if (insertError || !created) {
    console.error('[documents/expiring POST] insert error:', insertError)
    return NextResponse.json({ error: insertError?.message ?? 'Insert failed' }, { status: 500 })
  }

  const doc = created as Document

  // Cross-wire: enqueue reminder rows for sprint 0d delivery pipeline.
  let inserted = 0
  if (offsets.length > 0 && doc.expiration_date) {
    const result = await enqueueReminderSchedules(supabase, {
      organizationId: membership.organization_id,
      documentId: doc.id,
      title: doc.title ?? title,
      expirationDateIso: doc.expiration_date,
      offsets,
      link: `/documents/${doc.id}`,
    })
    inserted = result.inserted
  }

  return NextResponse.json({ document: doc, reminders_enqueued: inserted })
}
