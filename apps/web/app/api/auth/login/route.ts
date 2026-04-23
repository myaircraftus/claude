import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const CHUNK_SIZE = 3180

function getProjectRef(supabaseUrl: string) {
  try {
    return new URL(supabaseUrl).hostname.split('.')[0] || 'supabase'
  } catch {
    return 'supabase'
  }
}

export async function POST(req: NextRequest) {
  const { email, password } = await req.json()
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const projectRef = getProjectRef(supabaseUrl)

  // Use plain JS client — no SSR complexity
  const supabase = createClient(
    supabaseUrl,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error || !data.session) {
    return NextResponse.json({ error: error?.message ?? 'Login failed' }, { status: 401 })
  }

  const session = data.session
  const cookieName = `sb-${projectRef}-auth-token`
  const sessionStr = JSON.stringify(session)

  const response = NextResponse.json({ ok: true })

  const cookieOpts = {
    path: '/',
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    maxAge: session.expires_in,
  }

  // @supabase/ssr chunks large values — replicate that logic
  if (sessionStr.length <= CHUNK_SIZE) {
    response.cookies.set(cookieName, sessionStr, cookieOpts)
  } else {
    const chunks = []
    for (let i = 0; i < sessionStr.length; i += CHUNK_SIZE) {
      chunks.push(sessionStr.slice(i, i + CHUNK_SIZE))
    }
    response.cookies.set(cookieName, `chunks-${chunks.length}`, cookieOpts)
    chunks.forEach((chunk, i) => {
      response.cookies.set(`${cookieName}.${i}`, chunk, cookieOpts)
    })
  }

  return response
}
