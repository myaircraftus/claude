const RESERVED_TOP_LEVEL_SEGMENTS = new Set([
  '',
  '_next',
  'api',
  'about',
  'admin',
  'aircraft',
  'app',
  'ask',
  'auth',
  'blog',
  'contact',
  'customers',
  'dashboard',
  'demo',
  'documents',
  'estimates',
  'features',
  'favicon.ico',
  'forgot-password',
  'history',
  'integrations',
  'invoices',
  'library',
  'logbook-scanning',
  'login',
  'maintenance',
  'marketplace',
  'mechanic',
  'my-aircraft',
  'onboarding',
  'owner',
  'parts',
  'pricing',
  'privacy',
  'reminders',
  'scanner',
  'scanning',
  'settings',
  'signin',
  'signup',
  'terms',
  'work-orders',
  'workspace',
])

export interface TenantPathMatch {
  slug: string
  rewrittenPathname: string
}

const TENANT_SCOPED_ROUTE_PREFIXES = [
  '/admin',
  '/aircraft',
  '/ask',
  '/customers',
  '/dashboard',
  '/documents',
  '/estimates',
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
  '/work-orders',
  '/workspace',
] as const

export function extractTenantPathname(pathname: string): TenantPathMatch | null {
  const normalized = pathname.trim()
  if (!normalized.startsWith('/')) return null

  const segments = normalized.split('/').filter(Boolean)
  if (segments.length === 0) return null

  const [candidate, ...rest] = segments
  const lowered = candidate.toLowerCase()

  if (
    RESERVED_TOP_LEVEL_SEGMENTS.has(lowered) ||
    lowered.includes('.') ||
    !/^[a-z0-9-]+$/.test(lowered)
  ) {
    return null
  }

  return {
    slug: lowered,
    rewrittenPathname: `/${rest.join('/') || 'dashboard'}`,
  }
}

export function isReservedTopLevelSegment(segment: string | null | undefined): boolean {
  if (!segment) return false
  return RESERVED_TOP_LEVEL_SEGMENTS.has(segment.toLowerCase())
}

export function getTenantSlugFromPathname(pathname: string | null | undefined): string | null {
  if (!pathname) return null
  return extractTenantPathname(pathname)?.slug ?? null
}

export function getEffectivePathname(pathname: string | null | undefined): string {
  if (!pathname) return '/'
  return extractTenantPathname(pathname)?.rewrittenPathname ?? pathname
}

export function isTenantScopedPath(pathname: string): boolean {
  return TENANT_SCOPED_ROUTE_PREFIXES.some((prefix) => {
    return pathname === prefix || pathname.startsWith(`${prefix}/`) || pathname.startsWith(`${prefix}?`) || pathname.startsWith(`${prefix}#`)
  })
}

export function withTenantPrefix<T extends string | { pathname?: string | null }>(
  href: T,
  tenantSlug: string | null | undefined
): T {
  if (!tenantSlug) return href

  if (typeof href === 'string') {
    if (!href.startsWith('/')) return href
    if (extractTenantPathname(href)) return href
    if (!isTenantScopedPath(href)) return href
    return `/${tenantSlug}${href}` as T
  }

  if (href && typeof href === 'object' && typeof href.pathname === 'string') {
    if (!href.pathname.startsWith('/')) return href
    if (extractTenantPathname(href.pathname)) return href
    if (!isTenantScopedPath(href.pathname)) return href
    return {
      ...href,
      pathname: `/${tenantSlug}${href.pathname}`,
    } as T
  }

  return href
}

export function isDemoPathname(pathname: string | null | undefined): boolean {
  if (!pathname) return false
  return pathname === '/demo' || pathname.startsWith('/demo/')
}

export function stripDemoPrefix(pathname: string | null | undefined): string {
  if (!pathname) return '/'
  if (!isDemoPathname(pathname)) return pathname
  if (pathname === '/demo' || pathname === '/demo/') return '/dashboard'
  const after = pathname.slice('/demo'.length)
  if (after === '/owner' || after.startsWith('/owner/') || after.startsWith('/owner?') || after.startsWith('/owner#')) {
    return '/dashboard' + after.slice('/owner'.length)
  }
  return after
}

export function getDisplayPathname(pathname: string | null | undefined): string {
  if (!pathname) return '/'
  if (isDemoPathname(pathname)) return stripDemoPrefix(pathname)
  return getEffectivePathname(pathname)
}

const DEMO_OWNER_PATH = '/demo/owner'
const DEMO_MECHANIC_PATH = '/demo/mechanic'

function pathStartsWithPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`) || path.startsWith(`${prefix}#`)
}

function applyDemoPrefix(path: string): string {
  if (!path.startsWith('/')) return path
  if (pathStartsWithPrefix(path, '/demo')) return path
  if (path === '/dashboard' || path.startsWith('/dashboard?') || path.startsWith('/dashboard#')) {
    return path.replace('/dashboard', DEMO_OWNER_PATH)
  }
  if (path === '/mechanic' || path.startsWith('/mechanic?') || path.startsWith('/mechanic#')) {
    return path.replace('/mechanic', DEMO_MECHANIC_PATH)
  }
  if (!isTenantScopedPath(path)) return path
  return `/demo${path}`
}

export function withDemoPrefix<T extends string | { pathname?: string | null }>(href: T): T {
  if (typeof href === 'string') {
    return applyDemoPrefix(href) as T
  }
  if (href && typeof href === 'object' && typeof href.pathname === 'string') {
    return {
      ...href,
      pathname: applyDemoPrefix(href.pathname),
    } as T
  }
  return href
}

export function withRoutePrefix<T extends string | { pathname?: string | null }>(
  href: T,
  ctx: { tenantSlug: string | null | undefined; demo: boolean }
): T {
  if (ctx.demo) return withDemoPrefix(href)
  return withTenantPrefix(href, ctx.tenantSlug)
}
