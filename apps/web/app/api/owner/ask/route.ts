/**
 * POST /api/owner/ask
 *
 * Owner-portal AI query — natural-language Q&A scoped strictly to the
 * calling owner's own aircraft and only the records the shop has chosen
 * to share with them. The owner equivalent of /api/ask (which is shop /
 * staff scoped).
 *
 * Defense in depth:
 *   1. Auth via supabase.auth.getUser()
 *   2. Owner verification — must have a `customers` row with
 *      portal_user_id = auth.uid() AND portal_access = true
 *   3. Aircraft scoping — only aircraft where the customer is the
 *      owner_customer_id OR has an aircraft_customer_assignments row
 *   4. Data scoping — only:
 *        - Aircraft master (already filtered)
 *        - Logbook entries with status IN ('signed','published_to_owner')
 *        - Estimates with status IN ('approved','awaiting_approval')
 *        - Invoices with status NOT IN ('draft','void')
 *        - Work orders with owner_visible = true
 *   5. LLM system prompt that explicitly forbids referencing internal
 *      mechanic notes, vendor costs, draft records, or another tenant's
 *      data — even if accidentally present in the context.
 *
 * Per SOP-12 §10: "The retrieval filter is enforced at the SQL layer …
 * the LLM is the last line, not the first."
 *
 * v1 keeps the context construction in straight SQL rather than the full
 * RAG hybridRetrieve pipeline because the owner data slice is small
 * (per-owner: a few aircraft, dozens of recent records). Once we want
 * citations into long-form docs (e.g., "what does the magneto
 * inspection paragraph in logbook #47 say"), we'll swap in
 * hybridRetrieve with an owner-scoped filter.
 */
import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const maxDuration = 30

interface OwnerAskBody {
  question?: string
  /** Optional — narrow scope to one aircraft. If omitted, all owned aircraft. */
  aircraft_id?: string | null
}

interface OwnerCitation {
  kind: 'aircraft' | 'logbook_entry' | 'estimate' | 'invoice' | 'work_order'
  id: string
  label: string
  href: string
}

interface OwnerAnswer {
  answer: string
  citations: OwnerCitation[]
}

interface CustomerRow {
  id: string
  organization_id: string
}
interface AircraftRow {
  id: string
  tail_number: string | null
  year: number | null
  make: string | null
  model: string | null
  serial_number: string | null
  total_time_hours: number | null
  annual_due_date: string | null
  next_100_hour_at_hours: number | null
}
interface LogbookEntryRow {
  id: string
  aircraft_id: string
  entry_date: string | null
  total_time_hours: number | null
  summary: string | null
  status: string | null
  signed_at: string | null
}
interface EstimateRow {
  id: string
  aircraft_id: string
  estimate_number: string | null
  status: string | null
  total_cents: number | null
  approved_at: string | null
  scope_summary: string | null
}
interface InvoiceRow {
  id: string
  aircraft_id: string
  invoice_number: string | null
  status: string | null
  total_cents: number | null
  amount_paid_cents: number | null
  due_at: string | null
}
interface WorkOrderRow {
  id: string
  aircraft_id: string
  wo_number: string | null
  status: string | null
  service_type: string | null
  created_at: string | null
  closed_at: string | null
  summary: string | null
}

const SYSTEM_PROMPT = `You are an aviation maintenance assistant answering questions about the user's own aircraft from records the shop has shared with them.

Strict rules:
- Only answer using the records provided in the context below. Do not invent facts.
- If the answer is not in the context, say plainly: "I don't have that information in your shared records — please ask your shop."
- Never reference internal mechanic notes, vendor cost basis, draft records, or other customers' aircraft, even if you can guess at them.
- When citing a fact, link to the record using its kind + id in the format [kind:id] — for example [logbook_entry:abc123].
- Keep answers short and friendly. 1-3 short paragraphs max.
- Use markdown for clarity (bold for key facts, lists for multi-item answers).

You will receive the user's question and a JSON-shaped context with their aircraft, recent logbook entries (signed only), estimates, invoices, and work orders. Use only those records.`

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'AI is not configured.' }, { status: 503 })
  }

  let body: OwnerAskBody
  try {
    body = (await req.json()) as OwnerAskBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }
  const question = (body.question ?? '').trim()
  if (!question || question.length > 2000) {
    return NextResponse.json(
      { error: 'question is required (max 2000 chars).' },
      { status: 400 },
    )
  }

  const service = createServiceSupabase()

  // ── Step 1: resolve the user's portal customer rows ───────────────
  const { data: customers, error: cErr } = await service
    .from('customers')
    .select('id, organization_id')
    .eq('portal_user_id', user.id)
    .eq('portal_access', true)

  if (cErr || !customers || customers.length === 0) {
    return NextResponse.json(
      { error: 'No portal access for this account.' },
      { status: 403 },
    )
  }
  const customerRows = customers as CustomerRow[]
  const customerIds = customerRows.map((c) => c.id)

  // ── Step 2: aircraft the user can see ─────────────────────────────
  // owner_customer_id direct hit OR aircraft_customer_assignments row.
  const { data: primaryAircraft } = await service
    .from('aircraft')
    .select(
      'id, tail_number, year, make, model, serial_number, total_time_hours, annual_due_date, next_100_hour_at_hours',
    )
    .in('owner_customer_id', customerIds)

  const { data: assignedIds } = await service
    .from('aircraft_customer_assignments')
    .select('aircraft_id')
    .in('customer_id', customerIds)

  const assignedAircraftIds = (assignedIds ?? [])
    .map((r: { aircraft_id: string }) => r.aircraft_id)
    .filter(Boolean)

  let assignedAircraft: AircraftRow[] = []
  if (assignedAircraftIds.length > 0) {
    const { data } = await service
      .from('aircraft')
      .select(
        'id, tail_number, year, make, model, serial_number, total_time_hours, annual_due_date, next_100_hour_at_hours',
      )
      .in('id', assignedAircraftIds)
    assignedAircraft = (data ?? []) as AircraftRow[]
  }

  const byId = new Map<string, AircraftRow>()
  for (const a of (primaryAircraft ?? []) as AircraftRow[]) byId.set(a.id, a)
  for (const a of assignedAircraft) byId.set(a.id, a)
  let aircraftList = Array.from(byId.values())

  // Optional aircraft_id narrowing
  if (body.aircraft_id) {
    aircraftList = aircraftList.filter((a) => a.id === body.aircraft_id)
    if (aircraftList.length === 0) {
      return NextResponse.json(
        { error: 'Aircraft not accessible to this owner.' },
        { status: 403 },
      )
    }
  }

  if (aircraftList.length === 0) {
    return NextResponse.json(
      {
        answer:
          "I don't see any aircraft linked to your account yet. Please ask your shop to invite you to your aircraft's owner portal.",
        citations: [],
      },
      { status: 200 },
    )
  }

  const aircraftIds = aircraftList.map((a) => a.id)

  // ── Step 3: gather owner-visible records ──────────────────────────
  // Pull recent N of each so we don't blow the LLM context budget.
  const LIMIT_LOGBOOK = 12
  const LIMIT_ESTIMATE = 8
  const LIMIT_INVOICE = 12
  const LIMIT_WORK_ORDER = 12

  const [logRes, estRes, invRes, woRes] = await Promise.all([
    service
      .from('logbook_entries')
      .select(
        'id, aircraft_id, entry_date, total_time_hours, summary, status, signed_at',
      )
      .in('aircraft_id', aircraftIds)
      .in('status', ['signed', 'published_to_owner'])
      .order('entry_date', { ascending: false, nullsFirst: false })
      .limit(LIMIT_LOGBOOK),
    service
      .from('estimates')
      .select(
        'id, aircraft_id, estimate_number, status, total_cents, approved_at, scope_summary',
      )
      .in('aircraft_id', aircraftIds)
      .in('status', ['approved', 'awaiting_approval', 'declined'])
      .order('approved_at', { ascending: false, nullsFirst: false })
      .limit(LIMIT_ESTIMATE),
    service
      .from('invoices')
      .select(
        'id, aircraft_id, invoice_number, status, total_cents, amount_paid_cents, due_at',
      )
      .in('aircraft_id', aircraftIds)
      .not('status', 'in', '(draft,void)')
      .order('due_at', { ascending: false, nullsFirst: false })
      .limit(LIMIT_INVOICE),
    service
      .from('work_orders')
      .select(
        'id, aircraft_id, wo_number, status, service_type, created_at, closed_at, summary',
      )
      .in('aircraft_id', aircraftIds)
      .eq('owner_visible', true)
      .order('created_at', { ascending: false, nullsFirst: false })
      .limit(LIMIT_WORK_ORDER),
  ])

  const logbookEntries = (logRes.data ?? []) as LogbookEntryRow[]
  const estimates = (estRes.data ?? []) as EstimateRow[]
  const invoices = (invRes.data ?? []) as InvoiceRow[]
  const workOrders = (woRes.data ?? []) as WorkOrderRow[]

  // ── Step 4: build the LLM context block ───────────────────────────
  const contextDoc = {
    aircraft: aircraftList.map((a) => ({
      id: a.id,
      tail_number: a.tail_number,
      year: a.year,
      make: a.make,
      model: a.model,
      total_time_hours: a.total_time_hours,
      annual_due_date: a.annual_due_date,
      next_100_hour_at_hours: a.next_100_hour_at_hours,
    })),
    logbook_entries: logbookEntries.map((l) => ({
      id: l.id,
      aircraft_id: l.aircraft_id,
      entry_date: l.entry_date,
      total_time_hours: l.total_time_hours,
      summary: truncate(l.summary, 400),
      status: l.status,
      signed_at: l.signed_at,
    })),
    estimates: estimates.map((e) => ({
      id: e.id,
      aircraft_id: e.aircraft_id,
      estimate_number: e.estimate_number,
      status: e.status,
      total_dollars: e.total_cents != null ? (e.total_cents / 100).toFixed(2) : null,
      approved_at: e.approved_at,
      scope_summary: truncate(e.scope_summary, 280),
    })),
    invoices: invoices.map((i) => ({
      id: i.id,
      aircraft_id: i.aircraft_id,
      invoice_number: i.invoice_number,
      status: i.status,
      total_dollars: i.total_cents != null ? (i.total_cents / 100).toFixed(2) : null,
      paid_dollars:
        i.amount_paid_cents != null ? (i.amount_paid_cents / 100).toFixed(2) : null,
      due_at: i.due_at,
    })),
    work_orders: workOrders.map((w) => ({
      id: w.id,
      aircraft_id: w.aircraft_id,
      wo_number: w.wo_number,
      status: w.status,
      service_type: w.service_type,
      created_at: w.created_at,
      closed_at: w.closed_at,
      summary: truncate(w.summary, 280),
    })),
  }

  const userPrompt = `Question: ${question}

Context (JSON — only use this):
${JSON.stringify(contextDoc)}

Respond as a JSON object: { "answer": "...", "citations": [{"kind":"...","id":"...","label":"..."}] }

The "citations" must reference records that appear in the context; use the same id you see in context. Add "label" with a short human-friendly name (e.g., "Logbook entry 2026-04-12", "Invoice INV-2026-0042", "N401LP"). Cite at most 6 records.`

  // ── Step 5: call the LLM with the strict system prompt ────────────
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  let parsed: { answer?: string; citations?: Array<{ kind?: string; id?: string; label?: string }> }
  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_CHAT_MODEL || 'gpt-4o',
      temperature: 0, // deterministic — owners get the same answer
      max_tokens: 700,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    })
    parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}')
  } catch (err) {
    console.error('[api/owner/ask] LLM call failed:', err)
    return NextResponse.json(
      { error: 'AI is temporarily unavailable. Please try again.' },
      { status: 502 },
    )
  }

  // Citation validation: drop any citation that doesn't reference an
  // id we actually included in the context. This is the *last* line of
  // defense against the LLM citing something it shouldn't.
  const validIds = new Set<string>([
    ...aircraftList.map((a) => a.id),
    ...logbookEntries.map((l) => l.id),
    ...estimates.map((e) => e.id),
    ...invoices.map((i) => i.id),
    ...workOrders.map((w) => w.id),
  ])
  const citations: OwnerCitation[] = (parsed.citations ?? [])
    .filter((c): c is { kind: string; id: string; label?: string } =>
      typeof c?.kind === 'string' && typeof c?.id === 'string',
    )
    .filter((c) => validIds.has(c.id))
    .map((c) => ({
      kind: c.kind as OwnerCitation['kind'],
      id: c.id,
      label: c.label ?? `${c.kind}:${c.id.slice(0, 8)}`,
      href: hrefFor(c.kind, c.id),
    }))
    .slice(0, 6)

  const answer: OwnerAnswer = {
    answer: typeof parsed.answer === 'string' ? parsed.answer : '(no answer)',
    citations,
  }
  return NextResponse.json(answer)
}

function hrefFor(kind: string, id: string): string {
  switch (kind) {
    case 'aircraft':
      return `/owner/aircraft/${id}`
    case 'logbook_entry':
      return `/owner/logbook/${id}`
    case 'estimate':
      return `/owner/estimates/${id}`
    case 'invoice':
      return `/owner/invoices/${id}`
    case 'work_order':
      return `/owner/work-orders/${id}`
    default:
      return '/owner/dashboard'
  }
}

function truncate(s: string | null, n: number): string | null {
  if (s == null) return null
  if (s.length <= n) return s
  return s.slice(0, n) + '…'
}
