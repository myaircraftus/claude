import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

function resolveNextPath(request: NextRequest) {
  const next = request.nextUrl.searchParams.get('next')
  const redirect = request.nextUrl.searchParams.get('redirect')
  const candidate = next || redirect || '/dashboard'

  if (!candidate.startsWith('/')) {
    return '/dashboard'
  }

  return candidate
}

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin
  const code = request.nextUrl.searchParams.get('code')
  const nextPath = resolveNextPath(request)
  const redirectUrl = new URL(nextPath, origin)

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=auth_callback_failed', origin))
  }

  let response = NextResponse.redirect(redirectUrl)

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: Parameters<typeof response.cookies.set>[2] }>) {
          response = NextResponse.redirect(redirectUrl)
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (!error) {
    return response
  }

  console.error('auth_callback_failed', error)
  return NextResponse.redirect(new URL('/login?error=auth_callback_failed', origin))
}
