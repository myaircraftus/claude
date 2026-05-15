/**
 * Aircraft Intelligence — AI maintenance-health report.
 *
 * Same OpenAI client pattern as lib/parts/ai-resolve.ts (bounded timeout
 * + single retry). Returns a plain-text sectioned report, or null on any
 * failure so the route can surface a clean error state.
 */

import OpenAI from 'openai'

export interface IntelLogbookEntry {
  date: string | null
  type: string | null
  description: string | null
  mechanic: string | null
}

export interface IntelSquawk {
  title: string | null
  description: string | null
  severity: string | null
  opened: string | null
}

export interface IntelWorkOrder {
  title: string | null
  status: string | null
  opened: string | null
  closed: string | null
}

export interface IntelligenceInput {
  year: number | null
  make: string | null
  model: string | null
  engine: string | null
  totalTime: number | null
  logbook: IntelLogbookEntry[]
  squawks: IntelSquawk[]
  workOrders: IntelWorkOrder[]
}

const SYSTEM_PROMPT =
  'You are an expert aviation maintenance analyst. Given an aircraft\'s ' +
  'maintenance history, open squawks, and recent work orders, provide a ' +
  'clear intelligence report for the aircraft owner. Be specific, use the ' +
  'actual data provided, and highlight any airworthiness concerns. Write ' +
  'in plain English, not technical jargon. Structure your response in sections.'

function fmtDate(d: string | null): string {
  if (!d) return 'unknown date'
  return d.slice(0, 10)
}

export function buildIntelligenceUserMessage(input: IntelligenceInput): string {
  const acLabel = [input.year, input.make, input.model].filter(Boolean).join(' ') || 'Unknown aircraft'
  const engine = input.engine?.trim() || 'unknown'
  const totalTime = input.totalTime != null ? `${input.totalTime}` : 'unknown'

  const logbookLines = input.logbook.length
    ? input.logbook
        .map(
          (e) =>
            `- ${fmtDate(e.date)} · ${e.type ?? 'entry'} · ${e.description ?? '(no description)'} · ${e.mechanic ?? 'mechanic n/a'}`,
        )
        .join('\n')
    : '(none)'

  const squawkLines = input.squawks.length
    ? input.squawks
        .map(
          (s) =>
            `- ${s.title ?? '(untitled)'} · severity ${s.severity ?? 'normal'} · opened ${fmtDate(s.opened)}${s.description ? ` · ${s.description}` : ''}`,
        )
        .join('\n')
    : '(none)'

  const woLines = input.workOrders.length
    ? input.workOrders
        .map(
          (w) =>
            `- ${w.title ?? '(work order)'} · status ${w.status ?? 'unknown'} · opened ${fmtDate(w.opened)}${w.closed ? ` · closed ${fmtDate(w.closed)}` : ''}`,
        )
        .join('\n')
    : '(none)'

  return `Aircraft: ${acLabel}, Engine: ${engine}
Total time: ${totalTime} hours

Recent logbook entries:
${logbookLines}

Open squawks (${input.squawks.length}):
${squawkLines}

Recent work orders:
${woLines}

Provide a report with these sections:
1. AIRWORTHINESS STATUS — overall assessment (Airworthy / Monitor / Attention Needed)
2. OPEN ITEMS — any squawks or incomplete work that needs attention
3. MAINTENANCE TRENDS — patterns from the logbook (what's been done recently)
4. UPCOMING — based on the history, what likely comes next
5. OWNER SUMMARY — 2-3 sentences the owner should know in plain language`
}

export async function generateAircraftIntelligence(
  input: IntelligenceInput,
): Promise<string | null> {
  if (!process.env.OPENAI_API_KEY) {
    console.warn('[intelligence-ai] OPENAI_API_KEY not set — skipping')
    return null
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const model = process.env.OPENAI_CHAT_MODEL ?? 'gpt-4o'

  try {
    const completion = await openai.chat.completions.create(
      {
        model,
        temperature: 0.3,
        max_tokens: 1400,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildIntelligenceUserMessage(input) },
        ],
      },
      { timeout: 20000, maxRetries: 1 },
    )
    const raw = completion.choices[0]?.message?.content
    return raw && raw.trim() ? raw.trim() : null
  } catch (err) {
    console.error('[intelligence-ai] error:', err instanceof Error ? err.message : err)
    return null
  }
}
