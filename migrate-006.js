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

run().catch((err) => {
  console.error('Fatal:', err.message)
  process.exit(1)
})
