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
