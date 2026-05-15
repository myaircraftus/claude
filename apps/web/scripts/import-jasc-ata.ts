import { Client } from 'pg'
import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'

dotenv.config({ path: path.resolve(process.cwd(), '..', '..', '.env.local') })
dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), override: true })

type CsvRow = Record<string, string>

interface AtaImportRow {
  ataCode: string
  title: string
  description: string | null
  status: 'active' | 'reserved' | 'special_use' | 'unknown'
  sourceUrl: string | null
}

interface JascImportRow {
  jascCode: string
  ataCode: string
  title: string
  definition: string | null
  source: string
  sourceVersion: string
  sourceUrl: string | null
  systemLevel: boolean
  wiringCode: boolean
  singleEnginePiston: boolean
  multiEnginePiston: boolean
  turboprop: boolean
  jet: boolean
  rotorcraft: boolean
  notes: string | null
}

const DEFAULT_SOURCE_DIR = path.resolve(process.cwd(), 'data', 'jasc-ata')
const DEFAULT_SOURCE = 'FAA Joint Aircraft System/Component Code Table and Definitions'
const DEFAULT_SOURCE_VERSION = '2008-10-27'

function parseArgs() {
  const args = process.argv.slice(2)
  let sourceDir = process.env.JASC_ATA_IMPORT_DIR || DEFAULT_SOURCE_DIR
  let dryRun = false

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--dry-run') {
      dryRun = true
    } else if (arg === '--source' && args[index + 1]) {
      sourceDir = path.resolve(args[index + 1])
      index += 1
    } else if (arg.startsWith('--source=')) {
      sourceDir = path.resolve(arg.slice('--source='.length))
    }
  }

  return { sourceDir, dryRun }
}

function parseCsv(text: string): CsvRow[] {
  const rows: string[][] = []
  let row: string[] = []
  let value = ''
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const next = text[index + 1]

    if (quoted) {
      if (char === '"' && next === '"') {
        value += '"'
        index += 1
      } else if (char === '"') {
        quoted = false
      } else {
        value += char
      }
      continue
    }

    if (char === '"') {
      quoted = true
    } else if (char === ',') {
      row.push(value)
      value = ''
    } else if (char === '\n') {
      row.push(value)
      rows.push(row)
      row = []
      value = ''
    } else if (char !== '\r') {
      value += char
    }
  }

  if (value.length > 0 || row.length > 0) {
    row.push(value)
    rows.push(row)
  }

  const [headers, ...body] = rows
  if (!headers) return []

  return body
    .filter((cells) => cells.some((cell) => cell.trim().length > 0))
    .map((cells) => {
      const record: CsvRow = {}
      headers.forEach((header, index) => {
        record[header.trim()] = (cells[index] ?? '').trim()
      })
      return record
    })
}

function readCsv(filePath: string) {
  return parseCsv(fs.readFileSync(filePath, 'utf8'))
}

function bool(value: string | undefined) {
  return value === '1' || value?.toLowerCase() === 'true'
}

function normalizeAtaStatus(raw: string): AtaImportRow['status'] {
  if (raw === 'active_in_faa_jasc') return 'active'
  if (raw === 'reserved_or_not_in_faa_jasc') return 'reserved'
  if (raw === 'special_use') return 'special_use'
  return 'unknown'
}

function normalizeText(value: string | undefined) {
  const trimmed = (value ?? '').trim()
  return trimmed.length > 0 ? trimmed : null
}

function loadAtaRows(sourceDir: string): AtaImportRow[] {
  return readCsv(path.join(sourceDir, 'ata_chapters_00_99.csv')).map((row) => ({
    ataCode: row.ata_chapter,
    title: row.ata_title,
    description: row.status ? `FAA JASC package status: ${row.status}` : null,
    status: normalizeAtaStatus(row.status),
    sourceUrl: normalizeText(row.source_url),
  }))
}

function loadJascRows(sourceDir: string): JascImportRow[] {
  return readCsv(path.join(sourceDir, 'jasc_codes_full.csv')).map((row) => ({
    jascCode: row.jasc_code,
    ataCode: row.ata_chapter,
    title: row.title,
    definition: normalizeText(row.definition),
    source: row.source || DEFAULT_SOURCE,
    sourceVersion: row.source_last_updated || DEFAULT_SOURCE_VERSION,
    sourceUrl: normalizeText(row.source_url),
    systemLevel: bool(row.system_level),
    wiringCode: bool(row.wiring_code),
    singleEnginePiston: bool(row.single_engine_piston),
    multiEnginePiston: bool(row.multi_engine_piston),
    turboprop: bool(row.turboprop),
    jet: bool(row.business_jet_transport_jet),
    rotorcraft: bool(row.rotorcraft),
    notes: normalizeText(row.notes),
  }))
}

function validateRows(ataRows: AtaImportRow[], jascRows: JascImportRow[]) {
  const errors: string[] = []
  const ataCodes = new Set<string>()
  const jascCodes = new Set<string>()

  for (const row of ataRows) {
    if (!/^\d{2}$/.test(row.ataCode)) errors.push(`Invalid ATA code: ${row.ataCode}`)
    if (!row.title) errors.push(`ATA ${row.ataCode} missing title`)
    if (ataCodes.has(row.ataCode)) errors.push(`Duplicate ATA code: ${row.ataCode}`)
    ataCodes.add(row.ataCode)
  }

  for (const row of jascRows) {
    if (!/^\d{4}$/.test(row.jascCode)) errors.push(`Invalid JASC code: ${row.jascCode}`)
    if (!/^\d{2}$/.test(row.ataCode)) errors.push(`Invalid ATA for JASC ${row.jascCode}: ${row.ataCode}`)
    if (!ataCodes.has(row.ataCode)) errors.push(`JASC ${row.jascCode} references missing ATA ${row.ataCode}`)
    if (!row.title) errors.push(`JASC ${row.jascCode} missing title`)
    if (jascCodes.has(row.jascCode)) errors.push(`Duplicate JASC code: ${row.jascCode}`)
    jascCodes.add(row.jascCode)
  }

  if (errors.length > 0) {
    throw new Error(`JASC/ATA import validation failed:\n${errors.slice(0, 25).join('\n')}`)
  }
}

async function existingCodeSet(client: Client, table: string, column: string) {
  const result = await client.query<{ code: string }>(`select ${column} as code from ${table}`)
  return new Set(result.rows.map((row) => row.code))
}

async function upsertAtaRows(client: Client, rows: AtaImportRow[]) {
  const existing = await existingCodeSet(client, 'ata_chapters', 'ata_code')
  let inserted = 0
  let updated = 0

  for (const row of rows) {
    await client.query(
      `
      insert into ata_chapters (
        ata_code, title, description, status, source, source_version, source_url, updated_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, now())
      on conflict (ata_code) do update set
        title = excluded.title,
        description = excluded.description,
        status = excluded.status,
        source = excluded.source,
        source_version = excluded.source_version,
        source_url = excluded.source_url,
        updated_at = now()
      `,
      [
        row.ataCode,
        row.title,
        row.description,
        row.status,
        DEFAULT_SOURCE,
        DEFAULT_SOURCE_VERSION,
        row.sourceUrl,
      ],
    )
    if (existing.has(row.ataCode)) updated += 1
    else inserted += 1
  }

  return { inserted, updated, skipped: 0 }
}

async function upsertJascRows(client: Client, rows: JascImportRow[]) {
  const existing = await existingCodeSet(client, 'jasc_codes', 'jasc_code')
  let inserted = 0
  let updated = 0

  for (const row of rows) {
    const applicableFixedWing =
      row.singleEnginePiston || row.multiEnginePiston || row.turboprop || row.jet
    const applicablePiston = row.singleEnginePiston || row.multiEnginePiston
    const applicableTurbine = row.turboprop || row.jet

    await client.query(
      `
      insert into jasc_codes (
        jasc_code, ata_code, title, definition, source, source_version, source_url,
        status, applicable_fixed_wing, applicable_rotorcraft, applicable_piston,
        applicable_turbine, applicable_jet, applicable_turboprop,
        applicable_single_engine, applicable_multi_engine, system_level,
        wiring_code, notes, updated_at
      )
      values (
        $1, $2, $3, $4, $5, $6, $7,
        'active', $8, $9, $10, $11, $12, $13,
        $14, $15, $16, $17, $18, now()
      )
      on conflict (jasc_code) do update set
        ata_code = excluded.ata_code,
        title = excluded.title,
        definition = excluded.definition,
        source = excluded.source,
        source_version = excluded.source_version,
        source_url = excluded.source_url,
        status = excluded.status,
        applicable_fixed_wing = excluded.applicable_fixed_wing,
        applicable_rotorcraft = excluded.applicable_rotorcraft,
        applicable_piston = excluded.applicable_piston,
        applicable_turbine = excluded.applicable_turbine,
        applicable_jet = excluded.applicable_jet,
        applicable_turboprop = excluded.applicable_turboprop,
        applicable_single_engine = excluded.applicable_single_engine,
        applicable_multi_engine = excluded.applicable_multi_engine,
        system_level = excluded.system_level,
        wiring_code = excluded.wiring_code,
        notes = excluded.notes,
        updated_at = now()
      `,
      [
        row.jascCode,
        row.ataCode,
        row.title,
        row.definition,
        row.source,
        row.sourceVersion,
        row.sourceUrl,
        applicableFixedWing,
        row.rotorcraft,
        applicablePiston,
        applicableTurbine,
        row.jet,
        row.turboprop,
        row.singleEnginePiston,
        row.multiEnginePiston,
        row.systemLevel,
        row.wiringCode,
        row.notes,
      ],
    )
    if (existing.has(row.jascCode)) updated += 1
    else inserted += 1
  }

  return { inserted, updated, skipped: 0 }
}

async function main() {
  const { sourceDir, dryRun } = parseArgs()
  const ataRows = loadAtaRows(sourceDir)
  const jascRows = loadJascRows(sourceDir)

  validateRows(ataRows, jascRows)

  console.log(`JASC/ATA source: ${sourceDir}`)
  console.log(`Validated ATA chapter rows: ${ataRows.length}`)
  console.log(`Validated JASC rows: ${jascRows.length}`)

  if (dryRun) {
    console.log('Dry run only. No database writes performed.')
    return
  }

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('DATABASE_URL missing. Add it to apps/web/.env.local or root .env.local, then rerun.')
  }

  const client = new Client({ connectionString: databaseUrl })
  await client.connect()

  try {
    await client.query('begin')
    const ataResult = await upsertAtaRows(client, ataRows)
    const jascResult = await upsertJascRows(client, jascRows)

    await client.query(
      `
      insert into taxonomy_import_runs (
        source, source_version, source_url, ata_count, jasc_count, metadata
      )
      values ($1, $2, $3, $4, $5, $6::jsonb)
      `,
      [
        DEFAULT_SOURCE,
        DEFAULT_SOURCE_VERSION,
        'https://sdrs.faa.gov/documents/JASC_Code.pdf',
        ataRows.length,
        jascRows.length,
        JSON.stringify({
          source_dir: sourceDir,
          ata: ataResult,
          jasc: jascResult,
        }),
      ],
    )

    await client.query('commit')

    console.log('Import complete.')
    console.table({
      ata_chapters: ataResult,
      jasc_codes: jascResult,
    })
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
