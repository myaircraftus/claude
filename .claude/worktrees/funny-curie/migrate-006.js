#!/usr/bin/env node
// Re-run migrations 006, 010, 011 (006 had dimension fix)
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

// Only run migrations that weren't fully applied
const TARGET = ['006_embeddings.sql', '010_gdrive.sql', '011_rls.sql']

async function run() {
  console.log('Connecting...')
  await client.connect()
  console.log('Connected.\n')

  for (const file of TARGET) {
    const filePath = path.join(MIGRATIONS_DIR, file)
    const sql = fs.readFileSync(filePath, 'utf8')
    console.log(`Running: ${file}`)
    try {
      await client.query(sql)
      console.log(`  ✓ ${file}`)
    } catch (err) {
      if (err.message.includes('already exists') || err.message.includes('duplicate')) {
        console.log(`  ⚠ Already applied: ${err.message.split('\n')[0]}`)
      } else {
        console.error(`  ✗ ${file}: ${err.message}`)
      }
    }
  }

  await client.end()
  console.log('\nDone.')
}

run().catch(err => { console.error('Fatal:', err.message); process.exit(1) })
