import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function POST(req: NextRequest) {
  const { email, password } = await req.json()

  // We must set cookies on the response object directly —
  // cookies() from next/headers is read-only in Route Handlers
  let response = NextResponse.json({ ok: true })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll()
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
          // Update request cookies for subsequent calls
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value))
          // Rebuild response with Set-Cookie headers
          response = NextResponse.json({ ok: true })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 401 })
  }

  // Return the response that carries the Set-Cookie headers
  return response
}
