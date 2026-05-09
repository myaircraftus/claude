import { Client } from 'pg'
import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'

// Run from apps/web/. .env.local is in this dir; migration files are
// two levels up at <repo>/supabase/migrations/.
dotenv.config({ path: '.env.local' })

const repoRoot = path.resolve(process.cwd(), '..', '..')
const migrationDir = path.join(repoRoot, 'supabase', 'migrations')

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL missing in apps/web/.env.local')

const client = new Client({ connectionString: url })

async function main() {
  await client.connect()

  const m098 = fs.readFileSync(path.join(migrationDir, '098_vision_index_registry.sql'), 'utf8')
  const m099 = fs.readFileSync(path.join(migrationDir, '099_vision_embeddings.sql'), 'utf8')

  await client.query('BEGIN')
  try {
    console.log('Applying 098_vision_index_registry.sql ...')
    await client.query(m098)
    console.log('  OK')
    console.log('Applying 099_vision_embeddings.sql ...')
    await client.query(m099)
    console.log('  OK')
    await client.query('COMMIT')
    console.log('COMMIT — migrations 098 + 099 applied')
  } catch (e) {
    await client.query('ROLLBACK')
    console.error('ROLLBACK:', e)
    process.exit(1)
  }

  const tables = await client.query(`
    SELECT table_name,
           (SELECT COUNT(*)::int FROM information_schema.columns
              WHERE table_name = t.table_name AND table_schema = 'public') AS col_count
    FROM information_schema.tables t
    WHERE table_schema = 'public'
      AND table_name IN ('vision_pages', 'vision_index_jobs', 'vision_embeddings')
    ORDER BY table_name;
  `)
  console.log('\nVerification (expect 3 rows):')
  console.table(tables.rows)

  if (tables.rows.length !== 3) {
    console.error(`\nFAIL: expected 3 tables, got ${tables.rows.length}`)
    process.exit(1)
  }

  const ext = await client.query(`SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';`)
  console.log('\npgvector extension:')
  console.table(ext.rows)

  const idx = await client.query(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'vision_embeddings'
    ORDER BY indexname;
  `)
  console.log('\nIndexes on vision_embeddings:')
  console.table(idx.rows.map((r: any) => ({ indexname: r.indexname, def: r.indexdef.slice(0, 90) + '...' })))

  await client.end()
}

main().catch(async (err) => {
  console.error(err)
  try { await client.end() } catch {}
  process.exit(1)
})
