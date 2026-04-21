import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const requireFromApp = createRequire(path.join(root, 'apps/web/package.json'))
const { Client } = requireFromApp('pg')
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

function qident(value) {
  return `"${String(value).replace(/"/g, '""')}"`
}

function qliteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`
}

const SCHEMA_DRIFT_TABLES = new Set([
  'aircraft',
  'conversation_threads',
  'customers',
  'documents',
  'invoice_line_items',
  'invoices',
  'logbook_entries',
  'parts_searches',
  'share_links',
  'thread_messages',
  'work_order_lines',
  'work_order_parts',
  'work_orders',
])

async function getBaseTables(client, schema) {
  const { rows } = await client.query(
    `
      select table_name
      from information_schema.tables
      where table_schema = $1
        and table_type = 'BASE TABLE'
      order by table_name
    `,
    [schema]
  )
  return rows.map((row) => row.table_name)
}

async function getTableColumns(client, schema, table) {
  const { rows } = await client.query(
    `
      select
        a.attname as column_name,
        pg_catalog.format_type(a.atttypid, a.atttypmod) as data_type,
        a.attidentity as identity_kind,
        a.attgenerated as generated_kind,
        a.attnotnull as not_null,
        pg_get_expr(ad.adbin, ad.adrelid) as default_expr
      from pg_attribute a
      join pg_class c on c.oid = a.attrelid
      join pg_namespace n on n.oid = c.relnamespace
      left join pg_attrdef ad on ad.adrelid = a.attrelid and ad.adnum = a.attnum
      where n.nspname = $1
        and c.relname = $2
        and a.attnum > 0
        and not a.attisdropped
      order by a.attnum
    `,
    [schema, table]
  )

  return rows
    .filter((row) => row.generated_kind !== 's')
    .map((row) => ({
      name: row.column_name,
      type: row.data_type,
      identityKind: row.identity_kind,
      notNull: row.not_null,
      defaultExpr: row.default_expr,
    }))
}

async function getTableColumnDefinitions(client, schema, table) {
  const { rows } = await client.query(
    `
      select
        a.attname as column_name,
        pg_catalog.format_type(a.atttypid, a.atttypmod) as data_type,
        a.attnotnull as not_null,
        a.attidentity as identity_kind,
        a.attgenerated as generated_kind,
        pg_get_expr(ad.adbin, ad.adrelid) as default_expr
      from pg_attribute a
      join pg_class c on c.oid = a.attrelid
      join pg_namespace n on n.oid = c.relnamespace
      left join pg_attrdef ad on ad.adrelid = a.attrelid and ad.adnum = a.attnum
      where n.nspname = $1
        and c.relname = $2
        and a.attnum > 0
        and not a.attisdropped
      order by a.attnum
    `,
    [schema, table]
  )

  return rows.map((row) => ({
    name: row.column_name,
    type: row.data_type,
    notNull: row.not_null,
    identityKind: row.identity_kind,
    generatedKind: row.generated_kind,
    defaultExpr: row.default_expr,
  }))
}

async function getTableRows(client, schema, table) {
  const { rows } = await client.query(`select * from ${qident(schema)}.${qident(table)}`)
  return rows
}

async function insertRows(newClient, schema, table, columns, rows) {
  if (rows.length === 0) return
  const columnNames = columns.map((col) => col.name)
  const typeList = columns
    .map((col) => `${qident(col.name)} ${col.type}`)
    .join(', ')
  const insertCols = columnNames.map(qident).join(', ')
  const selectCols = columns
    .map((col) => {
      const ref = `x.${qident(col.name)}`
      if (col.notNull && col.defaultExpr) {
        return `coalesce(${ref}, ${col.defaultExpr}) as ${qident(col.name)}`
      }
      return `${ref} as ${qident(col.name)}`
    })
    .join(', ')
  const jsonPayload = JSON.stringify(
    rows.map((row) => {
      const next = {}
      for (const columnName of columnNames) next[columnName] = row[columnName]
      return next
    })
  )
  const needsOverride = columns.some((col) => col.identityKind === 'a')
  const sql = `
    insert into ${qident(schema)}.${qident(table)} (${insertCols})
    ${needsOverride ? 'overriding system value' : ''}
    select ${selectCols}
    from jsonb_to_recordset($1::jsonb) as x(${typeList})
  `
  await newClient.query(sql, [jsonPayload])
}

async function setAllSequences(newClient, schema) {
  const { rows } = await newClient.query(
    `
      select
        seq_ns.nspname as seq_schema,
        seq.relname as seq_name,
        tbl.relname as table_name,
        att.attname as column_name
      from pg_class seq
      join pg_namespace seq_ns on seq_ns.oid = seq.relnamespace
      join pg_depend dep on dep.objid = seq.oid and dep.deptype = 'a'
      join pg_class tbl on tbl.oid = dep.refobjid
      join pg_namespace tbl_ns on tbl_ns.oid = tbl.relnamespace
      join pg_attribute att on att.attrelid = tbl.oid and att.attnum = dep.refobjsubid
      where seq.relkind = 'S'
        and tbl_ns.nspname = $1
    `,
    [schema]
  )

  for (const row of rows) {
    const tableRef = `${qident(schema)}.${qident(row.table_name)}`
    const seqRef = `${qident(row.seq_schema)}.${qident(row.seq_name)}`
    const columnRef = qident(row.column_name)
    await newClient.query(
      `select setval('${seqRef}', coalesce((select max(${columnRef}) from ${tableRef}), 0) + 1, false)`
    )
  }
}

async function ensureMissingPublicTables(oldClient, newClient) {
  const oldTables = await getBaseTables(oldClient, 'public')
  const newTables = new Set(await getBaseTables(newClient, 'public'))
  const missingTables = oldTables.filter((table) => !newTables.has(table))

  for (const table of missingTables) {
    const columns = await getTableColumnDefinitions(oldClient, 'public', table)
    const columnSql = columns
      .map((column) => {
        const parts = [`${qident(column.name)} ${column.type}`]

        if (column.generatedKind === 's') {
          return parts.join(' ')
        }

        if (column.identityKind === 'a') {
          parts.push('generated always as identity')
        } else if (column.identityKind === 'd') {
          parts.push('generated by default as identity')
        } else if (column.defaultExpr) {
          parts.push(`default ${column.defaultExpr}`)
        }

        if (column.notNull) parts.push('not null')
        return parts.join(' ')
      })
      .join(',\n  ')

    await newClient.query(
      `create table if not exists public.${qident(table)} (\n  ${columnSql}\n)`
    )
    process.stdout.write(`created public.${table}\n`)
  }

  if (missingTables.length === 0) return

  const { rows } = await oldClient.query(
    `
      select
        rel.relname as table_name,
        con.conname as constraint_name,
        con.contype as constraint_type,
        pg_get_constraintdef(con.oid, true) as constraint_def
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace n on n.oid = rel.relnamespace
      where n.nspname = 'public'
        and rel.relname = any($1::text[])
    `,
    [missingTables]
  )

  const constraintPriority = { p: 1, u: 2, c: 3, f: 4 }
  const constraintRows = rows.sort((a, b) => {
    if (a.table_name !== b.table_name) return a.table_name.localeCompare(b.table_name)
    const priorityDelta =
      (constraintPriority[a.constraint_type] ?? 99) -
      (constraintPriority[b.constraint_type] ?? 99)
    if (priorityDelta !== 0) return priorityDelta
    return a.constraint_name.localeCompare(b.constraint_name)
  })

  for (const row of constraintRows) {
    if (row.constraint_type === 'c' && row.constraint_name.endsWith('_not_null')) continue

    const { rows: existing } = await newClient.query(
      `
        select 1
        from pg_constraint con
        join pg_class rel on rel.oid = con.conrelid
        join pg_namespace n on n.oid = rel.relnamespace
        where n.nspname = 'public'
          and rel.relname = $1
          and con.conname = $2
        limit 1
      `,
      [row.table_name, row.constraint_name]
    )

    if (existing.length > 0) continue

    await newClient.query(
      `alter table public.${qident(row.table_name)} add constraint ${qident(row.constraint_name)} ${row.constraint_def}`
    )
    process.stdout.write(`added constraint public.${row.table_name}.${row.constraint_name}\n`)
  }
}

async function ensureLegacyMigrationTable(newClient) {
  await newClient.query(`
    create table if not exists public.legacy_migration_rows (
      id uuid primary key default gen_random_uuid(),
      table_name text not null,
      source_pk text null,
      row_data jsonb not null,
      migrated_at timestamptz not null default now()
    )
  `)
  await newClient.query('truncate public.legacy_migration_rows')
}

async function archiveLegacyRows(newClient, table, rows) {
  if (rows.length === 0) return
  const payload = JSON.stringify(
    rows.map((row) => ({
      table_name: table,
      source_pk: row.id ? String(row.id) : null,
      row_data: row,
    }))
  )
  await newClient.query(
    `
      insert into public.legacy_migration_rows (table_name, source_pk, row_data)
      select table_name, source_pk, row_data
      from jsonb_to_recordset($1::jsonb)
        as x(table_name text, source_pk text, row_data jsonb)
    `,
    [payload]
  )
}

function projectPublicRow(table, row, targetColumnNames) {
  const next = { ...row }

  switch (table) {
    case 'conversation_threads':
      if (targetColumnNames.has('pinned') && next.pinned == null && next.is_pinned != null) {
        next.pinned = next.is_pinned
      }
      if (targetColumnNames.has('archived') && next.archived == null && next.is_archived != null) {
        next.archived = next.is_archived
      }
      break
    case 'customers':
      if (
        targetColumnNames.has('preferred_communication') &&
        next.preferred_communication == null &&
        next.preferred_contact != null
      ) {
        next.preferred_communication = next.preferred_contact
      }
      break
    case 'invoice_line_items':
      if (targetColumnNames.has('item_type') && next.item_type == null && next.line_type != null) {
        next.item_type = next.line_type
      }
      break
    case 'invoices':
      if (targetColumnNames.has('issue_date') && next.issue_date == null && next.invoice_date != null) {
        next.issue_date = next.invoice_date
      }
      break
    case 'logbook_entries':
      if (targetColumnNames.has('total_time') && next.total_time == null && next.total_time_after != null) {
        next.total_time = next.total_time_after
      }
      if (targetColumnNames.has('description') && next.description == null && next.entry_text != null) {
        next.description = next.entry_text
      }
      if (targetColumnNames.has('references_used') && next.references_used == null && next.manual_references != null) {
        next.references_used = next.manual_references
      }
      if (targetColumnNames.has('ad_numbers') && next.ad_numbers == null && next.ad_references != null) {
        next.ad_numbers = next.ad_references
      }
      if (targetColumnNames.has('version') && next.version == null && next.version_number != null) {
        next.version = next.version_number
      }
      if (targetColumnNames.has('amendment_of') && next.amendment_of == null && next.supersedes_id != null) {
        next.amendment_of = next.supersedes_id
      }
      if (
        targetColumnNames.has('amendment_reason') &&
        next.amendment_reason == null &&
        next.amended_reason != null
      ) {
        next.amendment_reason = next.amended_reason
      }
      if (targetColumnNames.has('hobbs_out') && next.hobbs_out == null && next.hobbs_time != null) {
        next.hobbs_out = next.hobbs_time
      }
      break
    case 'parts_searches':
      if (targetColumnNames.has('query') && next.query == null && next.search_query != null) {
        next.query = next.search_query
      }
      if (
        targetColumnNames.has('work_order_id') &&
        next.work_order_id == null &&
        next.added_to_work_order_id != null
      ) {
        next.work_order_id = next.added_to_work_order_id
      }
      if (
        targetColumnNames.has('added_to_work_order') &&
        next.added_to_work_order == null
      ) {
        next.added_to_work_order = Boolean(next.added_to_work_order_id)
      }
      if (targetColumnNames.has('results') && next.results == null) {
        next.results = []
      }
      if (
        targetColumnNames.has('selected_result') &&
        next.selected_result == null &&
        next.selected_part_number != null
      ) {
        next.selected_result = { part_number: next.selected_part_number }
      }
      break
    case 'share_links':
      if (targetColumnNames.has('object_type') && next.object_type == null && next.resource_type != null) {
        next.object_type = next.resource_type
      }
      if (targetColumnNames.has('object_id') && next.object_id == null && next.resource_id != null) {
        next.object_id = next.resource_id
      }
      if (targetColumnNames.has('revoked') && next.revoked == null && next.is_active != null) {
        next.revoked = !next.is_active
      }
      if (targetColumnNames.has('permissions') && next.permissions == null) {
        next.permissions = {
          can_download: Boolean(next.can_download),
          can_print: Boolean(next.can_print),
          max_views: next.max_views ?? null,
          label: next.label ?? null,
        }
      }
      break
    case 'thread_messages':
      if (targetColumnNames.has('intent') && next.intent == null && next.intent_type != null) {
        next.intent = next.intent_type
      }
      break
    case 'work_orders':
      if (targetColumnNames.has('complaint') && next.complaint == null) {
        next.complaint = next.customer_complaint ?? next.squawk ?? null
      }
      if (
        targetColumnNames.has('customer_visible_notes') &&
        next.customer_visible_notes == null &&
        next.customer_notes != null
      ) {
        next.customer_visible_notes = next.customer_notes
      }
      if (targetColumnNames.has('total_amount') && next.total_amount == null) {
        next.total_amount = next.total ?? next.subtotal ?? null
      }
      break
  }

  const projected = {}
  for (const columnName of targetColumnNames) {
    if (Object.prototype.hasOwnProperty.call(next, columnName)) {
      projected[columnName] = next[columnName]
    }
  }
  return projected
}

async function copyPublicTables(oldClient, newClient) {
  await ensureLegacyMigrationTable(newClient)
  await ensureMissingPublicTables(oldClient, newClient)
  const tables = await getBaseTables(oldClient, 'public')
  await newClient.query(
    `truncate ${tables.map((table) => `public.${qident(table)}`).join(', ')} restart identity cascade`
  )

  for (const table of tables) {
    const columns = await getTableColumns(newClient, 'public', table)
    const targetColumnNames = new Set(columns.map((column) => column.name))
    const sourceRows = await getTableRows(oldClient, 'public', table)
    if (SCHEMA_DRIFT_TABLES.has(table) && sourceRows.length > 0) {
      await archiveLegacyRows(newClient, table, sourceRows)
    }
    const rows = sourceRows.map((row) => projectPublicRow(table, row, targetColumnNames))
    if (rows.length === 0) continue
    const batchSize = 200
    for (let i = 0; i < rows.length; i += batchSize) {
      await insertRows(newClient, 'public', table, columns, rows.slice(i, i + batchSize))
    }
    process.stdout.write(`copied public.${table}: ${rows.length}\n`)
  }

  await setAllSequences(newClient, 'public')
}

async function copyAuthTables(oldClient, newClient) {
  const tables = ['users', 'identities']

  await newClient.query('truncate auth.identities, auth.users cascade')

  for (const table of tables) {
    const rows = await getTableRows(oldClient, 'auth', table)
    if (rows.length === 0) continue
    const columns = await getTableColumns(newClient, 'auth', table)
    await insertRows(newClient, 'auth', table, columns, rows)
    process.stdout.write(`copied auth.${table}: ${rows.length}\n`)
  }
}

async function ensureBucket(client, bucket) {
  const { data: buckets, error: listError } = await client.storage.listBuckets()
  if (listError) throw listError
  if (buckets.some((entry) => entry.id === bucket.id)) return

  const { error } = await client.storage.createBucket(bucket.id, {
    public: bucket.public,
    allowedMimeTypes: bucket.allowedMimeTypes ?? undefined,
    fileSizeLimit: bucket.fileSizeLimit ?? undefined,
  })
  if (error) throw error
}

async function copyStorage(oldSupabase, newSupabase, oldDb) {
  const { data: buckets, error } = await oldSupabase.storage.listBuckets()
  if (error) throw error

  for (const bucket of buckets) {
    await ensureBucket(newSupabase, {
      id: bucket.id,
      public: bucket.public,
      allowedMimeTypes: bucket.allowed_mime_types ?? null,
      fileSizeLimit: bucket.file_size_limit ?? null,
    })
  }

  for (const bucket of buckets) {
    const { rows: objects } = await oldDb.query(
      'select name, metadata from storage.objects where bucket_id = $1 order by name',
      [bucket.id]
    )

    for (const object of objects) {
      const { data: blob, error: downloadError } = await oldSupabase.storage
        .from(bucket.id)
        .download(object.name)

      if (downloadError) throw downloadError

      const arrayBuffer = await blob.arrayBuffer()
      const uploadPath = object.name
      const metadata = object.metadata ?? {}
      const contentType =
        metadata.mimetype ||
        metadata.contentType ||
        blob.type ||
        'application/octet-stream'

      const { error: uploadError } = await newSupabase.storage
        .from(bucket.id)
        .upload(uploadPath, Buffer.from(arrayBuffer), {
          contentType,
          upsert: true,
        })

      if (uploadError) throw uploadError
      process.stdout.write(`copied storage ${bucket.id}/${uploadPath}\n`)
    }
  }
}

async function main() {
  const localEnv = readEnv(path.join(root, 'apps/web/.env.local'))
  const oldDatabaseUrl = process.env.MIGRATION_OLD_DATABASE_URL
  const oldSupabaseUrl = process.env.MIGRATION_OLD_SUPABASE_URL
  const oldSupabaseServiceRoleKey = process.env.MIGRATION_OLD_SUPABASE_SERVICE_ROLE_KEY

  if (!oldDatabaseUrl || !oldSupabaseUrl || !oldSupabaseServiceRoleKey) {
    throw new Error(
      'Missing MIGRATION_OLD_DATABASE_URL, MIGRATION_OLD_SUPABASE_URL, or MIGRATION_OLD_SUPABASE_SERVICE_ROLE_KEY'
    )
  }

  if (
    !localEnv.DATABASE_URL ||
    !localEnv.NEXT_PUBLIC_SUPABASE_URL ||
    !localEnv.SUPABASE_SERVICE_ROLE_KEY
  ) {
    throw new Error('apps/web/.env.local must contain DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY')
  }

  const oldDb = new Client({
    connectionString: oldDatabaseUrl,
    ssl: { rejectUnauthorized: false },
  })

  const newDb = new Client({
    connectionString: localEnv.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  })

  const oldSupabase = createClient(
    oldSupabaseUrl,
    oldSupabaseServiceRoleKey,
    { auth: { persistSession: false } }
  )

  const newSupabase = createClient(
    localEnv.NEXT_PUBLIC_SUPABASE_URL,
    localEnv.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )

  await oldDb.connect()
  await newDb.connect()

  try {
    await newDb.query('set session_replication_role = replica')
    await copyAuthTables(oldDb, newDb)
    await copyPublicTables(oldDb, newDb)
    await newDb.query('set session_replication_role = origin')
    await copyStorage(oldSupabase, newSupabase, oldDb)
  } finally {
    try {
      await newDb.query('set session_replication_role = origin')
    } catch {}
    await oldDb.end()
    await newDb.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
