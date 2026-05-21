import { listSops } from '@/lib/sop/parser'
import { buildSearchIndex } from '@/lib/sop/search'
import { SopLibraryClient } from './sop-library-client'

export const dynamic = 'force-dynamic'

/**
 * Server component: read the 9 SOPs at request time and hand the
 * shaped list to the client component for search + render.
 *
 * `dynamic = 'force-dynamic'` keeps us off the build-time static cache
 * so a doc edit shows up on the next page hit without a redeploy.
 */
export default async function SopLibraryIndex() {
  const sops = await listSops()
  const list = sops.map((s) => ({
    slug: s.slug,
    title: s.frontmatter.title,
    module: s.frontmatter.module,
    order: s.frontmatter.order,
    faaRefs: s.frontmatter.faa_refs,
    version: s.frontmatter.version,
    lastUpdated: s.frontmatter.last_updated,
    status: s.frontmatter.status,
    excerpt: s.excerpt,
  }))
  const searchIndex = buildSearchIndex(sops)
  return <SopLibraryClient sops={list} searchIndex={searchIndex} />
}
