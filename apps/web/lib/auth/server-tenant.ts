import { headers } from 'next/headers'
import { withTenantPrefix } from '@/lib/auth/tenant-routing'

export function getServerTenantSlug(): string | null {
  return (
    headers().get('x-organization-slug') ||
    headers().get('x-org-slug') ||
    null
  )
}

export function tenantAppHref<T extends string | { pathname?: string | null }>(href: T): T {
  return withTenantPrefix(href, getServerTenantSlug())
}
