import { NextRequest, NextResponse } from 'next/server'

type ChatPersona = 'owner' | 'mechanic'

function buildThreadTitle(content: string) {
  const compact = content.trim().replace(/\s+/g, ' ')
  if (compact.length <= 60) return compact
  return `${compact.slice(0, 57).trimEnd()}...`
}

function mapArtifact(artifact: any): { artifactType?: string; artifactData?: unknown } {
  if (!artifact || typeof artifact !== 'object') {
    return {}
  }

  if (artifact.type === 'logbook_draft') {
    return {
      artifactType: 'logbook_entry',
      artifactData: artifact.data ?? {},
    }
  }

  if (artifact.type === 'parts_results') {
    const results = Array.isArray(artifact.data?.results)
      ? artifact.data.results
      : Array.isArray(artifact.data)
      ? artifact.data
      : []

    return {
      artifactType: 'parts_search',
      artifactData: {
        query: typeof artifact.title === 'string' ? artifact.title.replace(/^Parts:\s*/i, '') : '',
        results,
      },
    }
  }

  return {}
}

export async function POST(req: NextRequest) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const content = String(body?.content ?? '').trim()
  if (!content) {
    return NextResponse.json({ error: 'content is required' }, { status: 400 })
  }

  const persona: ChatPersona = body?.persona === 'mechanic' ? 'mechanic' : 'owner'
  const askUrl = new URL('/api/ask', req.url)
  const res = await fetch(askUrl.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: req.headers.get('cookie') || '',
      'x-organization-id': req.headers.get('x-organization-id') || '',
      'x-organization-slug': req.headers.get('x-organization-slug') || '',
      'x-org-id': req.headers.get('x-org-id') || '',
      'x-org-slug': req.headers.get('x-org-slug') || '',
    },
    body: JSON.stringify({
      question: content,
      aircraft_id: body?.aircraftId ?? undefined,
      persona,
      conversation_history: Array.isArray(body?.conversationHistory) ? body.conversationHistory : [],
    }),
    cache: 'no-store',
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    return NextResponse.json(
      { error: data?.error || `Chat request failed (${res.status})` },
      { status: res.status }
    )
  }

  const primaryArtifact = Array.isArray(data?.artifacts) ? data.artifacts[0] : null
  const { artifactType, artifactData } = mapArtifact(primaryArtifact)

  return NextResponse.json({
    reply: data?.answer ?? '',
    intent: artifactType ?? 'query',
    artifactType,
    artifactData,
    threadId: body?.threadId ?? null,
    threadTitle: buildThreadTitle(content),
    citations: data?.citations ?? [],
    follow_up_questions: data?.follow_up_questions ?? [],
  })
}
