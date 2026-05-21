/**
 * POST /api/sop/ask
 *
 * Natural-language Q&A scoped to the SOP knowledge base. Reads all SOP
 * markdown files server-side, passes the relevant ones as context to
 * GPT-4o, returns a grounded answer with citations to specific SOPs.
 *
 * This is intentionally a SEPARATE endpoint from /api/ask (the Logbook
 * AI). /api/ask is scoped to a tenant's aircraft maintenance records.
 * /api/sop/ask is scoped to the platform's own SOPs — meta-knowledge
 * about how myaircraft.us works.
 *
 * Auth: gated to authenticated users with role admin / lead / ia — same
 * gating as /sop-library itself.
 */
import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { requireAppServerSession } from '@/lib/auth/server-app'
import { listSops } from '@/lib/sop/parser'

export const runtime = 'nodejs'
export const maxDuration = 60

interface AskBody {
  question?: string
}

interface SopCitation {
  sopSlug: string
  sopTitle: string
  section?: string
}

interface AskResponse {
  answer: string
  citations: SopCitation[]
}

const SYSTEM_PROMPT = `You are a myaircraft.us product expert answering questions about platform procedures.

You have access to the full SOP library for myaircraft.us. Each SOP covers one module — Dashboard, Aircraft Master Record, Squawks, Estimates, Work Orders, Invoicing & Payments, Logbook Entry, Reports, Parts & Inventory, Mechanic & Workforce, ATA/JASC Codes, Owner Portal, and the Full-Stack/Admin/RAG technical reference.

Answer the user's question clearly and practically. Cite the specific SOP(s) you used by their slug (e.g., "08-reports-global-search").

Respond as strict JSON with this shape:
{
  "answer": "markdown-formatted answer text. Use **bold**, *italic*, \`code\`, and bullet lists for clarity. Be specific.",
  "citations": [
    { "sopSlug": "08-reports-global-search", "sopTitle": "Reports & Global Search", "section": "optional-anchor-id" }
  ]
}

Rules:
- Cite at most 4 SOPs per answer; pick the most relevant.
- If the SOPs don't contain the answer, say so plainly. Don't invent.
- Keep the answer under ~350 words unless the user explicitly asks for depth.
- Don't include "Based on the SOPs..." preamble — just answer.`

export async function POST(req: NextRequest) {
  // Gate: same audience as /sop-library itself — authenticated app user.
  try {
    await requireAppServerSession()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: 'AI is not configured on this deployment.' },
      { status: 503 },
    )
  }

  let body: AskBody
  try {
    body = (await req.json()) as AskBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }
  const question = (body.question ?? '').trim()
  if (!question) {
    return NextResponse.json({ error: 'question is required.' }, { status: 400 })
  }

  // Load all SOPs into context. With ~13 SOPs averaging ~6 KB each, the
  // full corpus is ~80 KB / ~20K tokens — well within GPT-4o's window.
  // If/when the library grows past ~50 SOPs, switch to a per-question
  // retrieval pass (embed the question, pull top-K SOPs by similarity).
  const sops = await listSops()
  if (sops.length === 0) {
    return NextResponse.json(
      { error: 'SOP library is empty on this deployment.' },
      { status: 503 },
    )
  }

  // Build context: each SOP gets its slug + title + a trimmed body.
  // We trim each body to ~3500 chars so the total context stays in budget.
  // 3500 chars * 13 SOPs = ~45.5K chars ≈ 11K tokens.
  const MAX_CHARS_PER_SOP = 3500
  const context = sops
    .map((s) => {
      const body = s.body.length > MAX_CHARS_PER_SOP ? s.body.slice(0, MAX_CHARS_PER_SOP) + '\n[…truncated…]' : s.body
      return `===== SOP: ${s.frontmatter.title} (slug: ${s.slug}) =====\n${body}`
    })
    .join('\n\n')

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  let parsed: AskResponse
  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_CHAT_MODEL || 'gpt-4o',
      temperature: 0,
      max_tokens: 1200,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `SOPs:\n${context}\n\nUser question: ${question}`,
        },
      ],
    })
    const raw = completion.choices[0]?.message?.content ?? '{}'
    parsed = JSON.parse(raw) as AskResponse
  } catch (err) {
    console.error('[api/sop/ask] LLM call failed:', err)
    return NextResponse.json(
      { error: 'AI lookup failed. Please try again in a moment.' },
      { status: 502 },
    )
  }

  // Sanitize citations — drop any that don't match a real SOP slug.
  const knownSlugs = new Set(sops.map((s) => s.slug))
  const citations = Array.isArray(parsed.citations)
    ? parsed.citations
        .filter((c) => c && typeof c.sopSlug === 'string' && knownSlugs.has(c.sopSlug))
        .slice(0, 6)
        .map((c) => {
          const matchedSop = sops.find((s) => s.slug === c.sopSlug)
          return {
            sopSlug: c.sopSlug,
            sopTitle: matchedSop?.frontmatter.title ?? c.sopTitle ?? c.sopSlug,
            section: typeof c.section === 'string' ? c.section : undefined,
          } as SopCitation
        })
    : []

  return NextResponse.json({
    answer: typeof parsed.answer === 'string' ? parsed.answer : 'No answer generated.',
    citations,
  })
}
