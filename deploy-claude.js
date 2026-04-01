#!/usr/bin/env node
// Deploy apps/web to myaircraft-claude Vercel project via REST API
const https = require('https')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const TOKEN = process.env.VERCEL_TOKEN || ''
const TEAM_ID = 'team_Cj1WPlrNF3g31otdwHl4UbW7'
const PROJECT_ID = 'prj_g7vwvp6YjqLRdeTMR83L2gfW12EA'
const APP_DIR = path.join(__dirname, 'apps', 'web')

const IGNORE = new Set(['node_modules', '.next', '.vercel', '.git', 'coverage', 'dist', '.turbo', 'src'])
const IGNORE_PATTERNS = ['.env', '.env.local', '.env.production', '*.log', 'tsconfig.tsbuildinfo']

function shouldIgnore(name) {
  if (IGNORE.has(name)) return true
  if (IGNORE_PATTERNS.some(p => p.startsWith('*') ? name.endsWith(p.slice(1)) : name === p)) return true
  return false
}

function collectFiles(dir, files = []) {
  let entries
  try { entries = fs.readdirSync(dir) } catch { return files }
  for (const entry of entries) {
    if (shouldIgnore(entry)) continue
    const fullPath = path.join(dir, entry)
    let stat
    try { stat = fs.lstatSync(fullPath) } catch { continue }
    if (stat.isSymbolicLink()) continue
    if (stat.isDirectory()) collectFiles(fullPath, files)
    else if (stat.isFile() && stat.size < 5 * 1024 * 1024) files.push(fullPath)
  }
  return files
}

function apiCall(method, urlPath, data) {
  return new Promise((resolve, reject) => {
    const body = data ? JSON.stringify(data) : null
    const req = https.request({
      hostname: 'api.vercel.com',
      path: urlPath + (urlPath.includes('?') ? '&' : '?') + `teamId=${TEAM_ID}`,
      method,
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
        ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {})
      },
      timeout: 30000,
    }, (res) => {
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => { try { resolve(JSON.parse(d)) } catch { resolve(d) } })
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(new Error('timeout')) })
    if (body) req.write(body)
    req.end()
  })
}

function uploadOne(sha, buf) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.vercel.com',
      path: `/v2/files?teamId=${TEAM_ID}`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/octet-stream',
        'x-vercel-digest': sha,
        'Content-Length': buf.length,
      },
      timeout: 20000,
    }, (res) => {
      res.resume()
      res.on('end', () => resolve(res.statusCode))
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(new Error('timeout')) })
    req.write(buf)
    req.end()
  })
}

async function main() {
  console.log('Collecting files...')
  const files = collectFiles(APP_DIR)
  console.log(`Found ${files.length} files`)

  const fileDescs = []
  for (const fp of files) {
    let buf
    try { buf = fs.readFileSync(fp) } catch(e) { console.log('Skip:', fp, e.message); continue }
    const sha = crypto.createHash('sha1').update(buf).digest('hex')
    const rel = path.relative(APP_DIR, fp).replace(/\\/g, '/')
    fileDescs.push({ file: rel, sha, size: buf.length, buf })
  }
  console.log(`Prepared ${fileDescs.length} files, uploading...`)

  let i = 0
  for (const fd of fileDescs) {
    try {
      const status = await uploadOne(fd.sha, fd.buf)
      if (status !== 200 && status !== 409) console.log(`  HTTP ${status}: ${fd.file}`)
    } catch(e) {
      console.log(`  Upload error for ${fd.file}: ${e.message}`)
    }
    i++
    if (i % 20 === 0) console.log(`  ${i}/${fileDescs.length}`)
  }
  console.log('All files uploaded\n')

  console.log('Creating deployment...')
  const result = await apiCall('POST', `/v13/deployments?projectId=${PROJECT_ID}&forceNew=1`, {
    name: 'myaircraft-claude',
    target: 'production',
    files: fileDescs.map(f => ({ file: f.file, sha: f.sha, size: f.size })),
    projectSettings: {
      framework: 'nextjs',
      buildCommand: 'npm run build',
      outputDirectory: '.next',
      installCommand: 'npm install --legacy-peer-deps',
      nodeVersion: '20.x',
    }
  })

  if (result.error) {
    console.error('Error:', result.error.message)
    console.log(JSON.stringify(result).slice(0, 500))
    process.exit(1)
  }

  console.log(`State: ${result.readyState}`)
  console.log(`URL:   https://${result.url}`)
  console.log(`ID:    ${result.id}`)

  if (result.id) {
    console.log('Polling for ready state...')
    let state = result.readyState, attempts = 0
    while (state !== 'READY' && state !== 'ERROR' && attempts < 40) {
      await new Promise(r => setTimeout(r, 15000))
      const s = await apiCall('GET', `/v13/deployments/${result.id}`, null)
      state = s.readyState
      console.log(`  ${state} (${(attempts+1)*15}s)`)
      attempts++
    }
    if (state === 'READY') console.log(`\n✅ https://${result.url}`)
    else console.log(`\n⚠ Final state: ${state} — check https://vercel.com/dashboard`)
  }
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1) })
