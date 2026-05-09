import { Client } from 'pg'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL missing')

const client = new Client({ connectionString: url })

async function main() {
  await client.connect()

  // Direct insert into storage.buckets — supabase-storage-api uses
  // this same row layout. Public=false so signed URLs are required
  // for read.
  await client.query(`
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('vision-pages', 'vision-pages', false)
    ON CONFLICT (id) DO NOTHING;
  `)

  const r = await client.query(`
    SELECT id, name, public, created_at
    FROM storage.buckets
    WHERE id = 'vision-pages';
  `)
  console.log('vision-pages bucket:')
  console.table(r.rows)

  if (r.rows.length !== 1) {
    console.error('FAIL: bucket not present after insert')
    process.exit(1)
  }

  await client.end()
}

main().catch(async (e) => {
  console.error(e)
  try { await client.end() } catch {}
  process.exit(1)
})
