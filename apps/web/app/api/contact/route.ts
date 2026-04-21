import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/server'

/**
 * Public contact form endpoint.
 *
 * Accepts:   { name, email, company?, message, type?: 'sales' | 'support' | 'general' }
 * Returns:   { success: true }  (200)
 * Errors:    400 validation, 429 rate-limited, 500 database error.
 *
 * Writes to the `contact_submissions` table via the service-role client —
 * there is no authenticated user for this endpoint, so we bypass RLS.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Simple in-memory IP rate limiter: max 3 requests / 60 seconds per IP.
// For a multi-instance deployment this should be backed by Redis; for now the
// surface area is tiny (unauthenticated, marketing-only).
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 3
const hits = new Map<string, number[]>()

function getIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]!.trim()
  const real = req.headers.get('x-real-ip')
  if (real) return real
  return 'unknown'
}

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const history = hits.get(ip) ?? []
  const recent = history.filter((t) => now - t < RATE_LIMIT_WINDOW_MS)
  if (recent.length >= RATE_LIMIT_MAX) {
    hits.set(ip, recent)
    return true
  }
  recent.push(now)
  hits.set(ip, recent)
  return false
}

export async function POST(req: NextRequest) {
  const ip = getIp(req)
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again in a minute.' },
      { status: 429 }
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const b = body as Record<string, unknown>
  const name = typeof b?.name === 'string' ? b.name.trim() : ''
  const email = typeof b?.email === 'string' ? b.email.trim() : ''
  const company = typeof b?.company === 'string' ? b.company.trim() : ''
  const message = typeof b?.message === 'string' ? b.message.trim() : ''
  const typeRaw = typeof b?.type === 'string' ? b.type.trim() : 'general'

  if (!name) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Valid email is required' }, { status: 400 })
  }
  if (!message) {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 })
  }

  const type = ['sales', 'support', 'general'].includes(typeRaw) ? typeRaw : 'general'

  // Hard ceilings to prevent bloat — the DB has no length checks.
  if (name.length > 200 || email.length > 320 || company.length > 200 || message.length > 5000) {
    return NextResponse.json({ error: 'One or more fields exceed length limits' }, { status: 400 })
  }

  try {
    const supabase = createServiceSupabase()
    const { error } = await supabase.from('contact_submissions').insert({
      name,
      email,
      company: company || null,
      message,
      type,
      status: 'new',
      ip_address: ip,
    })

    if (error) {
      console.error('[contact] insert failed', error)
      return NextResponse.json({ error: 'Failed to submit message' }, { status: 500 })
    }
  } catch (err) {
    console.error('[contact] unexpected error', err)
    return NextResponse.json({ error: 'Failed to submit message' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
