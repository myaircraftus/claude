#!/usr/bin/env node
/**
 * Ask Logbook AI — ACCURACY eval harness (SOP audit — Wave 1.8).
 *
 * ask-stress-test.mjs measures STRUCTURE (does an answer come back, does it
 * cite, is it slow). This measures ACCURACY: each case in rag-eval-cases.json
 * asserts what a *correct* answer must look like, and the harness scores the
 * live system against those expectations. Run it before/after a deploy so an
 * accuracy regression in retrieval or generation is caught, not silent.
 *
 * It needs YOUR authenticated session — like the stress test, YOU run it.
 *
 * USAGE
 *   cd apps/web
 *   RAG_EVAL_BASE_URL="https://www.myaircraft.us" \
 *   RAG_EVAL_COOKIE="<paste your browser session cookie for the site>" \
 *   node scripts/rag-eval.mjs
 *
 * Get RAG_EVAL_COOKIE: open the app logged in -> DevTools -> Network -> any
 * request -> Request Headers -> copy the entire `cookie:` value.
 *
 * OPTIONS (env)
 *   RAG_EVAL_CASES    Path to the cases file (default scripts/rag-eval-cases.json)
 *   RAG_EVAL_DELAY_MS Delay between requests (default 4800ms; /api/ask is
 *                     rate-limited 15/min — keep >= 4100ms)
 *   RAG_EVAL_OUT      Output JSON path (default rag-eval-results.json)
 *
 * EXIT CODE: 0 if every case passes, 1 if any case fails — so it can gate CI.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const BASE_URL = (process.env.RAG_EVAL_BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
const COOKIE = process.env.RAG_EVAL_COOKIE || ''
const DELAY_MS = Math.max(4100, Number(process.env.RAG_EVAL_DELAY_MS) || 4800)
const CASES_PATH = resolve(HERE, process.env.RAG_EVAL_CASES || 'rag-eval-cases.json')
const OUT = process.env.RAG_EVAL_OUT || 'rag-eval-results.json'

if (!COOKIE) {
  console.error('ERROR: RAG_EVAL_COOKIE is required (your authenticated session cookie). See the file header.')
  process.exit(1)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const CONFIDENCE_RANK = { insufficient_evidence: 0, low: 1, medium: 2, high: 3 }

/** Score one answer payload against a case's `expect`. Returns {pass, failures[]}. */
function scoreCase(testCase, answerPayload) {
  const expect = testCase.expect || {}
  const failures = []
  const answer = String(answerPayload?.answer ?? '')
  const answerLc = answer.toLowerCase()
  const confidence = String(answerPayload?.confidence ?? 'insufficient_evidence')
  const citations = Array.isArray(answerPayload?.citations) ? answerPayload.citations : []

  if (expect.insufficient === true && confidence !== 'insufficient_evidence') {
    failures.push(`expected insufficient_evidence, got confidence="${confidence}"`)
  }
  if (Array.isArray(expect.mustContainAny) && expect.mustContainAny.length > 0) {
    const hit = expect.mustContainAny.some((s) => answerLc.includes(String(s).toLowerCase()))
    if (!hit) failures.push(`answer contains none of: ${JSON.stringify(expect.mustContainAny)}`)
  }
  if (Array.isArray(expect.mustContainAll)) {
    for (const s of expect.mustContainAll) {
      if (!answerLc.includes(String(s).toLowerCase())) failures.push(`answer missing required: "${s}"`)
    }
  }
  if (Array.isArray(expect.mustNotContain)) {
    for (const s of expect.mustNotContain) {
      if (answerLc.includes(String(s).toLowerCase())) failures.push(`answer contains forbidden: "${s}"`)
    }
  }
  if (typeof expect.minCitations === 'number' && citations.length < expect.minCitations) {
    failures.push(`expected >= ${expect.minCitations} citations, got ${citations.length}`)
  }
  if (typeof expect.minConfidence === 'string') {
    const want = CONFIDENCE_RANK[expect.minConfidence] ?? 0
    const got = CONFIDENCE_RANK[confidence] ?? 0
    if (got < want) failures.push(`expected confidence >= ${expect.minConfidence}, got ${confidence}`)
  }
  return { pass: failures.length === 0, failures }
}

async function runCase(testCase) {
  const body = { question: testCase.question, persona: testCase.persona || 'owner' }
  if (testCase.aircraft_id && !String(testCase.aircraft_id).startsWith('REPLACE')) {
    body.aircraft_id = testCase.aircraft_id
  }
  const started = Date.now()
  try {
    const res = await fetch(`${BASE_URL}/api/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: COOKIE },
      body: JSON.stringify(body),
    })
    const ms = Date.now() - started
    if (!res.ok) {
      return { ok: false, ms, error: `HTTP ${res.status}`, payload: null }
    }
    return { ok: true, ms, error: null, payload: await res.json() }
  } catch (err) {
    return { ok: false, ms: Date.now() - started, error: String(err), payload: null }
  }
}

async function main() {
  let cases
  try {
    const parsed = JSON.parse(readFileSync(CASES_PATH, 'utf8'))
    cases = (parsed.cases || []).filter((c) => !String(c.id).startsWith('TEMPLATE-'))
    const skipped = (parsed.cases || []).length - cases.length
    console.log(`Loaded ${cases.length} eval case(s) from ${CASES_PATH}` +
      (skipped > 0 ? ` (${skipped} TEMPLATE- case(s) skipped — fill them in to enable)` : ''))
  } catch (err) {
    console.error(`ERROR: could not read cases file ${CASES_PATH}: ${err}`)
    process.exit(1)
  }
  if (cases.length === 0) {
    console.error('No runnable cases. Add real cases to rag-eval-cases.json (remove the TEMPLATE- prefix).')
    process.exit(1)
  }

  const results = []
  let passed = 0
  for (let i = 0; i < cases.length; i++) {
    const testCase = cases[i]
    process.stdout.write(`[${i + 1}/${cases.length}] ${testCase.id} … `)
    const run = await runCase(testCase)
    let scored
    if (!run.ok) {
      scored = { pass: false, failures: [`request failed: ${run.error}`] }
    } else {
      scored = scoreCase(testCase, run.payload)
    }
    if (scored.pass) {
      passed++
      console.log(`PASS (${run.ms}ms)`)
    } else {
      console.log(`FAIL (${run.ms}ms)`)
      for (const f of scored.failures) console.log(`        ✗ ${f}`)
    }
    results.push({
      id: testCase.id,
      question: testCase.question,
      pass: scored.pass,
      failures: scored.failures,
      latency_ms: run.ms,
      answer: run.payload?.answer ?? null,
      confidence: run.payload?.confidence ?? null,
      citation_count: Array.isArray(run.payload?.citations) ? run.payload.citations.length : 0,
    })
    if (i < cases.length - 1) await sleep(DELAY_MS)
  }

  const passRate = cases.length > 0 ? Math.round((passed / cases.length) * 100) : 0
  console.log('')
  console.log(`─────────────────────────────────────────`)
  console.log(`RAG accuracy eval: ${passed}/${cases.length} passed (${passRate}%)`)
  console.log(`─────────────────────────────────────────`)
  writeFileSync(OUT, JSON.stringify({ passRate, passed, total: cases.length, results }, null, 2))
  console.log(`Full report written to ${OUT}`)

  // Non-zero exit on any failure so this can gate a deploy / CI.
  process.exit(passed === cases.length ? 0 : 1)
}

main()
