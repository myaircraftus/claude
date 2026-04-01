'use client'

import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plane } from 'lucide-react'

const STORAGE_KEY = 'myaircraft_founders_note_dismissed'

export function FoundersNote() {
  const [visible, setVisible] = useState(false)
  const [dontShowAgain, setDontShowAgain] = useState(false)
  const [city, setCity] = useState<string | null>(null)
  const mounted = useRef(false)

  useEffect(() => {
    if (mounted.current) return
    mounted.current = true

    const dismissed = localStorage.getItem(STORAGE_KEY) ?? sessionStorage.getItem(STORAGE_KEY)
    if (dismissed) return

    setVisible(true)

    // Fetch geo greeting
    fetch('/api/onboarding/geo')
      .then(r => r.json())
      .then(data => {
        if (data?.city) setCity(data.city)
      })
      .catch(() => {/* silently ignore */})
  }, [])

  const dismiss = () => {
    if (dontShowAgain) {
      localStorage.setItem(STORAGE_KEY, 'true')
    } else {
      // Store a session-level flag so it doesn't re-show on page reload this session
      sessionStorage.setItem(STORAGE_KEY, 'session')
    }
    setVisible(false)
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="founders-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', backgroundColor: 'rgba(0,0,0,0.65)' }}
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-4xl mx-4 rounded-2xl overflow-hidden shadow-2xl flex flex-col md:flex-row"
            style={{ maxHeight: '90vh' }}
          >
            {/* Left — photo/avatar panel */}
            <div
              className="flex flex-col items-center justify-center gap-4 p-8 md:p-10 md:w-72 flex-shrink-0"
              style={{
                background: 'linear-gradient(145deg, #0a1628 0%, #0F1E35 40%, #1a3a5c 70%, #0F1E35 100%)',
              }}
            >
              {/* Aviation gradient avatar */}
              <div className="relative">
                <div
                  className="w-28 h-28 rounded-full flex items-center justify-center text-3xl font-bold text-white select-none shadow-lg"
                  style={{
                    background: 'linear-gradient(135deg, #1e4080 0%, #2563eb 50%, #0ea5e9 100%)',
                    border: '3px solid rgba(245,158,11,0.6)',
                    boxShadow: '0 0 0 1px rgba(245,158,11,0.2), 0 8px 32px rgba(0,0,0,0.4)',
                  }}
                >
                  AP
                </div>
                {/* Decorative ring */}
                <div
                  className="absolute -inset-1.5 rounded-full opacity-30"
                  style={{ border: '1px solid #F59E0B', pointerEvents: 'none' }}
                />
              </div>

              {/* Decorative plane icon */}
              <div className="flex flex-col items-center gap-1 mt-2">
                <Plane className="w-5 h-5 opacity-40 text-sky-400" />
                <p className="text-xs text-sky-300/50 tracking-widest uppercase font-medium">
                  Founder
                </p>
              </div>

              {/* Small decorative lines */}
              <div className="w-16 mt-2 space-y-1.5">
                <div className="h-px bg-gradient-to-r from-transparent via-yellow-500/50 to-transparent" />
                <div className="h-px bg-gradient-to-r from-transparent via-sky-500/30 to-transparent" />
              </div>

              <p className="text-center text-xs text-sky-300/60 leading-relaxed mt-1 hidden md:block">
                15+ years in<br />general aviation
              </p>
            </div>

            {/* Right — message panel */}
            <div
              className="flex flex-col flex-1 overflow-y-auto"
              style={{ backgroundColor: '#0F1E35' }}
            >
              <div className="flex-1 p-8 md:p-10 space-y-5">
                {/* Greeting */}
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold tracking-wide" style={{ color: '#F59E0B' }}>
                    {city ? `Welcome from ${city} ✈` : 'Welcome, fellow aviator ✈'}
                  </span>
                </div>

                {/* Title */}
                <h2 className="text-2xl md:text-3xl font-bold text-white leading-tight">
                  A Note from the Founder
                </h2>

                {/* Divider */}
                <div className="h-px w-12" style={{ backgroundColor: '#F59E0B' }} />

                {/* Body */}
                <div className="space-y-4 text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.82)' }}>
                  <p>Hello,</p>
                  <p>
                    I&apos;m Andy Patel, founder of MyAircraft.us.
                  </p>
                  <p>
                    For over 15 years, I&apos;ve worked in and around general aviation — as an aircraft owner,
                    operator, and someone who deeply understands the mechanics side of this industry.
                  </p>
                  <p>
                    In that time, I&apos;ve watched good aircraft lose significant value — not from damage, not
                    from neglect — but from incomplete, disorganized, or missing records. I&apos;ve seen mechanics
                    spend hours hunting through stacks of logbooks for a single AD compliance entry. I&apos;ve
                    watched shop owners lose thousands in disputes because they couldn&apos;t produce a clean
                    maintenance trail.
                  </p>
                  <p className="font-medium" style={{ color: 'rgba(255,255,255,0.95)' }}>
                    The record is the aircraft. A well-documented airplane is a valuable airplane.
                    A poorly-documented one is a liability.
                  </p>
                  <p>
                    The problem isn&apos;t that mechanics and operators don&apos;t care. They do. The problem is that
                    the software they&apos;ve been given wasn&apos;t built for how they actually work. It was built
                    for accountants and administrators — not for someone under a cowling at 7am with grease on
                    their hands.
                  </p>
                  <p>
                    We built MyAircraft.us to be different. Not a form to fill out. Not a database to manage.
                    A system that talks to you like a knowledgeable colleague, helps you think through what
                    needs to be documented, and gets out of your way.
                  </p>
                  <p className="font-semibold" style={{ color: '#F59E0B' }}>
                    One bar. Plain English. Done.
                  </p>
                  <p>
                    I hope this platform makes your work a little easier, and your records a little cleaner.
                  </p>
                  <p>Fly safe.</p>
                </div>

                {/* Signature */}
                <div className="pt-2">
                  <p className="text-base font-bold" style={{ color: '#F59E0B' }}>
                    Andy Patel
                  </p>
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                    Founder, MyAircraft.us
                  </p>
                </div>
              </div>

              {/* Footer actions */}
              <div
                className="flex flex-col sm:flex-row items-center justify-between gap-4 px-8 md:px-10 py-5 border-t"
                style={{ borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'rgba(0,0,0,0.2)' }}
              >
                {/* Don't show again */}
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={dontShowAgain}
                    onChange={e => setDontShowAgain(e.target.checked)}
                    className="w-3.5 h-3.5 rounded accent-yellow-500"
                  />
                  <span className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>
                    Don&apos;t show this again
                  </span>
                </label>

                {/* CTA */}
                <button
                  onClick={dismiss}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold transition-all duration-150 hover:brightness-110 active:scale-95 whitespace-nowrap"
                  style={{
                    backgroundColor: '#F59E0B',
                    color: '#0F1E35',
                  }}
                >
                  Continue to Dashboard
                  <span className="text-base">→</span>
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
