#!/usr/bin/env node
// Run all Supabase migrations against the remote database
const { Client } = require('pg')
const fs = require('fs')
const path = require('path')

const client = new Client({
  host: 'db.buhrmuzgyzamowkaybjg.supabase.co',
  port: 5432,
  user: 'postgres',
  password: 'Aryamanpatel@2011',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
})

const MIGRATIONS_DIR = path.join(__dirname, 'supabase', 'migrations')

async function run() {
  console.log('Connecting to Supabase...')
  await client.connect()
  console.log('Connected.\n')

  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort()

  for (const file of files) {
    const filePath = path.join(MIGRATIONS_DIR, file)
    const sql = fs.readFileSync(filePath, 'utf8')
    console.log(`Running migration: ${file}`)
    try {
      await client.query(sql)
      console.log(`  ✓ ${file}`)
    } catch (err) {
      // If object already exists, treat as idempotent
      if (err.message.includes('already exists') || err.message.includes('duplicate')) {
        console.log(`  ⚠ ${file} (already applied, skipping)`)
      } else {
        console.error(`  ✗ ${file}: ${err.message}`)
        // Continue with other migrations even if one fails
      }
    }
  }

  await client.end()
  console.log('\nMigrations complete.')
}

run().catch(err => {
  console.error('Fatal:', err.message)
  process.exit(1)
})
