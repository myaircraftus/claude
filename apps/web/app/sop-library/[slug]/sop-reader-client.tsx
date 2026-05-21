'use client'

/**
 * SOP reader (client) — section-only view, three-column layout, white theme.
 *
 * Why a client component: the reader holds significant interactive state —
 * which section is currently selected, syncing that with the URL hash,
 * showing/hiding the mobile drawer for the sibling-SOP nav, and copying
 * section deep-links to the clipboard. All of that lives client-side.
 *
 * The server passes everything pre-rendered (sections as HTML strings)
 * so there's zero markdown rendering on the client.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Pencil,
  ExternalLink,
  Sparkles,
  Printer,
  Link2,
  Check,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  ShieldCheck,
} from 'lucide-react'
import type { SopSection } from '@/lib/sop/parser'
import { MermaidClient } from '@/components/sop/MermaidClient'

interface Sibling {
  slug: string
  order: number
  title: string
  module: string
  status: 'active' | 'draft' | 'deprecated'
}

interface Props {
  slug: string
  title: string
  module: string
  order: number
  version: string
  lastUpdated: string
  status: 'active' | 'draft' | 'deprecated'
  faaRefs: string[]
  sections: SopSection[]
  siblings: Sibling[]
  editHref: string | null
}

export function SopReaderClient({
  slug,
  title,
  module,
  order,
  version,
  lastUpdated,
  status,
  faaRefs,
  sections,
  siblings,
  editHref,
}: Props) {
  const [sectionId, setSectionId] = useState<string>(() =>
    sections[0]?.id ?? 'overview',
  )
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [printAll, setPrintAll] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const articleRef = useRef<HTMLDivElement>(null)

  // Hash-based deep-linking. On mount, pick up `#section-id`; on changes,
  // update the hash without adding to history (replaceState).
  useEffect(() => {
    if (typeof window === 'undefined') return
    const hash = window.location.hash.replace(/^#/, '')
    if (hash && sections.some((s) => s.id === hash)) {
      setSectionId(hash)
    }
    const onHash = () => {
      const h = window.location.hash.replace(/^#/, '')
      if (h && sections.some((s) => s.id === h)) {
        setSectionId(h)
      }
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [sections])

  const navigateToSection = useCallback(
    (id: string) => {
      setSectionId(id)
      setMobileNavOpen(false)
      if (typeof window !== 'undefined') {
        history.replaceState(null, '', `#${id}`)
      }
      // Scroll the article to the top whenever we change section —
      // explicit per the user's "don't scroll the whole doc" requirement.
      requestAnimationFrame(() => {
        articleRef.current?.scrollTo?.({ top: 0, behavior: 'instant' as ScrollBehavior })
        window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
      })
    },
    [],
  )

  const currentIdx = useMemo(
    () => sections.findIndex((s) => s.id === sectionId),
    [sections, sectionId],
  )
  const currentSection = sections[currentIdx] ?? sections[0]
  const prevSection = sections[currentIdx - 1] ?? null
  const nextSection = sections[currentIdx + 1] ?? null

  const copyDeepLink = useCallback(() => {
    if (typeof window === 'undefined') return
    const url = `${window.location.origin}${window.location.pathname}#${currentSection.id}`
    try {
      void navigator.clipboard.writeText(url)
      setCopiedLink(true)
      setTimeout(() => setCopiedLink(false), 1500)
    } catch {
      // Clipboard blocked — silently no-op
    }
  }, [currentSection])

  const printSection = useCallback(() => {
    setPrintAll(false)
    setTimeout(() => window.print(), 50)
  }, [])
  const printAllSections = useCallback(() => {
    setPrintAll(true)
    setTimeout(() => {
      window.print()
      // After the print dialog closes, reset
      setTimeout(() => setPrintAll(false), 300)
    }, 50)
  }, [])

  // Keyboard shortcuts: J / K to move sections (vim-style),
  // [ / ] also work (arrow keys conflict with text inputs)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement)?.matches?.('input,textarea,[contenteditable=true]')) return
      if (e.key === 'j' || e.key === ']') {
        e.preventDefault()
        if (nextSection) navigateToSection(nextSection.id)
      } else if (e.key === 'k' || e.key === '[') {
        e.preventDefault()
        if (prevSection) navigateToSection(prevSection.id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [nextSection, prevSection, navigateToSection])

  const printedAt = new Date()

  return (
    <div className="bg-white min-h-screen text-slate-900">
      {/* Print-only letterhead block — hidden on screen, visible on print */}
      <div className="hidden print:block print-letterhead">
        <div className="text-[10px] uppercase tracking-[0.3em] text-slate-500 font-semibold">
          myaircraft.us
        </div>
        <div className="text-2xl font-semibold mt-1">{title}</div>
        <div className="text-xs text-slate-600 mt-1">
          SOP-{String(order).padStart(2, '0')} · v{version} · last reviewed {lastUpdated} · status: {status}
        </div>
        <div className="text-[10px] text-slate-500 mt-2">
          Printed {printedAt.toLocaleString()} · INTERNAL DOCUMENT — NOT FOR PUBLIC DISTRIBUTION
        </div>
        <hr className="my-4 border-slate-300" />
      </div>

      {/* Top action bar (hidden on print) */}
      <div className="print:hidden border-b border-slate-200 bg-white sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 lg:px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen((o) => !o)}
              className="lg:hidden p-1.5 -ml-1 rounded-md hover:bg-slate-100 text-slate-600"
              aria-label="Toggle module navigation"
            >
              {mobileNavOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
            <Link
              href="/sop-library"
              className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Library
            </Link>
            <span className="text-slate-300">/</span>
            <span className="text-xs font-medium text-slate-700 truncate">{title}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/sop-library/simulator"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-700 hover:text-violet-900 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded-md px-2.5 py-1.5 transition-colors"
            >
              <Sparkles className="w-3 h-3" />
              Simulator
            </Link>
            <button
              type="button"
              onClick={copyDeepLink}
              className="inline-flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-300 rounded-md px-2.5 py-1.5 transition-colors"
              title="Copy link to this section"
            >
              {copiedLink ? <Check className="w-3 h-3 text-emerald-600" /> : <Link2 className="w-3 h-3" />}
              {copiedLink ? 'Copied' : 'Copy link'}
            </button>
            <PrintMenu onSection={printSection} onAll={printAllSections} />
            {editHref && (
              <a
                href={editHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-300 rounded-md px-2.5 py-1.5 transition-colors"
              >
                <Pencil className="w-3 h-3" />
                Edit
                <ExternalLink className="w-2.5 h-2.5 opacity-60" />
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Header strip with SOP metadata */}
      <header className="max-w-7xl mx-auto px-4 lg:px-6 pt-6 pb-5 border-b border-slate-200 print:hidden">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] uppercase tracking-[0.15em] text-slate-500 font-semibold">
            § {String(order).padStart(2, '0')} · {module}
          </span>
          <StatusBadge status={status} />
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900 mb-3">
          {title}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          {faaRefs.map((ref) => (
            <a
              key={ref}
              href={ecfrUrlFor(ref)}
              target="_blank"
              rel="noopener noreferrer"
              title={`Look up ${ref} on eCFR`}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded px-2 py-0.5 transition-colors"
            >
              {ref}
              <ExternalLink className="w-2.5 h-2.5 opacity-60" />
            </a>
          ))}
          <span className="ml-2 text-[10px] text-slate-500">
            v{version} · last updated {lastUpdated}
          </span>
        </div>
      </header>

      {/* Three-column body */}
      <div className="max-w-7xl mx-auto px-4 lg:px-6 py-6 grid grid-cols-1 lg:grid-cols-[240px_1fr_240px] gap-6 lg:gap-8 print:block print:px-0 print:py-0">
        {/* Left — sibling SOPs */}
        <aside
          className={`${mobileNavOpen ? 'block' : 'hidden'} lg:block print:hidden`}
        >
          <div className="lg:sticky lg:top-20">
            <div className="text-[10px] uppercase tracking-[0.15em] text-slate-500 font-semibold mb-2 px-2">
              Library
            </div>
            <nav>
              <ul className="space-y-0.5">
                {siblings.map((sib) => (
                  <li key={sib.slug}>
                    <Link
                      href={`/sop-library/${sib.slug}`}
                      className={`block text-[12px] leading-snug px-2 py-1.5 rounded transition-colors ${
                        sib.slug === slug
                          ? 'bg-violet-50 text-violet-900 font-semibold border border-violet-200'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold shrink-0">
                          {String(sib.order).padStart(2, '0')}
                        </span>
                        <span className="truncate">{sib.title}</span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </aside>

        {/* Center — section content */}
        <div className="min-w-0">
          {/* Section title strip */}
          <div className="mb-4 pb-3 border-b border-slate-200 flex items-start justify-between gap-3 print:hidden">
            <div>
              <div className="text-[10px] uppercase tracking-[0.15em] text-slate-500 font-semibold mb-1">
                Section {currentIdx >= 0 ? currentIdx + 1 : 1} of {sections.length}
              </div>
              <h2 className="text-xl font-semibold text-slate-900">
                {currentSection?.title}
              </h2>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => prevSection && navigateToSection(prevSection.id)}
                disabled={!prevSection}
                className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 disabled:text-slate-300 disabled:cursor-not-allowed bg-white hover:bg-slate-50 disabled:hover:bg-white border border-slate-200 rounded-md px-2 py-1 transition-colors"
                aria-label="Previous section"
              >
                <ChevronLeft className="w-3 h-3" />
                Prev
              </button>
              <button
                type="button"
                onClick={() => nextSection && navigateToSection(nextSection.id)}
                disabled={!nextSection}
                className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 disabled:text-slate-300 disabled:cursor-not-allowed bg-white hover:bg-slate-50 disabled:hover:bg-white border border-slate-200 rounded-md px-2 py-1 transition-colors"
                aria-label="Next section"
              >
                Next
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Article body (only the selected section, unless printing-all) */}
          <article
            ref={articleRef}
            id="sop-article"
            className="sop-prose prose prose-slate prose-headings:scroll-mt-24 prose-headings:tracking-tight prose-h1:hidden prose-h2:text-2xl prose-h2:mt-0 prose-h2:mb-4 prose-h3:text-base prose-h3:mt-6 prose-a:text-violet-700 hover:prose-a:text-violet-800 prose-code:text-orange-700 prose-code:bg-orange-50 prose-code:px-1 prose-code:rounded prose-code:font-medium prose-code:before:content-none prose-code:after:content-none prose-pre:bg-slate-50 prose-pre:border prose-pre:border-slate-200 prose-pre:text-slate-800 prose-table:text-sm prose-th:border prose-th:border-slate-200 prose-th:bg-slate-50 prose-th:px-2 prose-th:py-1.5 prose-th:font-semibold prose-th:text-slate-700 prose-td:border prose-td:border-slate-200 prose-td:px-2 prose-td:py-1.5 prose-blockquote:border-l-4 prose-blockquote:border-violet-300 prose-blockquote:bg-violet-50/40 prose-blockquote:pl-4 prose-blockquote:py-1 prose-blockquote:text-slate-700 prose-blockquote:not-italic prose-strong:text-slate-900 max-w-none"
          >
            {printAll ? (
              // Print-all mode: every section concatenated with a page break
              // between H2s.
              sections.map((s, i) => (
                <section
                  key={s.id}
                  className={i > 0 ? 'print:break-before-page' : ''}
                  dangerouslySetInnerHTML={{ __html: s.html }}
                />
              ))
            ) : (
              <section dangerouslySetInnerHTML={{ __html: currentSection?.html ?? '' }} />
            )}
          </article>

          {/* Section pagination footer */}
          {!printAll && (
            <div className="mt-8 pt-5 border-t border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-3 print:hidden">
              {prevSection ? (
                <button
                  type="button"
                  onClick={() => navigateToSection(prevSection.id)}
                  className="text-left rounded-lg border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 transition-colors p-4"
                >
                  <div className="text-[10px] uppercase tracking-[0.15em] text-slate-500 font-semibold mb-1 flex items-center gap-1">
                    <ChevronLeft className="w-3 h-3" /> Previous
                  </div>
                  <div className="text-sm font-medium text-slate-900 truncate">
                    {prevSection.title}
                  </div>
                </button>
              ) : (
                <div />
              )}
              {nextSection ? (
                <button
                  type="button"
                  onClick={() => navigateToSection(nextSection.id)}
                  className="text-right rounded-lg border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 transition-colors p-4"
                >
                  <div className="text-[10px] uppercase tracking-[0.15em] text-slate-500 font-semibold mb-1 flex items-center justify-end gap-1">
                    Next <ChevronRight className="w-3 h-3" />
                  </div>
                  <div className="text-sm font-medium text-slate-900 truncate">
                    {nextSection.title}
                  </div>
                </button>
              ) : (
                <div />
              )}
            </div>
          )}

          {/* Mermaid hydration — only runs when the current section has a
              diagram. Re-keyed on section change so each switch re-runs
              the walker against the freshly-mounted DOM. */}
          {(printAll
            ? sections.some((s) => s.hasMermaid)
            : currentSection?.hasMermaid) && (
            <MermaidClient
              key={printAll ? 'all' : currentSection.id}
              articleId="sop-article"
            />
          )}
        </div>

        {/* Right — section TOC for THIS doc */}
        <aside className="hidden lg:block print:hidden">
          <div className="sticky top-20">
            <div className="text-[10px] uppercase tracking-[0.15em] text-slate-500 font-semibold mb-2">
              Sections
            </div>
            <nav>
              <ul className="space-y-0.5">
                {sections.map((s, i) => {
                  const active = s.id === sectionId
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => navigateToSection(s.id)}
                        className={`w-full text-left text-[12px] leading-snug px-2 py-1.5 rounded transition-colors ${
                          active
                            ? 'bg-violet-50 text-violet-900 font-semibold border border-violet-200'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-400 font-semibold shrink-0">
                            {i + 1}
                          </span>
                          <span className="line-clamp-2">{s.title}</span>
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </nav>
          </div>
        </aside>
      </div>

      {/* Footer compliance + print footer */}
      <div className="hidden print:block print-footer">
        <hr className="my-4 border-slate-300" />
        <div className="text-[9px] text-slate-500 text-center">
          myaircraft.us · SOP-{String(order).padStart(2, '0')} · v{version} · INTERNAL DOCUMENT — NOT FOR PUBLIC DISTRIBUTION
        </div>
      </div>
    </div>
  )
}

// Map "14 CFR 43.9" → eCFR section URL. Falls back to title-14 root.
function ecfrUrlFor(ref: string): string {
  // Match "14 CFR 43.9", "14 CFR §43.9", "14 CFR 91.417(b)"
  const m = ref.match(/^14\s*CFR\s*§?\s*(\d+)\.(\d+)/i)
  if (!m) return 'https://www.ecfr.gov/current/title-14'
  const part = m[1]
  const section = m[2]
  return `https://www.ecfr.gov/current/title-14/chapter-I/subchapter-C/part-${part}/section-${part}.${section}`
}

function StatusBadge({ status }: { status: 'active' | 'draft' | 'deprecated' }) {
  const styles = {
    active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    draft: 'bg-amber-50 text-amber-700 border-amber-200',
    deprecated: 'bg-rose-50 text-rose-700 border-rose-200',
  }[status]
  return (
    <span
      className={`text-[9px] uppercase font-semibold tracking-wider rounded border px-1.5 py-0.5 ${styles}`}
    >
      {status}
    </span>
  )
}

function PrintMenu({
  onSection,
  onAll,
}: {
  onSection: () => void
  onAll: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-300 rounded-md px-2.5 py-1.5 transition-colors"
      >
        <Printer className="w-3 h-3" />
        Print
      </button>
      {open && (
        <div
          className="absolute right-0 mt-1 w-44 rounded-md border border-slate-200 bg-white shadow-lg overflow-hidden z-40"
          onMouseLeave={() => setOpen(false)}
        >
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              onSection()
            }}
            className="w-full text-left text-xs text-slate-700 hover:bg-slate-50 px-3 py-2 border-b border-slate-100"
          >
            Print this section
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              onAll()
            }}
            className="w-full text-left text-xs text-slate-700 hover:bg-slate-50 px-3 py-2"
          >
            Print whole SOP
          </button>
        </div>
      )}
    </div>
  )
}
