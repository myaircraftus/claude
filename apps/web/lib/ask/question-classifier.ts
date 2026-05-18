/**
 * Question classifier for the "All Aircraft" path of /api/ask.
 *
 * When the user selects "All Aircraft", the client sends `aircraft_id: undefined`.
 * Some questions want ONE answer per aircraft ("when was the last annual for each
 * of my aircraft?") and some want ONE answer for the whole fleet ("do I have any
 * overdue ADs?"). This module decides which.
 *
 *   - 'per_aircraft' → /api/ask should fan out: run the agent once per aircraft.
 *   - 'org_wide'     → /api/ask runs a single org-wide RAG pass.
 *
 * Decision strategy (cheapest first):
 *   1. Keyword + regex matching — fast, free, deterministic. Handles the vast
 *      majority of real questions.
 *   2. Only if genuinely ambiguous (neither bucket matched), fall back to ONE
 *      gpt-4o-mini call (json_object, temp 0).
 *   3. If there is no OPENAI_API_KEY or the LLM call fails, default to
 *      'org_wide' — the safe choice (one pass, no fan-out).
 *
 * Results are memoized in a module-level Map keyed by the trimmed/lowercased
 * question so repeat questions never re-classify. This function never throws.
 */

import OpenAI from 'openai'

export type AskQuestionKind = 'per_aircraft' | 'org_wide'

/** Module-level cache: trimmed+lowercased question → classification. */
const classificationCache = new Map<string, AskQuestionKind>()

/**
 * Strong "answer separately for every aircraft" signals. If a complete answer
 * would list each aircraft on its own line, the question is per_aircraft.
 * These are matched against the lowercased question.
 */
const PER_AIRCRAFT_PATTERNS: RegExp[] = [
  // Explicit fan-out language.
  /\bfor each\b/,
  /\bfor every\b/,
  /\beach (?:of (?:my|our|the) )?(?:aircraft|airplane|plane|tail)/,
  /\b(?:all|every) (?:of (?:my|our) )?(?:my |our )?(?:aircraft|airplanes|planes|tails)\b/,
  /\b(?:per|by) aircraft\b/,
  /\baircraft[- ]by[- ]aircraft\b/,
  /\beach one\b/,
  /\bbreak ?down by aircraft\b/,
  // Per-aircraft maintenance facts — each plane has its own answer.
  /\blast annual\b/,
  /\bmost recent annual\b/,
  /\bannual inspection\b/,
  /\blast 100[- ]?hour\b/,
  /\b100[- ]?hour inspection\b/,
  /\bnext inspection\b/,
  /\binspection due\b/,
  /\bwhen (?:is|are|was|were).*(?:due|inspection|annual)\b/,
  /\btotal time\b/,
  /\bairframe time\b/,
  /\btime in service\b/,
  /\bengine time\b/,
  /\bprop(?:eller)? time\b/,
  /\btach time\b/,
  /\bhobbs\b/,
  /\bregistration (?:expir|renew|due)/,
  /\bairworthiness (?:status|certificate|expir)/,
  /\bcomponent (?:change|replacement|swap)/,
  /\bdamage history\b/,
]

/**
 * Strong "one answer for the whole fleet" signals. Superlatives and
 * fleet-overview language: one answer covers everything.
 */
const ORG_WIDE_PATTERNS: RegExp[] = [
  // Superlatives — a single aircraft (or count) is the answer.
  /\b(?:which|what) (?:aircraft|airplane|plane|one|tail)\b/,
  /\bmost hours?\b/,
  /\bleast hours?\b/,
  /\b(?:the )?(?:oldest|newest|youngest)\b/,
  /\bhighest\b/,
  /\blowest\b/,
  /\bdue soonest\b/,
  /\b(?:soonest|earliest|next) (?:due|inspection|annual)\b/,
  /\bmost (?:overdue|recent)\b/,
  // Fleet-level overview / rollup.
  /\bfleet (?:overview|summary|status|wide|health|total)\b/,
  /\b(?:overview|summary) of (?:my|our|the) (?:fleet|aircraft)\b/,
  /\bacross (?:my|our|the) (?:fleet|aircraft)\b/,
  /\bhow many (?:aircraft|airplanes|planes)\b/,
  /\btotal (?:across|fleet)\b/,
  // "Do I have any X" — a yes/no/list fleet question, not per-aircraft.
  /\bdo i have any\b/,
  /\bare there any\b/,
  /\bany (?:overdue|expired|grounded|unairworthy)\b/,
]

/**
 * Keyword-and-regex classification. Returns null when the question matches
 * neither bucket clearly (or matches both) — i.e. genuinely ambiguous, so the
 * caller should fall back to the LLM.
 */
function classifyByKeywords(lowered: string): AskQuestionKind | null {
  const orgWideMatch = ORG_WIDE_PATTERNS.some((re) => re.test(lowered))
  const perAircraftMatch = PER_AIRCRAFT_PATTERNS.some((re) => re.test(lowered))

  // Org-wide superlatives win over per-aircraft fact words: "which aircraft
  // has the most total time" is org_wide even though it mentions "total time".
  if (orgWideMatch && !perAircraftMatch) return 'org_wide'
  if (perAircraftMatch && !orgWideMatch) return 'per_aircraft'
  if (orgWideMatch && perAircraftMatch) return 'org_wide'

  // Neither matched — genuinely ambiguous.
  return null
}

/**
 * Single gpt-4o-mini disambiguation call. Mirrors the OpenAI client setup used
 * elsewhere in the codebase (e.g. app/api/intelligence/squawk-patterns/route.ts):
 * temp 0, json_object response format, gpt-4o-mini. Returns 'org_wide' on any
 * failure so the caller degrades safely.
 */
async function classifyByLlm(question: string): Promise<AskQuestionKind> {
  if (!process.env.OPENAI_API_KEY) return 'org_wide'

  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 15000,
      maxRetries: 1,
    })

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You classify a question an aircraft owner asked about their fleet of ' +
            'aircraft. Decide whether a complete answer needs ONE result PER aircraft, ' +
            'or ONE result for the WHOLE fleet.\n' +
            '- "per_aircraft": the answer lists each aircraft separately (e.g. last ' +
            'annual date, total/airframe time, next inspection due, AD compliance ' +
            'status, engine/prop times, registration expiry, airworthiness status, ' +
            '"for each aircraft").\n' +
            '- "org_wide": one answer covers the fleet (e.g. "do I have any overdue ' +
            'ADs", "which aircraft has the most hours", "which is due soonest", a ' +
            'fleet overview or summary, or any superlative like most/least/oldest).\n' +
            'Respond ONLY with JSON: {"kind":"per_aircraft"} or {"kind":"org_wide"}.',
        },
        { role: 'user', content: `Question: ${question}` },
      ],
    })

    const raw = completion.choices[0]?.message?.content ?? '{}'
    const parsed = JSON.parse(raw) as { kind?: unknown }
    return parsed.kind === 'per_aircraft' ? 'per_aircraft' : 'org_wide'
  } catch {
    // No key, network error, bad JSON — degrade to the safe single-pass option.
    return 'org_wide'
  }
}

/**
 * Classify an "All Aircraft" question as 'per_aircraft' or 'org_wide'.
 *
 * Never throws. Memoized per (trimmed, lowercased) question.
 */
export async function classifyAskQuestion(
  question: string,
): Promise<AskQuestionKind> {
  const key = String(question ?? '').trim().toLowerCase()

  // Empty question — nothing to fan out over; one pass is correct + safe.
  if (!key) return 'org_wide'

  const cached = classificationCache.get(key)
  if (cached) return cached

  // 1. Fast path: deterministic keyword + regex matching.
  const keywordResult = classifyByKeywords(key)
  if (keywordResult) {
    classificationCache.set(key, keywordResult)
    return keywordResult
  }

  // 2. Ambiguous — fall back to a single LLM call (safe-defaults to org_wide).
  const llmResult = await classifyByLlm(question)
  classificationCache.set(key, llmResult)
  return llmResult
}
