/**
 * Trace the full /api/ask flow for a given question against real production
 * data. Runs the same code paths the UI hits — search_logbook + search_documents
 * tools, plus citation enrichment — and logs every artifact's action_url and
 * every citation's documentId so we can see *exactly* what the UI is given.
 *
 * Run: ../../node_modules/.bin/tsx scripts/trace-ask.ts "find me latest annual"
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'
try {
  const env = readFileSync(resolve(__dirname, '../.env.local'), 'utf8')
  for (const line of env.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
  }
} catch {}

import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import { generateAnswer } from '../lib/rag/generation'
import { enrichAnswerCitationsWithAnchors } from '../lib/rag/citation-anchors'
import { AI_TOOLS } from '../lib/ai/tools'
import type { RetrievedChunk } from '../types'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
const N8202L_AIRCRAFT_ID = '812434e2-7cc1-41f5-91f3-0601ba52ea35'
const HORIZON_ORG_ID = '82042eee-1d20-49a4-be12-12f73e335392'
const N8202L_TAIL = 'N8202L'

const QUESTION = process.argv[2] ?? 'find me latest annual'

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE)
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  console.log(`\n=== Tracing /api/ask: "${QUESTION}" ===\n`)
  console.log('Aircraft:', N8202L_TAIL, '(id:', N8202L_AIRCRAFT_ID + ')')

  // ── Step A: simulate the AI's owner-mode tool dispatch ────────────────────
  // We give GPT-4o the same tools the live route exposes (search_documents
  // and search_logbook in owner mode), and watch which one it picks.

  // Mirrors OWNER_TOOL_NAMES in /api/ask — owner mode now only exposes
  // search_documents so every question runs RAG over uploaded PDFs and the
  // user gets cited passages they can open in a side preview.
  const ownerTools = AI_TOOLS.filter((t) => ['search_documents'].includes(t.function.name))

  console.log('\nStep A. Asking GPT-4o which tool to call...')
  const dispatch = await openai.chat.completions.create({
    model: 'gpt-4o',
    temperature: 0.3,
    tools: ownerTools as any,
    tool_choice: 'auto',
    messages: [
      {
        role: 'system',
        content:
          'You are a routing layer. Pick the right tool for an aircraft owner question. Use search_logbook for past maintenance history, search_documents for general retrieval.',
      },
      {
        role: 'user',
        content: `[Context: aircraft_id=${N8202L_AIRCRAFT_ID}]\n\n${QUESTION}`,
      },
    ],
  })

  const toolCalls = dispatch.choices[0].message.tool_calls ?? []
  console.log(`   AI picked ${toolCalls.length} tool call(s):`, toolCalls.map((tc) => tc.function.name))

  // ── Step B: emulate each tool ─────────────────────────────────────────────
  for (const tc of toolCalls) {
    const args = JSON.parse(tc.function.arguments || '{}')
    args.aircraft_id ??= N8202L_AIRCRAFT_ID

    if (tc.function.name === 'search_logbook') {
      console.log('\nStep B. search_logbook — replicating the route handler...')
      console.log('   args:', JSON.stringify(args))

      // Mirror the keyword normalization the live route does
      const QUALIFIERS = /\b(?:latest|last|most|recent|find|show|me|please|the|a|an|of|on|for|inspection|inspections|entry|entries|aircraft)\b/g
      const normalized = String(args.query ?? '')
        .toLowerCase()
        .replace(/-/g, ' ')
        .replace(QUALIFIERS, ' ')
        .replace(/\s+/g, ' ')
        .trim()
      const terms = normalized.split(' ').filter((t) => t.length >= 2)
      const primaryTerm = terms.find((t) => /\d/.test(t)) ?? terms[0]
      console.log('   normalized terms:', terms, '→ primary:', primaryTerm)

      let q = supabase
        .from('logbook_entries')
        .select(
          'id, aircraft_id, entry_type, entry_date, description, total_time, hobbs_in, hobbs_out, tach_time, logbook_type, mechanic_name, work_order_id, work_order_ref',
        )
        .eq('aircraft_id', N8202L_AIRCRAFT_ID)
        .eq('organization_id', HORIZON_ORG_ID)
        .order('entry_date', { ascending: false })
      if (primaryTerm) q = q.ilike('description', `%${primaryTerm}%`)

      const { data: entries, error } = await q.limit(50)
      if (error) console.error('   query error:', error.message)
      console.log(`   API would return ${entries?.length ?? 0} entries`)

      const filtered =
        terms.length > 0
          ? (entries ?? []).filter((e: any) => {
              const haystack = `${e.description ?? ''} ${e.entry_type ?? ''} ${e.logbook_type ?? ''}`.toLowerCase()
              return terms.every((t) => haystack.includes(t))
            })
          : entries ?? []

      const top = filtered.slice(0, 5)
      console.log('\n   Top 5 matches that the artifact would render:')
      top.forEach((e: any, i: number) => {
        console.log(
          `   [${i + 1}] ${e.entry_date} · ${e.entry_type ?? '?'} · ${e.logbook_type ?? '?'} · tach ${e.tach_time ?? '-'} · tt ${e.total_time ?? '-'}`,
        )
        console.log(`        id=${e.id}`)
        console.log(`        text: ${(e.description ?? '').slice(0, 120)}`)
      })

      console.log('\n   Artifact action_url (top "Use this" button):')
      console.log(`   → /aircraft/${N8202L_AIRCRAFT_ID}   (the WHOLE aircraft profile)`)
      console.log('\n   Per-entry "Open entry" deep link target:')
      if (top[0]) {
        console.log(`   → /aircraft/${N8202L_AIRCRAFT_ID}#logbook-${top[0].id}`)
        console.log('     (#logbook-<id> requires anchors on the AircraftDetail page!)')
      }
    }

    if (tc.function.name === 'search_documents') {
      console.log('\nStep B. search_documents — running real RAG...')
      const { data: chunks } = await supabase
        .from('document_chunks')
        .select('id, document_id, chunk_index, chunk_text, page_number, page_number_end, section_title')
        .eq('aircraft_id', N8202L_AIRCRAFT_ID)
        .ilike('chunk_text', '%annual%')
        .limit(8)
      const docIds = Array.from(new Set((chunks ?? []).map((c) => c.document_id)))
      const { data: docs } = await supabase.from('documents').select('id, title, doc_type').in('id', docIds)
      const docById = new Map((docs ?? []).map((d) => [d.id, d]))

      const retrieved: RetrievedChunk[] = (chunks ?? []).map(
        (c) =>
          ({
            chunk_id: c.id,
            document_id: c.document_id,
            document_title: docById.get(c.document_id)?.title ?? 'Untitled',
            doc_type: (docById.get(c.document_id)?.doc_type as any) ?? 'other',
            chunk_index: c.chunk_index,
            chunk_text: c.chunk_text,
            page_number: c.page_number ?? 1,
            page_number_end: c.page_number_end ?? null,
            section_title: c.section_title ?? null,
            aircraft_id: N8202L_AIRCRAFT_ID,
            aircraft_tail: N8202L_TAIL,
            embedding_score: 0.85,
            bm25_score: null,
            combined_score: 0.85,
            metadata_json: {},
          } as unknown as RetrievedChunk),
      )

      const result = await generateAnswer(QUESTION, retrieved)
      const enriched = await enrichAnswerCitationsWithAnchors({
        citations: result.citations,
        retrievedChunks: retrieved,
        supabase: supabase as any,
      })

      const markers = Array.from(result.answer.matchAll(/\[(\d+)\]/g)).map((m) => m[1])
      console.log(`   answer (first 250 chars): ${result.answer.slice(0, 250)}`)
      console.log(`   [N] markers in text: ${markers.join(',')}`)
      console.log(`   citations.length: ${enriched.length}`)
      enriched.forEach((c, i) => {
        const href = `/documents/${c.documentId}?page=${c.pageNumber}&chunk=${c.chunkId}`
        console.log(`   [${i + 1}] documentId=${c.documentId} page=${c.pageNumber}`)
        console.log(`        href: ${href}`)
      })
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
