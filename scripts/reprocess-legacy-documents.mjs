import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const requireFromApp = createRequire(path.join(root, 'apps/web/package.json'))
const { createClient } = requireFromApp('@supabase/supabase-js')

function readEnv(filePath) {
  const env = {}
  const text = fs.readFileSync(filePath, 'utf8')

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const idx = trimmed.indexOf('=')
    if (idx === -1) continue

    let value = trimmed.slice(idx + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    env[trimmed.slice(0, idx).trim()] = value
  }

  return env
}

function applyLocalEnv() {
  const localEnv = readEnv(path.join(root, 'apps/web/.env.local'))
  for (const [key, value] of Object.entries(localEnv)) {
    if (!process.env[key]) process.env[key] = value
  }
}

function parseArgs(argv) {
  let orgByTail = null
  let organizationId = null
  let tail = null
  let limit = 50
  let appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.myaircraft.us'

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--org-by-tail') {
      orgByTail = argv[i + 1] ?? null
      i += 1
    } else if (arg === '--organization-id') {
      organizationId = argv[i + 1] ?? null
      i += 1
    } else if (arg === '--tail') {
      tail = argv[i + 1] ?? null
      i += 1
    } else if (arg === '--limit') {
      limit = Number.parseInt(argv[i + 1] ?? '50', 10)
      i += 1
    } else if (arg === '--app-url') {
      appUrl = argv[i + 1] ?? appUrl
      i += 1
    }
  }

  if (!organizationId && !orgByTail && !tail) {
    throw new Error('Pass --organization-id <ORG_ID>, --org-by-tail <TAIL>, or --tail <TAIL>.')
  }

  return {
    organizationId: organizationId ?? null,
    orgByTail: orgByTail?.toUpperCase() ?? null,
    tail: tail?.toUpperCase() ?? null,
    limit: Number.isFinite(limit) && limit > 0 ? limit : 50,
    appUrl,
  }
}

async function main() {
  applyLocalEnv()

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('apps/web/.env.local must contain NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  }

  if (!process.env.PARSER_SERVICE_SECRET && !process.env.INTERNAL_SECRET) {
    throw new Error('apps/web/.env.local must contain PARSER_SERVICE_SECRET or INTERNAL_SECRET')
  }

  const args = parseArgs(process.argv.slice(2))
  const appUrl = args.appUrl.replace(/\/$/, '')
  const internalSecret = process.env.INTERNAL_SECRET || process.env.PARSER_SERVICE_SECRET

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  let organizationId = args.organizationId
  let aircraftId = null

  if (!organizationId && (args.orgByTail || args.tail)) {
    const seedTail = args.orgByTail ?? args.tail
    const { data: aircraftRows, error } = await supabase
      .from('aircraft')
      .select('id, organization_id, tail_number')
      .eq('tail_number', seedTail)
      .limit(10)

    if (error || !aircraftRows || aircraftRows.length === 0) {
      throw new Error(`Aircraft ${seedTail} not found`)
    }

    const aircraft = aircraftRows[0]
    if (aircraftRows.length > 1) {
      process.stdout.write(
        `warning: ${seedTail} exists in ${aircraftRows.length} orgs, defaulting to ${aircraft.organization_id}\n`
      )
    }

    organizationId = aircraft.organization_id
    if (args.tail) aircraftId = aircraft.id
  }

  let query = supabase
    .from('documents')
    .select('id, title, organization_id, aircraft_id, parsing_status, uploaded_at, processing_state, parse_error')
    .order('uploaded_at', { ascending: true })
    .limit(args.limit)

  if (organizationId) query = query.eq('organization_id', organizationId)
  if (aircraftId) query = query.eq('aircraft_id', aircraftId)

  const { data: documents, error: docsError } = await query
  if (docsError) throw docsError

  const candidates = (documents ?? []).filter(
    (doc) => !['queued', 'parsing', 'ocr_processing', 'chunking', 'embedding'].includes(doc.parsing_status)
  )

  process.stdout.write(`reprocessing ${candidates.length} document(s)\n`)

  let successCount = 0
  let failedCount = 0

  for (const doc of candidates) {
    const url = `${appUrl}/api/documents/${doc.id}/retry`
    process.stdout.write(`\n→ ${doc.title} (${doc.id})\n`)

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': internalSecret,
      },
      body: JSON.stringify({ force: true }),
    })

    let payload = {}
    try {
      payload = await response.json()
    } catch {
      payload = {}
    }

    const effectiveStatus = typeof payload.status === 'string' ? payload.status : 'ok'

    if (!response.ok || effectiveStatus === 'failed') {
      failedCount += 1
      process.stdout.write(
        `  failed: ${payload.error ?? payload.warning ?? `HTTP ${response.status}`}\n`
      )
      continue
    }

    successCount += 1
    process.stdout.write(
      `  ${effectiveStatus} via ${payload.ingestion_mode ?? 'unknown'}${payload.warning ? ` · ${payload.warning}` : ''}\n`
    )
  }

  process.stdout.write(`\ncompleted=${successCount} failed=${failedCount}\n`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
