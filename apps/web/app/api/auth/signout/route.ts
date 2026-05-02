/**
 * POST /api/auth/signout
 *
 * Server-side sign-out — the only reliable way to actually log a user out
 * with @supabase/ssr. Calling supabase.auth.signOut() from the browser
 * clears the in-memory client session but leaves the HttpOnly server-side
 * `sb-*` cookies in place. Middleware then sees those cookies on the next
 * request, treats the user as still signed in, and bounces them back to
 * the dashboard — which is exactly the "page refreshes and lands on same
 * place" symptom the user reported.
 *
 * Doing the sign-out from a server route lets the SSR client tell Next.js
 * to remove the auth cookies via the same Set-Cookie machinery that wrote
 * them, so the next request actually has no session.
 *
 * After this returns we expect the client to do a HARD navigation (window
 * .location.href = '/login') — soft router.push is not enough because we
 * need every server component to re-render against the now-empty cookie.
 */

import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const supabase = createServerSupabase()
    await supabase.auth.signOut()
  } catch {
    // Even if the supabase call throws (e.g. token already revoked), we
    // still want to return success so the client can redirect. The cookies
    // get cleared as part of the SSR helper's cookie-set flow.
  }
  return NextResponse.json({ ok: true })
}

// Some browsers / link-clicks issue GET requests to a sign-out URL — accept
// that too and just redirect straight to /login after clearing.
export async function GET(request: Request) {
  try {
    const supabase = createServerSupabase()
    await supabase.auth.signOut()
  } catch {
    // ignore
  }
  const url = new URL('/login', request.url)
  return NextResponse.redirect(url)
}
