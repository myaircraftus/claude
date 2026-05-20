#!/usr/bin/env tsx
/**
 * One-time backfill — build PageIndex trees for every aircraft-scoped document
 * uploaded BEFORE the tree-builder wiring landed in lib/ingestion/server.ts
 * (2026-05-17, commit 13d4daac). All 351 existing documents predate that.
 *
 * Re-running is SAFE: buildDocumentTree() deletes prior nodes for a doc before
 * inserting (tree-builder.ts:63), so each call is idempotent.
 *
 * The 5 aircraft-less documents are intentionally excluded — matches the
 * early-return in ingestDocumentInline (server.ts:2248), which only builds the
 * org-scoped reference BM25 for those, not a tree.
 *
 * Usage (from apps/web):
 *   pnpm exec tsx scripts/backfill-trees.ts                   # backfill all
 *   pnpm exec tsx scripts/backfill-trees.ts --dry-run         # list only
 *   pnpm exec tsx scripts/backfill-trees.ts --limit 5         # first N
 *   pnpm exec tsx scripts/backfill-trees.ts --concurrency 5
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL + OPENAI_API_KEY
 * in apps/web/.env.local (loaded automatically). Logs per-doc node count plus
 * any failures; never aborts the whole run on a single doc error.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

// ─── Env: load .env.local BEFORE importing modules that read process.env ─────
function loadEnv(): void {
  try {
    const text = readFileSync(resolve(HERE, '..', '.env.local'), 'utf8')
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
      if (!m) continue
      let v = m[2]
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1)
      }
      if (!process.env[m[1]]) process.env[m[1]] = v
    }
  } catch (err) {
    console.error('[backfill-trees] could not read apps/web/.env.local:', (err as Error).message)
    process.exit(1)
  }
}
loadEnv()

if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
  console.error('[backfill-trees] missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL')
  process.exit(1)
}
if (!process.env.OPENAI_API_KEY) {
  console.warn('[backfill-trees] OPENAI_API_KEY missing — trees will use non-AI labels only')
}

// ─── Dynamic imports (now that env is set) ───────────────────────────────────
const { createServiceSupabase } = await import('../lib/supabase/server')
const { buildDocumentTree } = await import('../lib/rag/tree-builder')

// ─── CLI args ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const limit = (() => {
  const i = args.indexOf('--limit')
  return i >= 0 ? Math.max(0, Number(args[i + 1]) || 0) : 0
})()
const concurrency = (() => {
  const i = args.indexOf('--concurrency')
  return i >= 0 ? Math.max(1, Number(args[i + 1]) || 3) : 3
})()

// ─── Run ─────────────────────────────────────────────────────────────────────
interface DocRow {
  id: string
  aircraft_id: string
  doc_type: string | null
  title: string | null
}

async function main(): Promise<void> {
  const supabase = createServiceSupabase()

  const { data, error } = await supabase
    .from('documents')
    .select('id, aircraft_id, doc_type, title')
    .not('aircraft_id', 'is', null)
    .is('deleted_at', null)
    .order('aircraft_id', { ascending: true })
    .limit(10000)
  if (error) {
    console.error('[backfill-trees] documents query failed:', error.message)
    process.exit(1)
  }

  const targets = (data ?? []).filter((d: DocRow) => d.id && d.aircraft_id) as DocRow[]
  const slice = limit > 0 ? targets.slice(0, limit) : targets

  console.log(
    `[backfill-trees] ${targets.length} aircraft-scoped docs found; ` +
      `processing ${slice.length}${dryRun ? ' (dry-run)' : ''} with concurrency ${concurrency}`,
  )

  if (dryRun) {
    for (const d of slice) {
      console.log(`  - ${d.id}  (${d.doc_type ?? '?'})  ${(d.title ?? '').slice(0, 60)}`)
    }
    return
  }

  // Bounded-concurrency worker pool — one doc per slot.
  let cursor = 0
  let totalNodes = 0
  let successCount = 0
  const failures: Array<{ id: string; error: string }> = []

  async function worker(id: number): Promise<void> {
    while (cursor < slice.length) {
      const i = cursor++
      const d = slice[i]
      const t0 = Date.now()
      try {
        const { nodesCreated } = await buildDocumentTree(d.id, d.aircraft_id)
        totalNodes += nodesCreated
        successCount += 1
        console.log(
          `[w${id}] ${i + 1}/${slice.length}  ${d.id}  ${d.doc_type ?? '?'}  ` +
            `${nodesCreated} nodes  ${Date.now() - t0}ms`,
        )
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        failures.push({ id: d.id, error: msg })
        console.error(`[w${id}] ${i + 1}/${slice.length}  ${d.id}  FAILED: ${msg}`)
      }
    }
  }

  const t0 = Date.now()
  await Promise.all(Array.from({ length: concurrency }, (_, i) => worker(i + 1)))
  const elapsedS = ((Date.now() - t0) / 1000).toFixed(1)

  console.log('\n══════════ BACKFILL COMPLETE ══════════')
  console.log(`Docs processed:  ${slice.length}`)
  console.log(`Succeeded:       ${successCount}`)
  console.log(`Failed:          ${failures.length}`)
  console.log(`Total nodes:     ${totalNodes}`)
  console.log(`Elapsed:         ${elapsedS}s`)
  if (failures.length > 0) {
    console.log('\nFailures:')
    for (const f of failures) console.log(`  - ${f.id}: ${f.error}`)
  }
}

main().catch((err) => {
  console.error('[backfill-trees] FATAL:', err)
  process.exit(1)
})
