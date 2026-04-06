import { NextRequest, NextResponse } from 'next/server'

// FAA Aircraft Registry lookup proxy
// Tries the JSON API first; falls back to HTML scraping when the API is down.

interface FAALookupResult {
  tail_number: string
  make: string
  model: string
  year?: number
  serial_number?: string
  engine_make?: string
  engine_model?: string
  registrant_name?: string
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const rawTail = searchParams.get('tail')?.trim().toUpperCase() ?? ''

  if (!rawTail) {
    return NextResponse.json({ error: 'tail number required' }, { status: 400 })
  }

  // Normalise: strip leading N, then add it back so we always query as "N12345"
  const digits = rawTail.replace(/^N/, '')
  if (!digits) {
    return NextResponse.json({ error: 'Invalid tail number' }, { status: 400 })
  }
  const nNumber = `N${digits}`

  try {
    // ── 1. Try the JSON API ──────────────────────────────────────────────────
    const jsonResult = await tryJsonAPI(nNumber)
    if (jsonResult) return NextResponse.json(jsonResult)

    // ── 2. Fall back: scrape the HTML inquiry page ───────────────────────────
    const htmlResult = await tryHTMLScrape(nNumber)
    if (htmlResult) return NextResponse.json(htmlResult)

    return NextResponse.json(
      { error: 'Aircraft not found in FAA Registry' },
      { status: 404 }
    )
  } catch {
    return NextResponse.json(
      { error: 'FAA Registry unreachable. Please enter details manually.' },
      { status: 503 }
    )
  }
}

// ─── JSON API ─────────────────────────────────────────────────────────────────

async function tryJsonAPI(nNumber: string): Promise<FAALookupResult | null> {
  try {
    const url = `https://registry.faa.gov/aircraftinquiry/api/NNumInquiry/${encodeURIComponent(nNumber)}`
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'MyAircraft/1.0' },
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return null
    const raw = await res.json()
    return parseJsonResponse(nNumber, raw)
  } catch {
    return null
  }
}

function parseJsonResponse(nNumber: string, raw: any): FAALookupResult | null {
  const desc = raw?.aircraftDescription ?? raw?.acftRef ?? raw?.aircraft ?? raw
  const engine = raw?.engineReference ?? raw?.engRef ?? {}
  const registrant = raw?.registrantInformation ?? raw?.registrant ?? {}

  const make = (desc?.manufacturer ?? desc?.acftMfr ?? desc?.mfr ?? '').trim()
  const model = (desc?.model ?? desc?.acftModel ?? '').trim()
  if (!make && !model) return null

  let year: number | undefined
  const yearRaw = desc?.yearMfr ?? desc?.year_mfr ?? raw?.yearMfr
  if (yearRaw) {
    const n = parseInt(String(yearRaw), 10)
    if (n > 1900 && n <= new Date().getFullYear() + 2) year = n
  }

  return {
    tail_number: nNumber,
    make,
    model,
    year,
    serial_number: (desc?.serialNumber ?? desc?.serial ?? '').trim() || undefined,
    engine_make: (engine?.manufacturer ?? engine?.engMfr ?? desc?.engMfr ?? '').trim() || undefined,
    engine_model: (engine?.model ?? engine?.engModel ?? desc?.engModel ?? '').trim() || undefined,
    registrant_name: (registrant?.name ?? registrant?.registrantName ?? '').trim() || undefined,
  }
}

// ─── HTML scraping ────────────────────────────────────────────────────────────
// FAA Registry public inquiry page returns HTTP 200 with structured HTML even
// when the JSON API is returning 503.

async function tryHTMLScrape(nNumber: string): Promise<FAALookupResult | null> {
  try {
    // The N-number without the leading "N" for the query string
    const num = nNumber.replace(/^N/, '')
    const url = `https://registry.faa.gov/aircraftinquiry/Search/NNumberResult?nNumberTxt=${encodeURIComponent(num)}`

    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; MyAircraft/1.0; +https://myaircraft.app)',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(10000),
    })

    if (!res.ok) return null

    const html = await res.text()

    // The FAA page renders data as table rows: <th>LABEL</th><td>VALUE</td>
    // or as <td class="...">LABEL</td><td class="...">VALUE</td>
    // We use a general key→value extractor.
    const kv = extractFAAKeyValues(html)
    if (Object.keys(kv).length === 0) return null

    const make = kv['mfr name'] ?? kv['manufacturer name'] ?? kv['manufacturer'] ?? ''
    const model = kv['model'] ?? kv['model designation'] ?? ''

    if (!make && !model) return null

    let year: number | undefined
    const yearStr = kv['year mfr'] ?? kv['year manufactured'] ?? kv['mfr year'] ?? ''
    if (yearStr) {
      const n = parseInt(yearStr, 10)
      if (n > 1900 && n <= new Date().getFullYear() + 2) year = n
    }

    return {
      tail_number: nNumber,
      make: make.trim(),
      model: model.trim(),
      year,
      serial_number: (kv['serial number'] ?? kv['serial no'] ?? '').trim() || undefined,
      engine_make: (kv['eng mfr'] ?? kv['engine mfr'] ?? kv['engine manufacturer'] ?? '').trim() || undefined,
      engine_model: (kv['eng model'] ?? kv['engine model'] ?? '').trim() || undefined,
      registrant_name: (kv['name'] ?? kv['registrant name'] ?? '').trim() || undefined,
    }
  } catch {
    return null
  }
}

// Extracts <th|td> label → next <td> value pairs from FAA HTML.
// Normalises labels to lowercase for case-insensitive lookup.
function extractFAAKeyValues(html: string): Record<string, string> {
  const result: Record<string, string> = {}

  // Match table cell content (strip tags, decode entities)
  const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi
  const cells: string[] = []
  let m: RegExpExecArray | null

  while ((m = cellRe.exec(html)) !== null) {
    // Strip inner HTML tags and decode basic entities
    const text = m[1]
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .replace(/&#\d+;/g, '')
      .trim()
    if (text) cells.push(text)
  }

  // Pair up: label cell followed by value cell
  for (let i = 0; i < cells.length - 1; i++) {
    const label = cells[i].toLowerCase()
    const value = cells[i + 1]
    // Skip numeric-only "labels" or very short ones
    if (label.length < 2 || /^\d+$/.test(label)) continue
    // Skip if value looks like another label (all-caps header row)
    if (!result[label]) {
      result[label] = value
    }
  }

  return result
}
