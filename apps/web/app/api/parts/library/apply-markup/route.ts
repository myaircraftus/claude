// POST /api/parts/library/apply-markup — pure calculation, no DB write
// Body: { base_price, markup_mode, markup_percent, custom_rate }
// Returns: { sell_price, markup_amount }

import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const basePrice = body.base_price != null ? Number(body.base_price) : null
  const markupMode = body.markup_mode ?? 'none'
  const markupPercent = body.markup_percent != null ? Number(body.markup_percent) : 0
  const customRate = body.custom_rate != null ? Number(body.custom_rate) : null

  if (basePrice == null || isNaN(basePrice)) {
    return NextResponse.json({ sell_price: null, markup_amount: null })
  }

  let sellPrice: number
  let markupAmount: number

  switch (markupMode) {
    case 'percent': {
      const markup = basePrice * (markupPercent / 100)
      sellPrice = Math.round((basePrice + markup) * 100) / 100
      markupAmount = Math.round(markup * 100) / 100
      break
    }
    case 'custom_rate': {
      sellPrice = customRate != null ? Math.round(customRate * 100) / 100 : basePrice
      markupAmount = Math.round((sellPrice - basePrice) * 100) / 100
      break
    }
    default:
      sellPrice = basePrice
      markupAmount = 0
  }

  return NextResponse.json({ sell_price: sellPrice, markup_amount: markupAmount })
}
