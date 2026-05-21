'use client'

/**
 * PresenterClient — full-screen pitch deck.
 *
 * Lands on slide N (from ?from=N or 1), navigates with arrow keys,
 * space, J/K. Esc returns. Click the chrome to toggle fullscreen.
 *
 * The page sits on top of a black background; SlideCard renders the
 * actual slide content. Mermaid diagrams re-render on each navigation
 * because SlideCard's MermaidClient is keyed off the slide's articleId.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, X, Maximize2, Minimize2 } from 'lucide-react'
import { DECK } from '@/lib/investor/deck'
import { SlideCard, useArrowNavigation } from '@/components/investor/SlideCard'

interface Props {
  startN: number
}

export function PresenterClient({ startN }: Props) {
  const [idx, setIdx] = useState(() => Math.min(Math.max(0, startN - 1), DECK.length - 1))
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [chromeVisible, setChromeVisible] = useState(true)

  const slide = DECK[idx]
  const safeArticleId = useMemo(() => `present-${slide.id}`, [slide.id])

  const onPrev = useCallback(() => {
    setIdx((i) => Math.max(0, i - 1))
  }, [])
  const onNext = useCallback(() => {
    setIdx((i) => Math.min(DECK.length - 1, i + 1))
  }, [])
  const onClose = useCallback(() => {
    if (typeof window !== 'undefined') {
      // Closing the presenter just navigates back to the deck index;
      // the tab can also be closed directly by the user.
      window.history.length > 1 ? window.history.back() : window.location.assign('/investor-room/pitch')
    }
  }, [])

  useArrowNavigation({ onPrev, onNext, onClose })

  // Request fullscreen as soon as the user first interacts. Most browsers
  // require a user gesture before they'll grant fullscreen — we listen
  // for the first keydown / click and request it then. (Trying on mount
  // without a gesture errors out silently.)
  useEffect(() => {
    function requestFs() {
      if (
        typeof document !== 'undefined' &&
        !document.fullscreenElement &&
        document.documentElement?.requestFullscreen
      ) {
        document.documentElement
          .requestFullscreen()
          .then(() => setIsFullscreen(true))
          .catch(() => {
            /* user denied, ignore */
          })
      }
    }
    function onFirstInteraction() {
      requestFs()
      window.removeEventListener('keydown', onFirstInteraction)
      window.removeEventListener('click', onFirstInteraction)
    }
    window.addEventListener('keydown', onFirstInteraction, { once: true })
    window.addEventListener('click', onFirstInteraction, { once: true })
    return () => {
      window.removeEventListener('keydown', onFirstInteraction)
      window.removeEventListener('click', onFirstInteraction)
    }
  }, [])

  // Sync the fullscreen state with browser events (e.g., user pressing Esc)
  useEffect(() => {
    function onChange() {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const toggleFullscreen = useCallback(() => {
    if (typeof document === 'undefined') return
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {})
    } else if (document.documentElement?.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {})
    }
  }, [])

  // Auto-hide chrome after 3s of no activity in fullscreen.
  useEffect(() => {
    if (!isFullscreen) {
      setChromeVisible(true)
      return
    }
    let t: ReturnType<typeof setTimeout> | null = null
    const reset = () => {
      setChromeVisible(true)
      if (t) clearTimeout(t)
      t = setTimeout(() => setChromeVisible(false), 3000)
    }
    reset()
    window.addEventListener('mousemove', reset)
    window.addEventListener('keydown', reset)
    return () => {
      if (t) clearTimeout(t)
      window.removeEventListener('mousemove', reset)
      window.removeEventListener('keydown', reset)
    }
  }, [isFullscreen])

  return (
    <div className="relative h-screen w-screen bg-slate-950 text-white overflow-hidden">
      {/* Slide area */}
      <div className="absolute inset-0 flex items-center justify-center p-6 md:p-10">
        <div className="w-full h-full max-w-[1400px] max-h-[800px]">
          <SlideCard slide={slide} fullscreen articleId={safeArticleId} />
        </div>
      </div>

      {/* Top chrome */}
      <div
        className={`absolute top-0 left-0 right-0 flex items-center justify-between px-5 py-3 transition-opacity ${
          chromeVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="text-[10px] uppercase tracking-[0.2em] text-white/60 font-semibold">
          myaircraft.us · pitch · confidential
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleFullscreen}
            className="inline-flex items-center gap-1.5 text-[11px] text-white/80 hover:text-white bg-white/10 hover:bg-white/15 border border-white/15 rounded-md px-2.5 py-1 transition-colors"
            title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Enter fullscreen'}
          >
            {isFullscreen ? (
              <Minimize2 className="w-3 h-3" />
            ) : (
              <Maximize2 className="w-3 h-3" />
            )}
            {isFullscreen ? 'Exit' : 'Fullscreen'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 text-[11px] text-white/80 hover:text-white bg-white/10 hover:bg-white/15 border border-white/15 rounded-md px-2.5 py-1 transition-colors"
            title="Close presenter (Esc)"
          >
            <X className="w-3 h-3" />
            Close
          </button>
        </div>
      </div>

      {/* Bottom nav */}
      <div
        className={`absolute bottom-0 left-0 right-0 flex items-center justify-between px-5 py-4 transition-opacity ${
          chromeVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <button
          type="button"
          onClick={onPrev}
          disabled={idx === 0}
          className="inline-flex items-center gap-1.5 text-sm text-white/85 hover:text-white disabled:text-white/30 disabled:cursor-not-allowed bg-white/10 hover:bg-white/15 disabled:hover:bg-white/10 border border-white/15 rounded-lg px-3 py-2 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Prev
        </button>

        {/* Slide-position pill */}
        <div className="text-[11px] uppercase tracking-wider text-white/70 font-semibold flex items-center gap-2">
          <span>{slide.label}</span>
          <span className="text-white/40">·</span>
          <span>
            {idx + 1} / {DECK.length}
          </span>
        </div>

        <button
          type="button"
          onClick={onNext}
          disabled={idx === DECK.length - 1}
          className="inline-flex items-center gap-1.5 text-sm text-white/85 hover:text-white disabled:text-white/30 disabled:cursor-not-allowed bg-white/10 hover:bg-white/15 disabled:hover:bg-white/10 border border-white/15 rounded-lg px-3 py-2 transition-colors"
        >
          Next
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Progress strip */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/5">
        <div
          className="h-full bg-amber-400 transition-all duration-200"
          style={{ width: `${((idx + 1) / DECK.length) * 100}%` }}
        />
      </div>
    </div>
  )
}
