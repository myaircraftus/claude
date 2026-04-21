#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const { Client } = require('pg')

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

const env = readEnv(path.join(__dirname, 'apps/web/.env.local'))
const client = new Client({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

const MIGRATIONS_DIR = path.join(__dirname, 'supabase', 'migrations')

async function run() {
  console.log('Connecting to Supabase...')
  await client.connect()
  console.log('Connected.\n')

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort()

  for (const file of files) {
    const filePath = path.join(MIGRATIONS_DIR, file)
    const sql = fs.readFileSync(filePath, 'utf8')
    console.log(`Running migration: ${file}`)
    try {
      await client.query(sql)
      console.log(`  ✓ ${file}`)
    } catch (err) {
      if (err.message.includes('already exists') || err.message.includes('duplicate')) {
        console.log(`  ⚠ ${file} (already applied, skipping)`)
      } else {
        console.error(`  ✗ ${file}: ${err.message}`)
      }
    }
  }

  await client.end()
  console.log('\nMigrations complete.')
}

run().catch((err) => {
  console.error('Fatal:', err.message)
  process.exit(1)
})
