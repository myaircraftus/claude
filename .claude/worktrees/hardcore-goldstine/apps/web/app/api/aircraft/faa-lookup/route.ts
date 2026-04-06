import { NextRequest, NextResponse } from 'next/server'

// FAA Aircraft Registry lookup — scrapes the public HTML registry page
// URL: https://registry.faa.gov/aircraftinquiry/Search/NNumberResult?NNumberTxt=<number_without_N>

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
  reg_status?: string
  cert_issued?: string
  registrant_name?: string
  registrant_location?: string
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const tail = searchParams.get('tail')?.toUpperCase().replace(/^N/, '')

  if (!tail) {
    return NextResponse.json({ error: 'tail number required' }, { status: 400 })
  }

  const nNumber = `N${tail}`

  try {
    // FAA HTML registry — NNumberTxt does NOT include the "N" prefix
    const url = `https://registry.faa.gov/aircraftinquiry/Search/NNumberResult?NNumberTxt=${encodeURIComponent(tail)}`

    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
      },
      signal: AbortSignal.timeout(12000),
    })

    if (!resp.ok) {
      return NextResponse.json({ error: 'Aircraft not found in FAA Registry' }, { status: 404 })
    }

    const html = await resp.text()

    // If FAA says not found
    if (
      html.toLowerCase().includes('no aircraft found') ||
      html.toLowerCase().includes('invalid n-number') ||
      !html.includes('data-label')
    ) {
      return NextResponse.json({ error: 'Aircraft not found in FAA Registry' }, { status: 404 })
    }

    // Parse all data-label="<Label>">Value< pairs from the responsive table
    const fields: Record<string, string> = {}

    // Primary pattern: <td data-label="Make">CESSNA</td>
    // Allow multiline content — FAA often puts value on next line after the tag
    const tdPattern = /data-label="([^"]+)"[^>]*>([\s\S]*?)<\/td>/gi
    let m: RegExpExecArray | null
    while ((m = tdPattern.exec(html)) !== null) {
      const label = m[1].trim()
      // Strip inner tags and collapse whitespace
      const value = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
      if (label && value && value !== '&nbsp;' && value !== '-' && value.length < 200) {
        fields[label] = value
      }
    }

    // Also extract from th/td table pairs as fallback
    // Some FAA pages use <th scope="row">Label</th><td>Value</td>
    const thTdPattern = /<th[^>]*scope="row"[^>]*>([\s\S]*?)<\/th>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/gi
    while ((m = thTdPattern.exec(html)) !== null) {
      const label = m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
      const value = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
      if (label && value && !fields[label] && value.length < 200) {
        fields[label] = value
      }
    }

    // Map FAA field names to our data model
    const make = (
      fields['Make'] ||
      fields['Mfr'] ||
      fields['Manufacturer'] ||
      ''
    ).trim()

    const model = (
      fields['Model'] ||
      fields['Model/Series'] ||
      ''
    ).trim()

    if (!make && !model) {
      return NextResponse.json({ error: 'Aircraft not found in FAA Registry' }, { status: 404 })
    }

    // Year
    let year: number | undefined
    const yearRaw = fields['Year Mfr'] || fields['Year'] || fields['Mfr Year'] || ''
    if (yearRaw) {
      const parsed = parseInt(yearRaw, 10)
      if (!isNaN(parsed) && parsed > 1900 && parsed <= new Date().getFullYear() + 2) {
        year = parsed
      }
    }

    // Serial
    const serial = (fields['Serial Number'] || fields['S/N'] || fields['Serial No'] || '').trim()

    // Engine
    const engineMake = (
      fields['Engine Make'] ||
      fields['Engine Manufacturer'] ||
      fields['Eng Mfr'] ||
      ''
    ).trim()

    const engineModel = (
      fields['Engine Model'] ||
      fields['Eng Model'] ||
      ''
    ).trim()

    // Aircraft / engine type
    const aircraftType = (fields['Aircraft Type'] || fields['Type Aircraft'] || '').trim()
    const engineType = (fields['Engine Type'] || fields['Type Engine'] || '').trim()

    // Registration status
    const regStatus = (
      fields['Status'] ||
      fields['Reg. Status'] ||
      fields['Certification'] ||
      fields['Certificate Status'] ||
      ''
    ).trim()

    const certIssued = (
      fields['Cert. Issue Date'] ||
      fields['Cert Issue Date'] ||
      fields['Certificate Issue Date'] ||
      ''
    ).trim()

    // Registrant
    const registrantName = (
      fields['Name'] ||
      fields['Registrant'] ||
      fields['Owner'] ||
      ''
    ).trim()

    // Location
    const city = (fields['City'] || '').trim()
    const state = (fields['State'] || '').trim()
    const location = city && state ? `${city}, ${state}` : (city || state || '').trim()

    const result: FAALookupResult = {
      tail_number: nNumber,
      make,
      model,
      year,
      serial_number: serial || undefined,
      engine_make: engineMake || undefined,
      engine_model: engineModel || undefined,
      aircraft_type: aircraftType || undefined,
      engine_type: engineType || undefined,
      reg_status: regStatus || undefined,
      cert_issued: certIssued || undefined,
      registrant_name: registrantName || undefined,
      registrant_location: location || undefined,
    }

    return NextResponse.json(result)
  } catch (err: any) {
    console.error('[faa-lookup] error:', err?.message)
    return NextResponse.json(
      { error: 'FAA Registry unavailable. Please enter details manually.' },
      { status: 503 }
    )
  }
}
