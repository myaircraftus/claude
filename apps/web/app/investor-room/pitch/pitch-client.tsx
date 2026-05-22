'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Play, Printer, ListOrdered, Sparkles } from 'lucide-react'
import { DECK } from '@/lib/investor/deck'
import { SlideCard } from '@/components/investor/SlideCard'

export function PitchDeckClient() {
  const [navOpen, setNavOpen] = useState(false)

  const openPresenter = useCallback(() => {
    // Open in a new tab so the user can present without losing the
    // deck-index page. The /present route auto-requests fullscreen
    // on mount.
    if (typeof window !== 'undefined') {
      window.open('/investor-pitch-present?from=1', '_blank', 'noopener,noreferrer')
    }
  }, [])

  const printDeck = useCallback(() => {
    if (typeof window !== 'undefined') window.print()
  }, [])

  return (
    <div className="max-w-6xl mx-auto px-6 py-6">
      {/* Sticky toolbar */}
      <div className="sticky top-0 z-30 -mx-6 px-6 py-3 mb-6 bg-white/95 backdrop-blur border-b border-slate-200 flex items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/investor-room"
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Investor Room
          </Link>
          <span className="text-slate-300">/</span>
          <span className="text-xs font-medium text-slate-700">Pitch deck</span>
          <span className="text-[10px] uppercase tracking-wider text-slate-400">
            · {DECK.length} slides
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setNavOpen((o) => !o)}
            className="inline-flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-300 rounded-md px-2.5 py-1.5 transition-colors"
          >
            <ListOrdered className="w-3 h-3" />
            Slides
          </button>
          <button
            type="button"
            onClick={printDeck}
            className="inline-flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-300 rounded-md px-2.5 py-1.5 transition-colors"
            title="Print / save as PDF"
          >
            <Printer className="w-3 h-3" />
            Print
          </button>
          <a
            href="/investor-pitch-present?from=1"
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              // Cleaner UX: explicit open via JS so the popup-blocker
              // heuristic doesn't trip on the noopener noreferrer.
              e.preventDefault()
              openPresenter()
            }}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-amber-500 hover:bg-amber-600 rounded-md px-3 py-1.5 transition-colors"
          >
            <Play className="w-3.5 h-3.5" />
            Present
          </a>
        </div>
      </div>

      {/* Slide navigator (collapsible) */}
      {navOpen && (
        <div className="mb-6 rounded-lg border border-slate-200 bg-slate-50 p-4 print:hidden">
          <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-semibold mb-2">
            Jump to slide
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
            {DECK.map((s) => (
              <a
                key={s.id}
                href={`#slide-${s.id}`}
                className="text-xs text-slate-700 hover:text-violet-700 bg-white border border-slate-200 hover:border-violet-300 rounded px-2 py-1.5 transition-colors"
              >
                <span className="text-slate-400 mr-1">{String(s.n).padStart(2, '0')}</span>
                {s.label}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Slide intro */}
      <header className="mb-6 print:hidden">
        <div className="text-[10px] uppercase tracking-[0.2em] text-violet-700 font-semibold mb-2">
          Pitch
        </div>
        <h1 className="text-3xl font-semibold text-slate-900 mb-2">
          Scroll the deck or hit Present.
        </h1>
        <p className="text-sm text-slate-600 max-w-2xl">
          Arrow keys, space, and J/K navigate slides in presenter mode. Esc closes.
          Each slide is identical to its on-stage rendering — what you see here is
          what you&apos;ll show.
        </p>
        <div className="mt-3 inline-flex items-center gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-1.5 text-[11px] text-amber-800">
          <Sparkles className="w-3 h-3" />
          Tip — open Present in a second tab and use the deck index here as your speaker notes.
        </div>
      </header>

      {/* The deck — one slide per row */}
      <div className="space-y-6 print:space-y-0">
        {DECK.map((slide) => (
          <section
            key={slide.id}
            id={`slide-${slide.id}`}
            className="scroll-mt-24 print:break-after-page"
          >
            <SlideCard slide={slide} />
          </section>
        ))}
      </div>

      <footer className="mt-10 pt-6 border-t border-slate-200 text-[11px] text-slate-500 flex items-center justify-between print:hidden">
        <span>Confidential — do not distribute.</span>
        <a
          href="/investor-pitch-present?from=1"
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            e.preventDefault()
            openPresenter()
          }}
          className="inline-flex items-center gap-1 text-violet-700 hover:text-violet-900 font-medium"
        >
          <Play className="w-3 h-3" />
          Open presenter view
        </a>
      </footer>
    </div>
  )
}
