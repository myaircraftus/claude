// AI Part Resolution — uses GPT-4o to resolve plain English part descriptions
// into exact part numbers based on the specific aircraft context.
//
// Example: "oil filter" + Cessna 152 / Lycoming O-235
//   → { partNumbers: ["CH48110-1"], searchQuery: "CH48110-1 oil filter", ... }

import OpenAI from 'openai'

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

export interface AircraftContext {
  tailNumber: string
  make: string
  model: string
  year?: number | null
  serialNumber?: string | null
  engineMake?: string | null
  engineModel?: string | null
  engineSerial?: string | null
  propMake?: string | null
  propModel?: string | null
}

export interface PartResolution {
  /** Resolved part number(s), most likely first */
  partNumbers: string[]
  /** Optimized search query for vendor searches */
  searchQuery: string
  /** What the AI thinks the user is looking for */
  description: string
  /** The aircraft system this part belongs to */
  system: string
  /** Alternate/superseded part numbers */
  alternates: string[]
  /** Confidence: high if the AI is sure about the part number */
  confidence: 'high' | 'medium' | 'low'
  /** Brief explanation of how it resolved the part */
  reasoning: string
}

const SYSTEM_PROMPT = `You are an expert aviation parts specialist with deep knowledge of:
- General aviation aircraft (Cessna, Piper, Beechcraft, Mooney, Cirrus, etc.)
- Aircraft engines (Lycoming, Continental/TCM, Rotax, Pratt & Whitney)
- Propellers (Hartzell, McCauley, MT, Sensenich)
- Avionics (Garmin, Bendix King, Aspen, Avidyne)
- FAA PMA/TSO certified parts
- Aircraft parts catalogs, IPC (Illustrated Parts Catalogs), and parts manuals

Your job: Given a plain-English part description and a specific aircraft, resolve it to the EXACT part number(s) that would be correct for that specific aircraft, engine, and year.

IMPORTANT RULES:
1. Always consider the SPECIFIC engine model — a Cessna 172 with an O-320 uses different parts than one with an IO-360
2. Part numbers can be superseded — include the current/latest P/N first, then alternates
3. If you're not confident about the exact P/N, still provide your best guess and set confidence to "low"
4. For common consumables (oil filters, spark plugs, air filters, tires, etc.), you should know the exact P/Ns
5. Consider the aircraft year — older models may use different parts
6. The search query you generate will be used to search Google Shopping and eBay for this part

Common knowledge you should apply:
- Lycoming engines use Champion CH48110-1 (or equivalent) oil filters
- Continental engines use Champion CH48108-1 oil filters
- Most GA piston engines use Champion REM40E or REM38E spark plugs (massive electrode) or RHB32E fine-wire
- Cessna 150/152 uses Lycoming O-235 engine
- Cessna 172 Skyhawk typically uses Lycoming O-320 or IO-360
- Cessna 182 Skylane uses Lycoming O-470 or IO-540
- Piper Cherokee 140/160 uses Lycoming O-320
- Piper Warrior uses Lycoming O-320-D3G
- Beechcraft Bonanza uses Continental IO-520 or IO-550
- McCauley and Sensenich are common prop manufacturers for training aircraft

Respond ONLY with valid JSON matching this schema:
{
  "partNumbers": ["primary P/N", "alternate P/N if any"],
  "searchQuery": "optimized search string for Google Shopping",
  "description": "what this part is and why these P/Ns are correct",
  "system": "engine|airframe|propeller|avionics|electrical|landing_gear|fuel|other",
  "alternates": ["superseded or cross-reference P/Ns"],
  "confidence": "high|medium|low",
  "reasoning": "brief explanation of how you determined the P/N"
}`

export async function resolvePartWithAI(
  userQuery: string,
  aircraft: AircraftContext,
): Promise<PartResolution | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.warn('[ai-resolve] OPENAI_API_KEY not set, skipping AI resolution')
    return null
  }

  const openai = getOpenAI()
  const model = process.env.OPENAI_CHAT_MODEL ?? 'gpt-4o'

  // Build aircraft context string
  const acLines: string[] = []
  acLines.push(`Tail Number: ${aircraft.tailNumber}`)
  acLines.push(`Aircraft: ${aircraft.make} ${aircraft.model}`)
  if (aircraft.year) acLines.push(`Year: ${aircraft.year}`)
  if (aircraft.serialNumber) acLines.push(`Serial: ${aircraft.serialNumber}`)
  if (aircraft.engineMake || aircraft.engineModel) {
    acLines.push(`Engine: ${[aircraft.engineMake, aircraft.engineModel].filter(Boolean).join(' ')}`)
  }
  if (aircraft.engineSerial) acLines.push(`Engine Serial: ${aircraft.engineSerial}`)
  if (aircraft.propMake || aircraft.propModel) {
    acLines.push(`Propeller: ${[aircraft.propMake, aircraft.propModel].filter(Boolean).join(' ')}`)
  }

  const userMessage = `Aircraft Details:
${acLines.join('\n')}

Part requested: "${userQuery}"

Resolve this to the exact part number(s) for this specific aircraft. If the aircraft make/model is listed as "Unknown", use any other available context (engine model, year, etc.) to determine the correct parts. Generate an optimized search query that will find this exact part on Google Shopping and eBay.`

  try {
    const start = Date.now()
    const completion = await openai.chat.completions.create({
      model,
      temperature: 0.1,
      max_tokens: 500,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
    })

    const raw = completion.choices[0]?.message?.content
    if (!raw) {
      console.error('[ai-resolve] Empty response from OpenAI')
      return null
    }

    const parsed = JSON.parse(raw)
    const elapsed = Date.now() - start
    console.log(`[ai-resolve] "${userQuery}" → ${JSON.stringify(parsed.partNumbers)} (${parsed.confidence}, ${elapsed}ms)`)

    return {
      partNumbers: Array.isArray(parsed.partNumbers) ? parsed.partNumbers : [],
      searchQuery: typeof parsed.searchQuery === 'string' ? parsed.searchQuery : userQuery,
      description: parsed.description ?? '',
      system: parsed.system ?? 'other',
      alternates: Array.isArray(parsed.alternates) ? parsed.alternates : [],
      confidence: ['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'low',
      reasoning: parsed.reasoning ?? '',
    }
  } catch (err: any) {
    console.error('[ai-resolve] Error:', err?.message)
    return null
  }
}
