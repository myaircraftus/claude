import { NextRequest, NextResponse } from 'next/server'

interface FAALookupResult {
  tail_number: string
  make: string
  model: string
  year?: number
  serial_number?: string
  engine_make?: string
  engine_model?: string
  aircraft_type?: string
  engine_type?: string
  registrant_name?: string
  city?: string
  state?: string
  status?: string
  cert_issue_date?: string
  expiration_date?: string
  mode_s_hex?: string
}

/**
 * Extract all label→value pairs from the FAA registry HTML.
 * The page uses: <td data-label="">Label</td><td data-label="Label">Value</td>
 */
function parseDataLabels(html: string): Record<string, string> {
  const result: Record<string, string> = {}

  // Match pairs: empty data-label (the heading cell) followed immediately by
  // a data-label with the same text (the value cell).
  // Pattern: <td data-label="">LABEL</td> ... <td data-label="LABEL">VALUE</td>
  const rowRegex = /<td[^>]*data-label=""[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*data-label="[^"]*"[^>]*>([\s\S]*?)<\/td>/gi
  let match: RegExpExecArray | null

  while ((match = rowRegex.exec(html)) !== null) {
    const label = match[1].replace(/<[^>]+>/g, '').trim()
    const value = match[2].replace(/<[^>]+>/g, '').trim()
    if (label && value) {
      result[label.toLowerCase()] = value
    }
  }

  return result
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const tailRaw = searchParams.get('tail')?.toUpperCase().trim() ?? ''

  if (!tailRaw) {
    return NextResponse.json({ error: 'tail number required' }, { status: 400 })
  }

  // FAA URL uses the number WITHOUT the N prefix
  const nDigits = tailRaw.replace(/^N/, '')
  const nNumber = `N${nDigits}`

  const faaUrl = `https://registry.faa.gov/aircraftinquiry/Search/NNumberResult?NNumberTxt=${encodeURIComponent(nDigits)}`

  try {
    const resp = await fetch(faaUrl, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(10000),
    })

    if (!resp.ok) {
      return NextResponse.json({ error: 'FAA Registry unreachable' }, { status: 503 })
    }

    const html = await resp.text()

    // Check for "not assigned" / not found
    const lowerHtml = html.toLowerCase()
    if (
      lowerHtml.includes('is not assigned') ||
      lowerHtml.includes('no aircraft found') ||
      lowerHtml.includes('invalid n-number') ||
      !lowerHtml.includes('aircraft description')
    ) {
      return NextResponse.json({ error: 'Aircraft not found in FAA Registry' }, { status: 404 })
    }

    const fields = parseDataLabels(html)

    const make = (fields['manufacturer name'] ?? '').replace(/\s+/g, ' ').trim()
    const model = (fields['model'] ?? '').replace(/\s+/g, ' ').trim()

    if (!make && !model) {
      return NextResponse.json({ error: 'Aircraft not found in FAA Registry' }, { status: 404 })
    }

    let year: number | undefined
    const yearRaw = fields['mfr year']
    if (yearRaw) {
      const parsed = parseInt(yearRaw, 10)
      if (!isNaN(parsed) && parsed > 1900 && parsed <= new Date().getFullYear() + 2) {
        year = parsed
      }
    }

    const result: FAALookupResult = {
      tail_number: nNumber,
      make: toTitleCase(make),
      model: model.replace(/\s+/g, ' '),
      year,
      serial_number: (fields['serial number'] ?? '').replace(/\s+/g, ' ').trim() || undefined,
      engine_make: toTitleCase((fields['engine manufacturer'] ?? '').replace(/\s+/g, ' ').trim()) || undefined,
      engine_model: (fields['engine model'] ?? '').replace(/\s+/g, ' ').trim() || undefined,
      aircraft_type: (fields['type aircraft'] ?? '').replace(/\s+/g, ' ').trim() || undefined,
      engine_type: (fields['type engine'] ?? '').replace(/\s+/g, ' ').trim() || undefined,
      registrant_name: toTitleCase((fields['name'] ?? '').replace(/\s+/g, ' ').trim()) || undefined,
      city: toTitleCase((fields['city'] ?? '').replace(/\s+/g, ' ').trim()) || undefined,
      state: toTitleCase((fields['state'] ?? '').replace(/\s+/g, ' ').trim()) || undefined,
      status: (fields['status'] ?? '').replace(/\s+/g, ' ').trim() || undefined,
      cert_issue_date: (fields['certificate issue date'] ?? '').trim() || undefined,
      expiration_date: (fields['expiration date'] ?? '').trim() || undefined,
      mode_s_hex: (fields['mode s code (base 16 / hex)'] ?? '').trim() || undefined,
    }

    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json(
      { error: 'FAA Registry unreachable. Please enter details manually.' },
      { status: 503 }
    )
  }
}

function toTitleCase(str: string): string {
  if (!str) return str
  return str
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase())
}
