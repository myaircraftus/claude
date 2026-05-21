'use client'

/**
 * SlideCard — the single source of truth for rendering one pitch slide.
 *
 * Used in two places:
 *   1. The deck index page (/investor-room/pitch) renders each slide
 *      stacked in a scrollable grid.
 *   2. The presenter view (/investor-room/pitch/present) renders ONE
 *      slide full-screen at a time and listens for arrow-key navigation.
 *
 * Same renderer, two layouts — guarantees visual parity between the
 * preview and the live presentation.
 */
import { useEffect, useRef } from 'react'
import type { Slide } from '@/lib/investor/deck'
import { DECK } from '@/lib/investor/deck'
import { MermaidClient } from '@/components/sop/MermaidClient'

interface Props {
  slide: Slide
  /** When true, the slide fills the viewport (presenter view). */
  fullscreen?: boolean
  /** When provided, used as the article id for the Mermaid walker. */
  articleId?: string
}

const THEME_STYLES = {
  light: 'bg-white text-slate-900 border border-slate-200',
  dark: 'bg-slate-900 text-white border border-slate-800',
  accent: 'bg-gradient-to-br from-violet-600 to-fuchsia-700 text-white border border-violet-700',
} as const

export function SlideCard({ slide, fullscreen, articleId }: Props) {
  const theme = slide.theme ?? 'light'
  const themeCls = THEME_STYLES[theme]
  const isDark = theme !== 'light'
  const mermaidIdRef = useRef(
    articleId ?? `inv-slide-${slide.id}-${Math.random().toString(36).slice(2, 8)}`,
  )

  return (
    <article
      data-slide-id={slide.id}
      className={`relative rounded-xl ${themeCls} ${
        fullscreen
          ? 'w-full h-full flex flex-col justify-center px-12 py-12 md:px-20 md:py-16'
          : 'px-8 py-10'
      } shadow-sm`}
    >
      {slide.eyebrow && (
        <div
          className={`text-[10px] uppercase tracking-[0.22em] font-semibold mb-3 ${
            isDark ? 'text-white/80' : 'text-violet-700'
          }`}
        >
          {slide.eyebrow}
        </div>
      )}
      <h1
        className={`tracking-tight ${
          fullscreen ? 'text-5xl md:text-6xl' : 'text-3xl'
        } font-semibold ${isDark ? 'text-white' : 'text-slate-900'} leading-tight`}
      >
        {slide.title}
      </h1>
      {slide.subtitle && (
        <p
          className={`mt-4 leading-relaxed max-w-3xl ${
            fullscreen ? 'text-lg md:text-xl' : 'text-base'
          } ${isDark ? 'text-white/85' : 'text-slate-600'}`}
        >
          {slide.subtitle}
        </p>
      )}

      {slide.metrics && slide.metrics.length > 0 && (
        <div
          className={`grid gap-4 mt-8 ${
            fullscreen ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-2 md:grid-cols-4'
          }`}
        >
          {slide.metrics.map((m) => (
            <div
              key={m.label}
              className={`rounded-lg ${
                isDark
                  ? 'bg-white/10 border border-white/15'
                  : 'bg-violet-50/50 border border-violet-100'
              } p-4`}
            >
              <div
                className={`${
                  fullscreen ? 'text-3xl md:text-4xl' : 'text-2xl'
                } font-semibold ${isDark ? 'text-white' : 'text-violet-700'}`}
              >
                {m.value}
              </div>
              <div
                className={`text-[11px] uppercase tracking-wider mt-1 ${
                  isDark ? 'text-white/80' : 'text-slate-700'
                }`}
              >
                {m.label}
              </div>
              {m.sub && (
                <div
                  className={`text-[10px] mt-0.5 ${
                    isDark ? 'text-white/60' : 'text-slate-500'
                  }`}
                >
                  {m.sub}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {slide.bullets && slide.bullets.length > 0 && (
        <ul className={`space-y-3 mt-8 ${fullscreen ? 'text-base md:text-lg' : 'text-sm'}`}>
          {slide.bullets.map((b) => (
            <li key={b} className="flex items-start gap-3">
              <span
                className={`mt-1 ${isDark ? 'text-white/80' : 'text-violet-500'} text-lg leading-none`}
              >
                •
              </span>
              <span className={isDark ? 'text-white/90' : 'text-slate-700'}>{b}</span>
            </li>
          ))}
        </ul>
      )}

      {slide.mermaid && (
        <div className="mt-8">
          <div
            id={mermaidIdRef.current}
            className={`rounded-lg ${
              isDark ? 'bg-white/5' : 'bg-white'
            } border ${isDark ? 'border-white/15' : 'border-slate-200'} p-4`}
          >
            <div className="sop-mermaid">
              <pre className="sop-mermaid-source" style={{ display: 'none' }}>
                {slide.mermaid}
              </pre>
            </div>
          </div>
          {/* Mount the walker against this slide's article container. */}
          <MermaidClient articleId={mermaidIdRef.current} />
        </div>
      )}

      {slide.quote && (
        <blockquote
          className={`mt-8 rounded-lg ${
            isDark ? 'bg-white/10 border-l-4 border-white/40' : 'bg-violet-50 border-l-4 border-violet-300'
          } px-5 py-4`}
        >
          <p
            className={`italic ${fullscreen ? 'text-lg' : 'text-sm'} ${
              isDark ? 'text-white/95' : 'text-slate-800'
            }`}
          >
            &ldquo;{slide.quote.text}&rdquo;
          </p>
          <footer
            className={`text-xs mt-2 ${
              isDark ? 'text-white/70' : 'text-slate-600'
            }`}
          >
            — {slide.quote.attribution}
          </footer>
        </blockquote>
      )}

      {slide.footnote && (
        <p
          className={`${
            fullscreen ? 'absolute bottom-6 left-12 right-12' : 'mt-6'
          } text-[11px] ${isDark ? 'text-white/60' : 'text-slate-500'}`}
        >
          {slide.footnote}
        </p>
      )}

      <div
        className={`${
          fullscreen
            ? 'absolute top-6 right-8 text-[11px]'
            : 'absolute top-3 right-4 text-[10px]'
        } uppercase tracking-wider ${isDark ? 'text-white/50' : 'text-slate-400'}`}
      >
        {slide.n}/{DECK.length}
      </div>
    </article>
  )
}

/**
 * Optional ergonomic hook — presenter view uses this for keyboard
 * navigation. Kept here so the contract lives next to the renderer.
 */
export function useArrowNavigation(args: {
  onPrev: () => void
  onNext: () => void
  onClose?: () => void
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement)?.matches?.('input,textarea,[contenteditable=true]')) return
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown' || e.key === 'j') {
        e.preventDefault()
        args.onNext()
      } else if (
        e.key === 'ArrowLeft' ||
        e.key === 'PageUp' ||
        e.key === 'k' ||
        e.key === 'Backspace'
      ) {
        e.preventDefault()
        args.onPrev()
      } else if (e.key === 'Escape' && args.onClose) {
        args.onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [args])
}
