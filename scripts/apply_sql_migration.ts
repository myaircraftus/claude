import { readFileSync } from 'fs'
import { resolve } from 'path'
import { Client } from 'pg'

async function main() {
  const migrationPath = process.argv[2]
  if (!migrationPath) {
    throw new Error('Usage: tsx scripts/apply_sql_migration.ts <sql-file>')
  }

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required')
  }

  const sql = readFileSync(resolve(process.cwd(), migrationPath), 'utf8')
  const client = new Client({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('supabase.com') ? { rejectUnauthorized: false } : undefined,
  })

  await client.connect()
  try {
    await client.query(sql)
    console.log(`Applied migration: ${migrationPath}`)
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
