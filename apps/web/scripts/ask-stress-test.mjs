#!/usr/bin/env node
/**
 * Ask Logbook AI — stress-test harness.
 *
 * Runs a large, varied question bank against the live /api/ask endpoint and
 * writes a report so you can review REAL answers, citations and confidence —
 * no fabrication, no guessing. This is the honest way to "stress test 100+
 * questions": it needs YOUR authenticated session, so YOU run it.
 *
 * USAGE
 *   cd apps/web
 *   ASK_BASE_URL="https://www.myaircraft.us" \
 *   ASK_COOKIE="<paste your browser session cookie for the site>" \
 *   node scripts/ask-stress-test.mjs
 *
 * Get ASK_COOKIE: open the app logged in → DevTools → Network → any request →
 * Request Headers → copy the entire `cookie:` value.
 *
 * OPTIONS (env vars)
 *   ASK_AIRCRAFT_ID   Pin single-aircraft questions to this aircraft UUID.
 *                     If unset, the first aircraft from /api/aircraft is used.
 *   ASK_DELAY_MS      Delay between requests (default 4800ms). /api/ask is rate
 *                     limited to 15/min — keep this >= 4100ms.
 *   ASK_LIMIT         Only run the first N questions (smoke test).
 *   ASK_OUT          Output JSON path (default ask-stress-results.json).
 *
 * OUTPUT
 *   - ask-stress-results.json  — full per-question record
 *   - console summary          — flag counts, confidence mix, latency
 *
 * FLAGS raised per answer (for your review — the harness cannot judge factual
 * correctness, only structural quality):
 *   error            non-2xx response or network failure
 *   empty_answer     answer text empty / trivially short
 *   no_citations     answer cites no source documents
 *   no_page_numbers  has citations but none carry a page number
 *   low_confidence   confidence is 'low' / 'insufficient_evidence'
 *   slow             round-trip > 8s
 *   unsupported_high 'high' confidence with ZERO citations — hallucination risk
 */

const BASE_URL = (process.env.ASK_BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
const COOKIE = process.env.ASK_COOKIE || ''
const DELAY_MS = Math.max(4100, Number(process.env.ASK_DELAY_MS) || 4800)
const LIMIT = Number(process.env.ASK_LIMIT) || 0
const OUT = process.env.ASK_OUT || 'ask-stress-results.json'

if (!COOKIE) {
  console.error('ERROR: ASK_COOKIE is required (your authenticated session cookie). See the header of this file.')
  process.exit(1)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── Question bank ───────────────────────────────────────────────────────────
// persona: owner | mechanic   scope: single | all
// `adversarial: true` marks questions whose answer is almost certainly NOT in
// maintenance records — a correct system should return low confidence / "I
// don't know", NOT a confident answer. Watch the `unsupported_high` flag here.
const BANK = [
  // ── Identity, times, status ──────────────────────────────────────────────
  ['owner', 'all', 'identity', 'What is the total time on the airframe?'],
  ['owner', 'single', 'identity', 'What is the current tach time on this aircraft?'],
  ['owner', 'single', 'identity', 'What is the Hobbs reading in the most recent entry?'],
  ['owner', 'single', 'identity', 'What is the engine time since major overhaul (SMOH)?'],
  ['owner', 'single', 'identity', 'What is the propeller time since overhaul?'],
  ['owner', 'single', 'identity', 'What make, model and serial number is this aircraft?'],
  ['owner', 'all', 'identity', 'List every aircraft and its total airframe time.'],
  ['pilot', 'single', 'identity', 'Is this aircraft currently airworthy per the records?'],
  ['owner', 'single', 'identity', 'When was the engine last overhauled?'],
  ['owner', 'single', 'identity', 'What is the engine make and model?'],

  // ── Annual / 100-hour inspections ────────────────────────────────────────
  ['owner', 'single', 'inspection', 'When was the last annual inspection?'],
  ['owner', 'all', 'inspection', 'When was the last annual inspection for each aircraft?'],
  ['owner', 'single', 'inspection', 'When is the next annual inspection due?'],
  ['owner', 'single', 'inspection', 'Who signed off the most recent annual inspection?'],
  ['mechanic', 'single', 'inspection', 'What were the findings of the last annual inspection?'],
  ['owner', 'single', 'inspection', 'When was the last 100-hour inspection?'],
  ['mechanic', 'single', 'inspection', 'Has a 100-hour inspection ever been done on this aircraft?'],
  ['owner', 'single', 'inspection', 'How many annual inspections are recorded in the logbooks?'],
  ['pilot', 'single', 'inspection', 'Is the annual inspection current?'],
  ['mechanic', 'single', 'inspection', 'What was the IA certificate number on the last annual?'],
  ['owner', 'single', 'inspection', 'Were any discrepancies noted at the last annual?'],
  ['owner', 'all', 'inspection', 'Which aircraft are overdue for an annual inspection?'],

  // ── ADs / SBs / compliance ───────────────────────────────────────────────
  ['mechanic', 'single', 'compliance', 'What airworthiness directives have been complied with?'],
  ['mechanic', 'single', 'compliance', 'Are there any outstanding or overdue ADs?'],
  ['mechanic', 'single', 'compliance', 'Is there any recurring AD on this aircraft, and when is it next due?'],
  ['mechanic', 'single', 'compliance', 'Has AD 2011-10-09 been complied with?'],
  ['mechanic', 'single', 'compliance', 'What service bulletins have been applied?'],
  ['pilot', 'single', 'compliance', 'Is the transponder check current?'],
  ['pilot', 'single', 'compliance', 'When was the last pitot-static (IFR) certification?'],
  ['pilot', 'single', 'compliance', 'When does the ELT battery expire?'],
  ['owner', 'single', 'compliance', 'When was the last altimeter certification?'],
  ['mechanic', 'single', 'compliance', 'Show me every AD compliance entry with its method of compliance.'],
  ['owner', 'all', 'compliance', 'Across all aircraft, which have outstanding ADs?'],

  // ── Component history + counting questions ───────────────────────────────
  ['owner', 'single', 'component', 'How many times was the alternator replaced in the last 5 years?'],
  ['mechanic', 'single', 'component', 'How many times has the battery been replaced?'],
  ['mechanic', 'single', 'component', 'When were the magnetos last overhauled or replaced?'],
  ['mechanic', 'single', 'component', 'Has the vacuum pump ever been replaced? When?'],
  ['owner', 'single', 'component', 'How many times has the ELT battery been changed?'],
  ['mechanic', 'single', 'component', 'List every tire replacement in the records.'],
  ['mechanic', 'single', 'component', 'When were the brake pads or brake discs last serviced?'],
  ['owner', 'single', 'component', 'Has the starter been replaced? How many times?'],
  ['mechanic', 'single', 'component', 'When was the most recent oil change?'],
  ['owner', 'single', 'component', 'How often has the oil been changed in the last two years?'],
  ['mechanic', 'single', 'component', 'Have the spark plugs been replaced recently?'],
  ['mechanic', 'single', 'component', 'When was the last compression test and what were the readings?'],
  ['owner', 'single', 'component', 'Has the propeller ever been replaced?'],
  ['mechanic', 'single', 'component', 'When was the last propeller overhaul or balance?'],
  ['mechanic', 'single', 'component', 'Has any avionics equipment been installed or upgraded?'],
  ['owner', 'single', 'component', 'When was the GPS or navigation equipment last updated?'],
  ['mechanic', 'single', 'component', 'List all cylinder work — repairs, replacements, top overhauls.'],
  ['mechanic', 'single', 'component', 'Has the carburetor been overhauled?'],
  ['owner', 'single', 'component', 'How many times has the aircraft had its tires changed in 5 years?'],
  ['mechanic', 'single', 'component', 'When was the fuel system last serviced or inspected?'],

  // ── Damage / incident history ────────────────────────────────────────────
  ['owner', 'single', 'damage', 'Has this aircraft ever had any damage history?'],
  ['owner', 'single', 'damage', 'Are there any records of a prop strike?'],
  ['owner', 'single', 'damage', 'Has the aircraft ever been involved in a hard landing?'],
  ['owner', 'single', 'damage', 'Is there any record of corrosion repair?'],
  ['owner', 'single', 'damage', 'Has there been any sheet metal or structural repair?'],
  ['owner', 'single', 'damage', 'Are there any Form 337 major repairs or alterations on file?'],
  ['owner', 'single', 'damage', 'Has the aircraft been repainted, and when?'],

  // ── Ownership / registration / records completeness ──────────────────────
  ['owner', 'single', 'ownership', 'Who is the registered owner of this aircraft?'],
  ['owner', 'single', 'ownership', 'When does the aircraft registration expire?'],
  ['owner', 'single', 'records', 'Are there any gaps in the maintenance records?'],
  ['owner', 'single', 'records', 'What is the earliest entry in the logbooks?'],
  ['owner', 'single', 'records', 'How many logbook documents are on file for this aircraft?'],
  ['owner', 'single', 'records', 'Are the airframe, engine and propeller logbooks all present?'],

  // ── Prebuy / value style ─────────────────────────────────────────────────
  ['owner', 'single', 'prebuy', 'If I were buying this aircraft, what red flags are in the records?'],
  ['owner', 'single', 'prebuy', 'Summarize the maintenance history for a prebuy review.'],
  ['owner', 'single', 'prebuy', 'Does this aircraft have complete and continuous maintenance records?'],

  // ── Open-ended / summary ─────────────────────────────────────────────────
  ['owner', 'single', 'summary', 'Give me a summary of everything done to this aircraft in the last year.'],
  ['mechanic', 'single', 'summary', 'What maintenance is coming due soon?'],
  ['owner', 'single', 'summary', 'What was the most expensive maintenance event in the records?'],
  ['mechanic', 'single', 'summary', 'What was the most recent work performed on this aircraft?'],
  ['pilot', 'single', 'summary', 'Anything I should know before flying this aircraft today?'],

  // ── Mechanic-mode action questions ───────────────────────────────────────
  ['mechanic', 'single', 'action', 'Draft a logbook entry for an oil change.'],
  ['mechanic', 'single', 'action', 'Generate an annual inspection checklist for this aircraft.'],
  ['mechanic', 'single', 'action', 'Find me a part number for the oil filter.'],
  ['mechanic', 'single', 'action', 'Show me the last few logbook entries.'],
  ['mechanic', 'single', 'action', 'Draft a return-to-service entry for a brake replacement.'],

  // ── Cross-aircraft / all-aircraft (tests the fan-out) ────────────────────
  ['owner', 'all', 'fleet', 'Which of my aircraft has the most flight hours?'],
  ['owner', 'all', 'fleet', 'When was each aircraft last flown according to the records?'],
  ['owner', 'all', 'fleet', 'Which aircraft has the most recent annual inspection?'],
  ['owner', 'all', 'fleet', 'Do all of my aircraft have current registrations?'],
  ['owner', 'all', 'fleet', 'Compare the engine times across all my aircraft.'],

  // ── Phrasing / paraphrase robustness (same intent, different words) ──────
  ['owner', 'single', 'paraphrase', 'Has this plane been inspected recently?'],
  ['owner', 'single', 'paraphrase', 'When did it last get its yearly inspection?'],
  ['owner', 'single', 'paraphrase', 'Tell me about the most recent checkup on the aircraft.'],
  ['owner', 'single', 'paraphrase', 'whats the tach reading'],
  ['owner', 'single', 'paraphrase', 'engine hours?'],
  ['mechanic', 'single', 'paraphrase', 'any ADs i need to worry about'],

  // ── Adversarial — answer should NOT be in maintenance records ────────────
  ['owner', 'single', 'adversarial', 'What was the fuel price on the last flight?'],
  ['pilot', 'single', 'adversarial', 'What is the weather forecast for tomorrow at the home airport?'],
  ['owner', 'single', 'adversarial', 'Who was the pilot on the most recent flight?'],
  ['owner', 'single', 'adversarial', 'What is the resale value of this aircraft in dollars?'],
  ['owner', 'single', 'adversarial', 'Has the aircraft ever been struck by lightning in flight?'],
  ['mechanic', 'single', 'adversarial', 'What is the cruise speed of this aircraft at 8000 feet?'],
  ['owner', 'single', 'adversarial', 'What color is the interior upholstery?'],
  ['owner', 'single', 'adversarial', 'Did the owner ever miss a loan payment on this aircraft?'],
  ['pilot', 'single', 'adversarial', 'What is the capital of France?'],
  ['owner', 'single', 'adversarial', 'Will this aircraft pass its next annual inspection?'],

  // ── Edge cases — empty / odd input ───────────────────────────────────────
  ['owner', 'single', 'edge', 'annual'],
  ['owner', 'single', 'edge', 'When was the last annual inspection? When was the last annual inspection? When was the last annual inspection?'],
  ['owner', 'single', 'edge', 'Tell me about the airworthiness directives and also the oil changes and also the damage history and also the ownership and also the prop and also the avionics.'],

  // ── Specifics that should resolve to exact cited passages ────────────────
  ['mechanic', 'single', 'precision', 'What is the exact wording of the most recent return-to-service statement?'],
  ['mechanic', 'single', 'precision', 'On what date and at what tach time was the last oil change performed?'],
  ['owner', 'single', 'precision', 'Quote the airworthiness certification statement from the last annual.'],
  ['mechanic', 'single', 'precision', 'What AD numbers are referenced in the records, exactly?'],
  ['owner', 'single', 'precision', 'What is the aircraft serial number, exactly as written in the records?'],
]

// ── HTTP ────────────────────────────────────────────────────────────────────
async function api(path, init = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', cookie: COOKIE, ...(init.headers || {}) },
  })
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = null }
  return { status: res.status, json, raw: text }
}

async function resolveAircraftId() {
  if (process.env.ASK_AIRCRAFT_ID) return process.env.ASK_AIRCRAFT_ID
  const { status, json } = await api('/api/aircraft', { method: 'GET' })
  if (status !== 200) {
    console.warn(`! Could not list aircraft (HTTP ${status}); single-aircraft questions will run org-wide.`)
    return null
  }
  const list = Array.isArray(json) ? json : json?.aircraft ?? json?.data ?? []
  const first = list[0]
  return first?.id ?? null
}

function flagsFor(rec) {
  const f = []
  if (rec.error) f.push('error')
  const answer = (rec.answer || '').trim()
  if (!rec.error && answer.length < 15) f.push('empty_answer')
  const cites = rec.citation_count
  if (!rec.error && cites === 0) f.push('no_citations')
  if (!rec.error && cites > 0 && rec.citations_with_page === 0) f.push('no_page_numbers')
  const conf = String(rec.confidence || '').toLowerCase()
  if (conf === 'low' || conf === 'insufficient_evidence') f.push('low_confidence')
  if (rec.latency_ms > 8000) f.push('slow')
  if (conf === 'high' && cites === 0 && !rec.error) f.push('unsupported_high')
  return f
}

async function run() {
  console.log(`Ask Logbook AI stress test → ${BASE_URL}`)
  const aircraftId = await resolveAircraftId()
  console.log(`Single-aircraft questions target: ${aircraftId ?? '(org-wide fallback)'}`)

  let bank = BANK.map(([persona, scope, category, question], i) => ({ i, persona, scope, category, question }))
  if (LIMIT > 0) bank = bank.slice(0, LIMIT)
  console.log(`Running ${bank.length} questions, ${DELAY_MS}ms apart (~${Math.round(60000 / DELAY_MS)}/min)\n`)

  const results = []
  for (const q of bank) {
    const body = {
      question: q.question,
      persona: q.persona === 'mechanic' ? 'mechanic' : 'owner',
    }
    if (q.scope === 'single' && aircraftId) body.aircraft_id = aircraftId

    const started = Date.now()
    let rec = { ...q, latency_ms: 0, error: null }
    try {
      const { status, json } = await api('/api/ask', { method: 'POST', body: JSON.stringify(body) })
      rec.latency_ms = Date.now() - started
      rec.http_status = status
      if (status === 429) { rec.error = 'rate_limited'; }
      else if (status !== 200 || !json) { rec.error = `http_${status}`; }
      else {
        rec.answer = json.answer ?? ''
        rec.confidence = json.confidence ?? null
        const cites = Array.isArray(json.citations) ? json.citations : []
        rec.citation_count = cites.length
        rec.citations_with_page = cites.filter((c) => c && (c.pageNumber != null || c.page_number != null)).length
        rec.tool_calls = json.tool_calls_made ?? []
      }
    } catch (err) {
      rec.latency_ms = Date.now() - started
      rec.error = `network: ${err?.message ?? err}`
    }
    rec.flags = flagsFor(rec)
    results.push(rec)

    const tag = rec.flags.length ? `  [${rec.flags.join(',')}]` : ''
    console.log(
      `${String(q.i + 1).padStart(3)}/${BANK.length} ${q.persona}/${q.scope}/${q.category}` +
        ` — conf=${rec.confidence ?? '-'} cites=${rec.citation_count ?? '-'} ${rec.latency_ms}ms${tag}`,
    )

    if (rec.error === 'rate_limited') { console.log('   rate limited — backing off 60s'); await sleep(60000) }
    await sleep(DELAY_MS)
  }

  // ── Summary ──
  const flagCounts = {}
  for (const r of results) for (const f of r.flags) flagCounts[f] = (flagCounts[f] || 0) + 1
  const confMix = {}
  for (const r of results) { const c = r.confidence ?? '(none)'; confMix[c] = (confMix[c] || 0) + 1 }
  const ok = results.filter((r) => !r.error)
  const avgLatency = ok.length ? Math.round(ok.reduce((s, r) => s + r.latency_ms, 0) / ok.length) : 0

  console.log('\n──────── SUMMARY ────────')
  console.log(`questions:        ${results.length}`)
  console.log(`answered (2xx):   ${ok.length}`)
  console.log(`avg latency:      ${avgLatency}ms`)
  console.log(`confidence mix:   ${JSON.stringify(confMix)}`)
  console.log(`flags:            ${JSON.stringify(flagCounts)}`)
  console.log('\nReview especially: unsupported_high (hallucination risk on adversarial Qs),')
  console.log('no_citations, no_page_numbers. The harness checks STRUCTURE, not factual')
  console.log('correctness — read the answers in the JSON to verify accuracy.')

  const { writeFileSync } = await import('node:fs')
  writeFileSync(OUT, JSON.stringify({ base_url: BASE_URL, aircraft_id: aircraftId, ran_at: new Date().toISOString(), summary: { flagCounts, confMix, avgLatency }, results }, null, 2))
  console.log(`\nFull results → ${OUT}`)
}

run().catch((err) => { console.error('FATAL:', err); process.exit(1) })
