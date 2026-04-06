'use client'

import { useEffect, useState } from 'react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface GeoData {
  city?: string
  country_name?: string
  error?: boolean
}

// ─── Paragraph data ──────────────────────────────────────────────────────────

const PARAGRAPHS = [
  "I've spent over 15 years in aviation — and if there's one thing I've seen break shops, ground aircraft, and cost mechanics their certifications, it's paperwork.",
  "Not because mechanics don't care. They care deeply. But aviation record-keeping was designed for a world that no longer exists: carbon paper, manila folders, filing cabinets. Meanwhile, our aircraft got more complex, regulations got stricter, and the mechanics doing the work have less time than ever.",
  "I've watched good shops lose aircraft to missing AD compliance records. I've seen mechanics scramble at 11pm trying to find a logbook entry before a morning inspection. I've seen owners lose tens of thousands of dollars because maintenance records couldn't be produced for a sale.",
  "This isn't a tools problem. It's a workflow problem.",
]

const CLOSING_PARAGRAPH =
  "myaircraft.us is my answer to that problem. Not another ERP. Not another clipboard turned app. A system that thinks the way mechanics think — where you just tell it what you did, and it handles everything else."

const TAGLINE_LINES = [
  'One bar. One conversation. Every record handled.',
  'Welcome to the future of aircraft maintenance.',
]

// ─── Component ───────────────────────────────────────────────────────────────

interface FounderNoteModalProps {
  onDismiss: () => void
}

export function FounderNoteModal({ onDismiss }: FounderNoteModalProps) {
  const [visible, setVisible] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [geo, setGeo] = useState<GeoData | null>(null)

  // On mount: check localStorage, set visibility, fetch geo
  useEffect(() => {
    setMounted(true)
    const seen = localStorage.getItem('founder_note_seen')
    if (seen) {
      // Already dismissed — call onDismiss immediately so parent can proceed
      onDismiss()
      return
    }
    // Slight delay so the entrance animation is visible
    const t = setTimeout(() => setVisible(true), 60)

    // Fetch geo — best effort, no crash if it fails
    fetch('https://ipapi.co/json/')
      .then((r) => r.json())
      .then((d: GeoData) => {
        if (!d.error && (d.city || d.country_name)) {
          setGeo(d)
        }
      })
      .catch(() => {/* silent */})

    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function dismiss() {
    localStorage.setItem('founder_note_seen', '1')
    // Trigger API to persist server-side (fire and forget)
    fetch('/api/onboarding/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ founder_note_seen: true }),
    }).catch(() => {/* silent */})
    setVisible(false)
    // Small delay to let the fade-out play
    setTimeout(onDismiss, 350)
  }

  // Don't render server-side to avoid hydration mismatch with localStorage check
  if (!mounted) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="A note from our founder"
      className={[
        'fixed inset-0 z-50 flex flex-col items-center justify-start overflow-y-auto',
        'transition-opacity duration-350',
        visible ? 'opacity-100' : 'opacity-0 pointer-events-none',
      ].join(' ')}
    >
      {/* Full-screen premium background */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950" />

      {/* Subtle texture overlay */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'1\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")',
        }}
      />

      {/* Radial glow behind content */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-[600px] h-[600px] rounded-full bg-blue-600/10 blur-[120px]" />
      </div>

      {/* Geo greeting banner */}
      {geo && (geo.city || geo.country_name) && (
        <div className="relative w-full flex justify-center pt-5 pb-0 z-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 backdrop-blur-sm">
            <span className="text-lg leading-none" aria-hidden="true">✈</span>
            <span className="text-sm text-white/70 font-medium tracking-wide">
              Welcome from{' '}
              {[geo.city, geo.country_name].filter(Boolean).join(', ')}
            </span>
          </div>
        </div>
      )}

      {/* Main content card */}
      <div className="relative z-10 w-full max-w-2xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
        {/* Header: logo + title */}
        <div className="flex items-center gap-3 mb-8">
          <svg
            width="28"
            height="28"
            viewBox="0 0 32 32"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M28 16L4 8L10 16L4 24L28 16Z"
              fill="#3b82f6"
              stroke="#60a5fa"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
          <span className="text-base font-semibold text-white/80 tracking-tight">
            myaircraft.us
          </span>
        </div>

        {/* Title */}
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2 tracking-tight leading-tight">
          A Note from Our Founder
        </h1>
        <p className="text-sm text-blue-400/80 font-medium mb-10 tracking-wide uppercase">
          Andy Patel — Founder &amp; CEO · 15+ Years in Aviation
        </p>

        {/* Decorative opening quote mark */}
        <div
          className="text-[120px] leading-none font-serif text-blue-500/20 select-none mb-[-48px] ml-[-8px]"
          aria-hidden="true"
        >
          &ldquo;
        </div>

        {/* Body paragraphs */}
        <div className="space-y-5">
          {PARAGRAPHS.map((para, i) => (
            <p
              key={i}
              className="text-base sm:text-lg text-white/80 leading-relaxed"
            >
              {para}
            </p>
          ))}

          {/* Highlighted closing paragraph */}
          <p className="text-base sm:text-lg text-white leading-relaxed font-medium">
            <span className="text-blue-400 font-semibold">myaircraft.us</span>{' '}
            {CLOSING_PARAGRAPH.replace('myaircraft.us ', '')}
          </p>

          {/* Tagline lines */}
          <div className="pt-2 space-y-1 border-l-2 border-blue-500/40 pl-4">
            {TAGLINE_LINES.map((line, i) => (
              <p
                key={i}
                className={
                  i === 0
                    ? 'text-sm sm:text-base text-blue-300 font-semibold tracking-wide'
                    : 'text-sm sm:text-base text-white/60'
                }
              >
                {line}
              </p>
            ))}
          </div>
        </div>

        {/* Divider */}
        <div className="my-8 border-t border-white/10" />

        {/* Author row */}
        <div className="flex items-center gap-4 mb-10">
          {/* AP monogram avatar */}
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center shrink-0 text-white font-bold text-xl shadow-lg ring-2 ring-blue-400/30"
            style={{
              background:
                'linear-gradient(135deg, #1d4ed8 0%, #3b82f6 50%, #06b6d4 100%)',
            }}
            aria-hidden="true"
          >
            AP
          </div>

          {/* Name + credentials */}
          <div>
            <p className="text-white font-semibold text-base leading-snug">
              Andy Patel
            </p>
            <p className="text-blue-400/80 text-sm font-medium">
              A&amp;P / IA · Founder, myaircraft.us
            </p>
            {/* Signature-style sign-off */}
            <p className="text-white/40 text-xs italic mt-0.5 font-serif">
              — Andy Patel, A&amp;P / IA, Founder, myaircraft.us
            </p>
          </div>
        </div>

        {/* CTA buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4">
          <button
            onClick={dismiss}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 rounded-lg px-8 py-3.5 text-base font-semibold text-white shadow-lg transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 active:scale-[0.98]"
            style={{
              background:
                'linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%)',
              boxShadow: '0 0 24px rgba(59, 130, 246, 0.35)',
            }}
          >
            <PlaneIcon />
            Begin Your Journey
          </button>

          <button
            onClick={dismiss}
            className="text-sm text-white/40 hover:text-white/70 transition-colors underline underline-offset-4 focus-visible:outline-none focus-visible:text-white/80"
          >
            Skip for now
          </button>
        </div>

        {/* Footer micro-copy */}
        <p className="mt-8 text-xs text-white/25 text-center sm:text-left">
          This message is shown once. You can always reach us at{' '}
          <a
            href="mailto:andy@myaircraft.us"
            className="underline hover:text-white/50 transition-colors"
          >
            andy@myaircraft.us
          </a>
        </p>
      </div>
    </div>
  )
}

// ─── Inline plane icon (avoids extra import) ─────────────────────────────────

function PlaneIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21 4 19.5 2.5c-1.5-1.5-3.5-1.5-5 0L11 6 2.8 4.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 1 2 2 1 1-1v-3l3-2 5.2 7.3c.3.4.8.5 1.3.3l.5-.3c.4-.2.6-.6.5-1.1z" />
    </svg>
  )
}
