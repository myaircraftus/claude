import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ExternalLink, Pencil, ShieldCheck, Sparkles } from 'lucide-react'
import { readSop, renderMarkdown, extractToc } from '@/lib/sop/parser'
import { SopPrintButton } from '../print-button'

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

export default async function SopDetailPage({ params }: Props) {
  const sop = await readSop(params.slug)
  if (!sop) notFound()

  const html = renderMarkdown(sop.body)
  const toc = extractToc(sop.body)
  const repo = process.env.NEXT_PUBLIC_GITHUB_REPO ?? ''
  const editHref = repo ? `${repo}/blob/main/docs/sop/${sop.slug}.md` : null

  return (
    <div className="max-w-7xl mx-auto px-6 py-6">
      {/* Top action bar */}
      <div className="flex items-center justify-between mb-6">
        <Link
          href="/sop-library"
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Library
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href="/sop-library/simulator"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-200 hover:text-white bg-violet-500/15 hover:bg-violet-500/25 border border-violet-500/30 rounded-md px-3 py-1.5 transition-colors"
          >
            <Sparkles className="w-3 h-3" />
            AI Simulator
          </Link>
          <SopPrintButton />
          {editHref && (
            <a
              href={editHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-slate-300 hover:text-white bg-slate-800/60 hover:bg-slate-800 border border-slate-700 rounded-md px-3 py-1.5 transition-colors"
            >
              <Pencil className="w-3 h-3" />
              Edit in GitHub
              <ExternalLink className="w-2.5 h-2.5 opacity-60" />
            </a>
          )}
        </div>
      </div>

      <header className="mb-6 pb-5 border-b border-slate-800">
        <div className="text-[10px] uppercase tracking-[0.15em] text-slate-500 font-semibold mb-1.5">
          § {String(sop.frontmatter.order).padStart(2, '0')} · {sop.frontmatter.module}
        </div>
        <h1 className="text-3xl font-semibold text-white tracking-tight mb-3">
          {sop.frontmatter.title}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          {sop.frontmatter.faa_refs.map((ref) => (
            <a
              key={ref}
              href="https://www.ecfr.gov/current/title-14"
              target="_blank"
              rel="noopener noreferrer"
              title={`Look up ${ref} on eCFR`}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-200 bg-slate-800/60 hover:bg-slate-800 border border-slate-700 rounded px-2 py-0.5 transition-colors"
            >
              {ref}
              <ExternalLink className="w-2.5 h-2.5 opacity-60" />
            </a>
          ))}
          <span className="ml-2 text-[10px] text-slate-500">
            v{sop.frontmatter.version} · last updated {sop.frontmatter.last_updated}
          </span>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-8">
        {/* Sticky TOC */}
        <aside className="hidden lg:block">
          <div className="sticky top-4">
            <div className="text-[10px] uppercase tracking-[0.15em] text-slate-500 font-semibold mb-2">
              On this page
            </div>
            <nav>
              <ul className="space-y-1">
                {toc.map((entry) => (
                  <li key={entry.id}>
                    <a
                      href={`#${entry.id}`}
                      className={`block text-xs leading-relaxed text-slate-400 hover:text-white transition-colors ${
                        entry.level === 3 ? 'pl-3' : ''
                      }`}
                    >
                      {entry.text}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </aside>

        {/* Article body */}
        <article
          id="sop-article"
          className="sop-prose prose prose-invert prose-slate max-w-none prose-headings:scroll-mt-24 prose-headings:tracking-tight prose-h1:hidden prose-a:text-sky-400 prose-code:text-amber-300 prose-code:bg-slate-800/60 prose-code:px-1 prose-code:rounded prose-pre:bg-slate-900 prose-pre:border prose-pre:border-slate-800"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  )
}
