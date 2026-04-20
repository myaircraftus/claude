// Thin wrapper over /api/query for the AI chat page
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const {
      question,
      aircraftId,
      aircraft_id,
      doc_type_filter,
      conversation_history,
    } = await req.json()

    const url = new URL('/api/query', req.url)
    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: req.headers.get('cookie') || '' },
      body: JSON.stringify({
        question,
        aircraft_id: aircraft_id ?? aircraftId,
        doc_type_filter: doc_type_filter ?? [],
        conversation_history,
      }),
    })

    const data = await res.json()

    return NextResponse.json(data, { status: res.status })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
