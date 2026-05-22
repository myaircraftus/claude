import { notFound } from 'next/navigation'
import { readSop, listSops, splitIntoSections } from '@/lib/sop/parser'
import type { SopRecord } from '@/lib/sop/shared'
import { SopReaderClient } from './sop-reader-client'

export const dynamic = 'force-dynamic'

interface Props {
  params: { slug: string }
}

export async function generateMetadata({ params }: Props) {
  const sop = await readSop(params.slug)
  return {
    title: sop ? `${sop.frontmatter.title} | SOP Library` : 'SOP Library',
  }
}

/**
 * SOP reader page (Server Component shell).
 *
 * Loads the current SOP + the full sibling list (for the left nav), splits
 * the body into H2-bounded sections (rendered server-side), then hands
 * everything to the SopReaderClient which manages section state, keyboard
 * shortcuts, the print modes, and clipboard deep-linking.
 *
 * Section-only view: the reader shows ONE section at a time. The right
 * rail lets the user pick a section; the URL `#anchor` deep-links to one.
 * "Print whole SOP" renders every section concatenated with page breaks.
 */
export default async function SopDetailPage({ params }: Props) {
  const [sop, allSops] = await Promise.all([readSop(params.slug), listSops()])
  if (!sop) notFound()

  const sections = splitIntoSections(sop.body)
  const siblings = allSops.map((s: SopRecord) => ({
    slug: s.slug,
    order: s.frontmatter.order,
    title: s.frontmatter.title,
    module: s.frontmatter.module,
    status: s.frontmatter.status,
  }))

  const repo = process.env.NEXT_PUBLIC_GITHUB_REPO ?? ''
  const editHref = repo ? `${repo}/blob/main/docs/sop/${sop.slug}.md` : null

  return (
    <SopReaderClient
      slug={sop.slug}
      title={sop.frontmatter.title}
      module={sop.frontmatter.module}
      order={sop.frontmatter.order}
      version={sop.frontmatter.version}
      lastUpdated={sop.frontmatter.last_updated}
      status={sop.frontmatter.status}
      faaRefs={sop.frontmatter.faa_refs}
      sections={sections}
      siblings={siblings}
      editHref={editHref}
    />
  )
}
