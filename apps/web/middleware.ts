import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { extractTenantPathname } from '@/lib/auth/tenant-routing'

export async function middleware(request: NextRequest) {
  const originalPathname = request.nextUrl.pathname
  const tenantMatch = extractTenantPathname(originalPathname)
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-request-pathname', originalPathname)
  let effectivePathname = originalPathname
  let effectiveUrl = request.nextUrl.clone()

  if (tenantMatch) {
    requestHeaders.set('x-organization-slug', tenantMatch.slug)
    effectivePathname = tenantMatch.rewrittenPathname
    effectiveUrl.pathname = tenantMatch.rewrittenPathname
  }

  const tenantCookieOptions = {
    path: '/',
    sameSite: 'lax' as const,
    httpOnly: false,
  }

  function createBaseResponse() {
    const response = tenantMatch
      ? NextResponse.rewrite(effectiveUrl, { request: { headers: requestHeaders } })
      : NextResponse.next({ request: { headers: requestHeaders } })

    if (tenantMatch) {
      response.cookies.set('active_organization_slug', tenantMatch.slug, tenantCookieOptions)
    }

    return response
  }

  let supabaseResponse = createBaseResponse()

  // @supabase/ssr v0.3.x uses get/set/remove (NOT getAll/setAll)
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: any) {
          request.cookies.set({ name, value, ...options })
          supabaseResponse = createBaseResponse()
          supabaseResponse.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: any) {
          request.cookies.set({ name, value: '', ...options })
          supabaseResponse = createBaseResponse()
          supabaseResponse.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Public vanity profile pages: /owner/{handle} and /mechanic/{handle}
  // (signed-in portal = exact /mechanic; onboarding stays protected)
  if (isPublicHandlePath(effectivePathname)) {
    return supabaseResponse
  }

  // Protect app routes
  if (effectivePathname.startsWith('/(app)') || isAppRoute(effectivePathname)) {
    if (!user) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      url.searchParams.set('redirect', tenantMatch ? originalPathname : effectivePathname)
      return NextResponse.redirect(url)
    }
  }

  // Redirect authenticated users away from auth pages unless explicitly previewing
  if (user && isAuthRoute(effectivePathname)) {
    const allowPreview = request.nextUrl.searchParams.get('preview') === '1'
    if (allowPreview) {
      return supabaseResponse
    }
    const destination = tenantMatch
      ? `/${tenantMatch.slug}/dashboard`
      : request.cookies.get('active_organization_slug')?.value
        ? `/${request.cookies.get('active_organization_slug')!.value}/dashboard`
        : '/dashboard'
    return NextResponse.redirect(new URL(destination, request.url))
  }

  return supabaseResponse
}

function isAppRoute(pathname: string): boolean {
  const appRoutes = [
    '/admin',
    '/aircraft',
    '/ask',
    '/customers',
    '/dashboard',
    '/documents',
    '/history',
    '/integrations',
    '/invoices',
    '/library',
    '/maintenance',
    '/marketplace',
    '/mechanic',
    '/my-aircraft',
    '/parts',
    '/reminders',
    '/scanner',
    '/settings',
    '/owner/onboarding',
    '/mechanic/onboarding',
    '/work-orders',
    '/workspace',
    '/onboarding',
  ]
  return appRoutes.some(route => pathname.startsWith(route))
}

function isAuthRoute(pathname: string): boolean {
  const authRoutes = ['/login', '/signin', '/signup', '/forgot-password']
  return authRoutes.some(route => pathname === route)
}

const HANDLE_RE = /^[a-z0-9][a-z0-9-]{2,31}$/

function isPublicHandlePath(pathname: string): boolean {
  const match = pathname.match(/^\/(owner|mechanic)\/([^/]+)\/?$/)
  if (!match) return false
  const handle = match[2].toLowerCase()
  if (handle === 'onboarding') return false
  return HANDLE_RE.test(handle)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
