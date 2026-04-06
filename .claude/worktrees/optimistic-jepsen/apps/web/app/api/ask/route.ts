// Thin wrapper over /api/query for the AI chat page
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { question, aircraftId } = await req.json()
    // Forward to the full query endpoint
    const url = new URL('/api/query', req.url)
    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: req.headers.get('cookie') || '' },
      body: JSON.stringify({
        question,
        aircraft_id: aircraftId,
        doc_type_filter: [],
        include_citations: true,
      }),
    })
    const data = await res.json()
    // Normalize to { answer, citations }
    return NextResponse.json({
      answer: data.answer || data.error || 'No answer generated.',
      citations: (data.citations || []).map((c: any) => ({
        docName: c.doc_name || c.docName || 'Document',
        docType: c.doc_type || c.docType || 'miscellaneous',
        section: c.section_title || c.section || '',
        pageNumber: c.page_number || c.pageNumber || 1,
        snippet: c.snippet || c.chunk_text?.slice(0, 200) || '',
        confidence: c.confidence || 'medium',
      })),
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
