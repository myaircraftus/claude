'use client'

import { useState } from 'react'
import Link from 'next/link'

// ─── Inline SVG Icons ────────────────────────────────────────────────────────

function PlaneIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3L20 8v2l-4 2v6l2 1v2l-6-2-6 2v-2l2-1v-6L4 10V8l8-5z"/>
    </svg>
  )
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  )
}

function WrenchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
    </svg>
  )
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  )
}

function ZapIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  )
}

function RadioIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/>
      <path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"/>
      <circle cx="12" cy="12" r="2"/>
      <path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"/>
      <path d="M19.1 4.9C23 8.8 23 15.1 19.1 19"/>
    </svg>
  )
}

function FileTextIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
      <polyline points="10 9 9 9 8 9"/>
    </svg>
  )
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  )
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  )
}

function BuildingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="2" width="16" height="20" rx="2" ry="2"/>
      <path d="M9 22v-4h6v4"/>
      <path d="M8 6h.01M16 6h.01M8 10h.01M16 10h.01M8 14h.01M16 14h.01"/>
    </svg>
  )
}

function BriefcaseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/>
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
    </svg>
  )
}

function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12"/>
      <polyline points="12 5 19 12 12 19"/>
    </svg>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LogbookScanningPage() {
  const [formState, setFormState] = useState({
    name: '',
    email: '',
    phone: '',
    tail_numbers: '',
    record_volume: '',
    message: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitError, setSubmitError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setSubmitError('')
    try {
      const res = await fetch('/api/public/scan-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formState),
      })
      if (res.ok) {
        setSubmitted(true)
      } else {
        setSubmitError('Something went wrong. Please try again or email us directly.')
      }
    } catch {
      setSubmitError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-white font-sans antialiased">
      <style>{`
        @keyframes scan-line {
          0% { top: 0%; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .scan-line {
          animation: scan-line 2.4s ease-in-out infinite;
        }
        .animate-fade-up {
          animation: fade-up 0.6s ease-out forwards;
        }
        .step-connector::after {
          content: '';
          position: absolute;
          top: 28px;
          left: calc(50% + 40px);
          width: calc(100% - 80px);
          height: 2px;
          background: linear-gradient(90deg, #2563EB, #93C5FD);
          z-index: 0;
        }
      `}</style>

      {/* ── SECTION 1: Navigation ── */}
      <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="w-8 h-8 rounded-[8px] bg-blue-600 flex items-center justify-center shadow-sm group-hover:bg-blue-700 transition-colors">
                <PlaneIcon className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold text-[15px] text-slate-900 tracking-tight">
                myaircraft<span className="text-blue-600">.us</span>
              </span>
            </Link>

            {/* Nav actions */}
            <div className="flex items-center gap-3">
              <Link
                href="/login"
                className="hidden sm:inline-flex text-[14px] font-medium text-slate-600 hover:text-slate-900 transition-colors px-3 py-2"
              >
                Sign In
              </Link>
              <a
                href="#quote-form"
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-[8px] bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-semibold transition-all shadow-sm hover:shadow-md"
              >
                Request a Quote
                <ArrowRightIcon className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>
      </nav>

      {/* ── SECTION 2: Hero ── */}
      <section className="relative overflow-hidden bg-white pt-16 pb-20 lg:pt-24 lg:pb-28">
        {/* Background decoration */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full bg-blue-50 opacity-60" />
          <div className="absolute top-60 -left-20 w-[300px] h-[300px] rounded-full bg-blue-50 opacity-40" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left column */}
            <div className="animate-fade-up">
              {/* Badge */}
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-50 border border-blue-100 text-blue-700 text-[12px] font-semibold uppercase tracking-wide mb-6">
                <span>✈</span>
                <span>Aircraft Logbook Scanning Service</span>
              </div>

              {/* H1 */}
              <h1 className="text-[38px] sm:text-[46px] lg:text-[52px] font-extrabold text-slate-900 leading-[1.08] tracking-tight mb-6">
                We Turn Messy Aircraft Logbooks Into{' '}
                <span className="text-blue-600">Clean Digital Records</span>
              </h1>

              {/* Subtext */}
              <p className="text-[17px] sm:text-[18px] text-slate-600 leading-relaxed mb-8 max-w-xl">
                We come to you, professionally scan your aircraft logbooks and maintenance records, organize them by type, and deliver clean digital files — ready for storage, review, or upload into the platform.
              </p>

              {/* CTAs */}
              <div className="flex flex-col sm:flex-row gap-3 mb-8">
                <a
                  href="#quote-form"
                  className="inline-flex items-center justify-center gap-2 h-12 px-6 rounded-[10px] bg-blue-600 hover:bg-blue-700 text-white text-[15px] font-semibold transition-all shadow-md hover:shadow-lg"
                >
                  Request a Scan Quote
                  <ArrowRightIcon className="w-4 h-4" />
                </a>
                <a
                  href="#how-it-works"
                  className="inline-flex items-center justify-center gap-2 h-12 px-6 rounded-[10px] border-2 border-blue-200 text-blue-700 text-[15px] font-semibold hover:border-blue-400 hover:bg-blue-50 transition-all"
                >
                  See How It Works
                </a>
              </div>

              {/* Trust row */}
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-6">
                {[
                  'On-site scanning available',
                  'Aviation-aware specialists',
                  'Secure digital delivery',
                ].map((item) => (
                  <div key={item} className="flex items-center gap-2">
                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center">
                      <CheckIcon className="w-3 h-3 text-blue-600" />
                    </div>
                    <span className="text-[13px] font-medium text-slate-600">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right column — Scan mockup */}
            <div className="relative flex items-center justify-center lg:justify-end">
              <div className="relative w-full max-w-[420px]">
                {/* Outer glow */}
                <div className="absolute inset-0 rounded-2xl bg-blue-600 opacity-10 blur-2xl scale-105" />

                {/* Main card */}
                <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-blue-100">
                  {/* Card header - blue gradient */}
                  <div className="bg-gradient-to-br from-blue-700 via-blue-600 to-blue-500 px-5 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-[6px] bg-white/20 flex items-center justify-center">
                        <PlaneIcon className="w-3.5 h-3.5 text-white" />
                      </div>
                      <div>
                        <div className="text-white/90 text-[11px] font-medium">Scan Job #2847</div>
                        <div className="text-white text-[13px] font-bold">N4821G · Cessna 172</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-400/20 border border-green-400/30">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                      <span className="text-green-300 text-[10px] font-semibold uppercase tracking-wide">In Progress</span>
                    </div>
                  </div>

                  {/* Scan area */}
                  <div className="bg-white px-5 py-4 relative overflow-hidden" style={{ minHeight: 240 }}>
                    {/* Scan line animation */}
                    <div
                      className="scan-line absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-blue-500 to-transparent z-10 pointer-events-none"
                      style={{ position: 'absolute' }}
                    />

                    {/* Fake document rows */}
                    <div className="space-y-3">
                      {/* Doc 1 - scanned */}
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
                        <div className="w-8 h-10 rounded bg-blue-100 border border-blue-200 flex items-center justify-center flex-shrink-0">
                          <FileTextIcon className="w-3.5 h-3.5 text-blue-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[12px] font-semibold text-slate-700 truncate">Airframe Logbook — Vol. 1</div>
                          <div className="text-[11px] text-slate-400">142 pages · PDF</div>
                        </div>
                        <div className="flex-shrink-0 flex items-center gap-1 text-[10px] font-semibold text-green-600">
                          <CheckIcon className="w-3 h-3" />
                          Done
                        </div>
                      </div>

                      {/* Doc 2 - scanned */}
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
                        <div className="w-8 h-10 rounded bg-orange-100 border border-orange-200 flex items-center justify-center flex-shrink-0">
                          <SettingsIcon className="w-3.5 h-3.5 text-orange-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[12px] font-semibold text-slate-700 truncate">Engine Logbook — Lycoming O-320</div>
                          <div className="text-[11px] text-slate-400">87 pages · PDF</div>
                        </div>
                        <div className="flex-shrink-0 flex items-center gap-1 text-[10px] font-semibold text-green-600">
                          <CheckIcon className="w-3 h-3" />
                          Done
                        </div>
                      </div>

                      {/* Doc 3 - in progress */}
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-blue-50 border border-blue-200">
                        <div className="w-8 h-10 rounded bg-blue-200 border border-blue-300 flex items-center justify-center flex-shrink-0">
                          <WrenchIcon className="w-3.5 h-3.5 text-blue-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[12px] font-semibold text-blue-800 truncate">Maintenance Records — 2018–2024</div>
                          <div className="w-full bg-blue-100 rounded-full h-1.5 mt-1.5">
                            <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: '62%' }} />
                          </div>
                        </div>
                        <div className="flex-shrink-0 text-[10px] font-semibold text-blue-600">62%</div>
                      </div>

                      {/* Doc 4 - queued */}
                      <div className="flex items-center gap-3 p-3 rounded-lg border border-dashed border-slate-200 opacity-60">
                        <div className="w-8 h-10 rounded bg-slate-100 border border-slate-200 flex items-center justify-center flex-shrink-0">
                          <ShieldIcon className="w-3.5 h-3.5 text-slate-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[12px] font-medium text-slate-500 truncate">AD Compliance Records</div>
                          <div className="text-[11px] text-slate-400">Queued</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Card footer */}
                  <div className="bg-slate-50 border-t border-slate-100 px-5 py-3 flex items-center justify-between">
                    <span className="text-[11px] text-slate-500">3 of 4 documents complete</span>
                    <div className="flex gap-1">
                      {[0, 1, 2, 3].map(i => (
                        <div key={i} className={`w-5 h-1.5 rounded-full ${i < 3 ? 'bg-blue-500' : 'bg-slate-200'}`} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── SECTION 3: What We Scan ── */}
      <section className="bg-white py-20 lg:py-28 border-t border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Section header */}
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-[11px] font-semibold uppercase tracking-widest mb-4">
              Comprehensive Coverage
            </div>
            <h2 className="text-[32px] sm:text-[38px] lg:text-[42px] font-extrabold text-slate-900 tracking-tight">
              Everything We Handle
            </h2>
            <p className="mt-4 text-[17px] text-slate-500 max-w-xl mx-auto">
              From single logbooks to complete record packages, our specialists handle every document type with precision.
            </p>
          </div>

          {/* 6-card grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              {
                icon: <WrenchIcon className="w-5 h-5 text-blue-600" />,
                title: 'Airframe Logbooks',
                description: 'Complete flight history and airframe maintenance entries, including all annual inspections and major repairs.',
                color: 'blue',
              },
              {
                icon: <SettingsIcon className="w-5 h-5 text-orange-600" />,
                title: 'Engine Logbooks',
                description: 'Engine run times, overhauls, oil changes, cylinder work, and all engine-related repair history.',
                color: 'orange',
              },
              {
                icon: <ZapIcon className="w-5 h-5 text-violet-600" />,
                title: 'Propeller Records',
                description: 'Prop inspections, strike reports, repairs, and complete overhaul history for all propeller assemblies.',
                color: 'violet',
              },
              {
                icon: <RadioIcon className="w-5 h-5 text-teal-600" />,
                title: 'Avionics Records',
                description: 'Installed equipment documentation, 8130 tags, and complete work history for all avionics and instruments.',
                color: 'teal',
              },
              {
                icon: <FileTextIcon className="w-5 h-5 text-rose-600" />,
                title: 'Maintenance Entries',
                description: 'Individual work orders, yellow tags, service bulletins, and all supplemental maintenance records.',
                color: 'rose',
              },
              {
                icon: <ShieldIcon className="w-5 h-5 text-green-600" />,
                title: 'AD & Compliance Docs',
                description: 'Airworthiness directive compliance documentation, including repetitive AD sign-offs and STC paperwork.',
                color: 'green',
              },
            ].map((card) => {
              const colorMap: Record<string, string> = {
                blue: 'bg-blue-50 border-blue-100',
                orange: 'bg-orange-50 border-orange-100',
                violet: 'bg-violet-50 border-violet-100',
                teal: 'bg-teal-50 border-teal-100',
                rose: 'bg-rose-50 border-rose-100',
                green: 'bg-green-50 border-green-100',
              }
              const iconBg: Record<string, string> = {
                blue: 'bg-blue-100',
                orange: 'bg-orange-100',
                violet: 'bg-violet-100',
                teal: 'bg-teal-100',
                rose: 'bg-rose-100',
                green: 'bg-green-100',
              }
              return (
                <div
                  key={card.title}
                  className={`group rounded-xl border p-6 hover:shadow-md transition-all duration-200 ${colorMap[card.color]}`}
                >
                  <div className={`w-10 h-10 rounded-lg ${iconBg[card.color]} flex items-center justify-center mb-4`}>
                    {card.icon}
                  </div>
                  <h3 className="text-[16px] font-bold text-slate-900 mb-2">{card.title}</h3>
                  <p className="text-[14px] text-slate-600 leading-relaxed">{card.description}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── SECTION 4: How It Works ── */}
      <section id="how-it-works" className="bg-slate-50 py-20 lg:py-28 border-t border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Section header */}
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-100 text-blue-700 text-[11px] font-semibold uppercase tracking-widest mb-4">
              Simple Process
            </div>
            <h2 className="text-[32px] sm:text-[38px] lg:text-[42px] font-extrabold text-slate-900 tracking-tight">
              How It Works
            </h2>
            <p className="mt-4 text-[17px] text-slate-500 max-w-xl mx-auto">
              From initial request to digital delivery, our process is designed to be frictionless for aircraft owners and operators.
            </p>
          </div>

          {/* 4 steps */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-4">
            {[
              {
                step: '01',
                title: 'Request a Quote',
                description: 'Submit your aircraft details and an estimate of your records volume. We respond within one business day with a firm quote.',
              },
              {
                step: '02',
                title: 'We Come to You',
                description: 'Our aviation-aware specialist arrives at your hangar or airport with professional scanning equipment — no shipping required.',
              },
              {
                step: '03',
                title: 'Scan & Organize',
                description: 'We systematically scan, sort, and organize every document by type — airframe, engine, avionics, and maintenance records.',
              },
              {
                step: '04',
                title: 'Digital Delivery',
                description: 'Receive clean, high-resolution digital files organized by logbook type via secure download. Ready to upload or archive.',
              },
            ].map((s, idx) => (
              <div key={s.step} className="relative flex flex-col">
                {/* Connector line (desktop only, not last item) */}
                {idx < 3 && (
                  <div className="hidden lg:block absolute top-[28px] left-[calc(50%+40px)] w-[calc(100%-80px+1rem)] h-px bg-gradient-to-r from-blue-300 to-blue-100 z-0" />
                )}

                <div className="relative z-10 bg-white rounded-xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-shadow h-full flex flex-col">
                  {/* Step number */}
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-11 h-11 rounded-full bg-blue-600 flex items-center justify-center text-white text-[14px] font-extrabold shadow-sm flex-shrink-0">
                      {s.step}
                    </div>
                    <div className="h-px flex-1 bg-slate-100" />
                  </div>
                  <h3 className="text-[16px] font-bold text-slate-900 mb-2">{s.title}</h3>
                  <p className="text-[14px] text-slate-500 leading-relaxed flex-1">{s.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SECTION 5: Who This Is For ── */}
      <section className="bg-white py-20 lg:py-28 border-t border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Section header */}
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-[11px] font-semibold uppercase tracking-widest mb-4">
              Built For Aviation Professionals
            </div>
            <h2 className="text-[32px] sm:text-[38px] lg:text-[42px] font-extrabold text-slate-900 tracking-tight">
              Who This Is For
            </h2>
            <p className="mt-4 text-[17px] text-slate-500 max-w-xl mx-auto">
              Whether you own a single piston or manage a fleet, we have a scanning solution that fits your operation.
            </p>
          </div>

          {/* 3 columns */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                icon: <UsersIcon className="w-6 h-6 text-blue-600" />,
                iconBg: 'bg-blue-50',
                title: 'Aircraft Owners',
                subtitle: 'Preparing for sale, prebuy, or just need clean records',
                bullets: [
                  'Pre-sale record preparation',
                  'Pre-purchase inspection support',
                  'Insurance documentation',
                  'Personal archive & peace of mind',
                  'Records recovery after transition',
                ],
              },
              {
                icon: <BuildingIcon className="w-6 h-6 text-violet-600" />,
                iconBg: 'bg-violet-50',
                title: 'Flight Schools',
                subtitle: 'Fleet-wide scanning for 5, 10, 50+ aircraft',
                bullets: [
                  'Full fleet digitization programs',
                  'Standardized document organization',
                  'Regulatory compliance archives',
                  'Faster aircraft transitions',
                  'Discounted volume pricing available',
                ],
              },
              {
                icon: <BriefcaseIcon className="w-6 h-6 text-teal-600" />,
                iconBg: 'bg-teal-50',
                title: 'Aviation Brokers',
                subtitle: 'Pre-purchase record preparation and due diligence support',
                bullets: [
                  'Pre-listing record review & scan',
                  'Buyer due diligence packages',
                  'Lender documentation support',
                  'Quick turnaround for active deals',
                  'Confidential, secure handling',
                ],
              },
            ].map((col) => (
              <div key={col.title} className="rounded-xl border border-slate-200 p-7 hover:shadow-md transition-shadow">
                <div className={`w-12 h-12 rounded-xl ${col.iconBg} flex items-center justify-center mb-5`}>
                  {col.icon}
                </div>
                <h3 className="text-[18px] font-bold text-slate-900 mb-1">{col.title}</h3>
                <p className="text-[13px] text-slate-500 mb-5 leading-relaxed">{col.subtitle}</p>
                <ul className="space-y-2.5">
                  {col.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-2.5">
                      <div className="flex-shrink-0 mt-0.5 w-4 h-4 rounded-full bg-blue-100 flex items-center justify-center">
                        <CheckIcon className="w-2.5 h-2.5 text-blue-600" />
                      </div>
                      <span className="text-[13px] text-slate-600">{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SECTION 6: Pricing ── */}
      <section className="bg-slate-50 py-20 lg:py-28 border-t border-slate-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Section header */}
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-100 text-blue-700 text-[11px] font-semibold uppercase tracking-widest mb-4">
              Transparent Options
            </div>
            <h2 className="text-[32px] sm:text-[38px] lg:text-[42px] font-extrabold text-slate-900 tracking-tight">
              Service Pricing
            </h2>
            <p className="mt-4 text-[17px] text-slate-500 max-w-xl mx-auto">
              Every job is quoted individually based on aircraft count and record volume. These are illustrative structures only.
            </p>
          </div>

          {/* Two cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* One-Time */}
            <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm flex flex-col">
              <div className="mb-6">
                <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-2">One-Time Scan Job</div>
                <div className="text-[34px] font-extrabold text-slate-900 leading-none mb-1">Custom Quote</div>
                <div className="text-[14px] text-slate-500">Starting from a custom quote based on your records</div>
              </div>

              <ul className="space-y-3 mb-8 flex-1">
                {[
                  'On-site visit at your hangar or FBO',
                  'Full professional scan of all records',
                  'Organized by document type',
                  'Secure digital delivery package',
                  'PDF with searchable filenames',
                  'Typical timeline: 1–3 days per aircraft',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5 w-4 h-4 rounded-full bg-green-100 flex items-center justify-center">
                      <CheckIcon className="w-2.5 h-2.5 text-green-600" />
                    </div>
                    <span className="text-[14px] text-slate-600">{item}</span>
                  </li>
                ))}
              </ul>

              <a
                href="#quote-form"
                className="w-full inline-flex items-center justify-center h-11 rounded-[10px] bg-blue-600 hover:bg-blue-700 text-white text-[14px] font-semibold transition-all shadow-sm hover:shadow-md"
              >
                Get a Quote
              </a>
            </div>

            {/* Subscription */}
            <div className="relative bg-white rounded-2xl border-2 border-blue-600 p-8 shadow-lg flex flex-col overflow-hidden">
              {/* Popular badge */}
              <div className="absolute top-0 right-6 px-3 py-1 rounded-b-md bg-blue-600 text-white text-[10px] font-bold uppercase tracking-widest">
                Flexible
              </div>

              <div className="mb-6">
                <div className="text-[11px] font-semibold uppercase tracking-widest text-blue-600 mb-2">Subscription Plan</div>
                <div className="flex items-end gap-1 mb-1">
                  <span className="text-[34px] font-extrabold text-slate-900 leading-none">~$27</span>
                  <span className="text-slate-500 text-[14px] mb-1">/month</span>
                </div>
                <div className="text-[13px] text-slate-500">Example: spread the cost over 36 months</div>
              </div>

              <ul className="space-y-3 mb-5 flex-1">
                {[
                  'All One-Time Scan inclusions',
                  'Spread the cost over 12–36 months',
                  'Priority scheduling for new aircraft',
                  'Annual re-scan for active records',
                  'Ideal for ongoing records management',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5 w-4 h-4 rounded-full bg-blue-100 flex items-center justify-center">
                      <CheckIcon className="w-2.5 h-2.5 text-blue-600" />
                    </div>
                    <span className="text-[14px] text-slate-600">{item}</span>
                  </li>
                ))}
              </ul>

              <p className="text-[11px] text-slate-400 mb-4 leading-relaxed">
                Example pricing only. Custom quotes available. Terms subject to individual agreement. Final pricing depends on aircraft count, record volume, and location.
              </p>

              <a
                href="#quote-form"
                className="w-full inline-flex items-center justify-center h-11 rounded-[10px] bg-blue-600 hover:bg-blue-700 text-white text-[14px] font-semibold transition-all shadow-sm hover:shadow-md"
              >
                Ask About Plans
              </a>
            </div>
          </div>

          <p className="text-center text-[12px] text-slate-400 mt-6">
            All pricing is illustrative. Custom quotes are provided for every engagement based on actual scope.
          </p>
        </div>
      </section>

      {/* ── SECTION 7: Lead Form ── */}
      <section id="quote-form" className="bg-white py-20 lg:py-28 border-t border-slate-100">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Section header */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-[11px] font-semibold uppercase tracking-widest mb-4">
              Get Started
            </div>
            <h2 className="text-[32px] sm:text-[38px] font-extrabold text-slate-900 tracking-tight">
              Request a Scan Quote
            </h2>
            <p className="mt-4 text-[16px] text-slate-500">
              Tell us about your aircraft and records. We&apos;ll get back to you within one business day with a firm quote.
            </p>
          </div>

          {submitted ? (
            <div className="rounded-2xl border border-green-200 bg-green-50 p-10 text-center">
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <CheckIcon className="w-7 h-7 text-green-600" />
              </div>
              <h3 className="text-[22px] font-bold text-slate-900 mb-2">Quote Request Received</h3>
              <p className="text-[15px] text-slate-600 max-w-sm mx-auto">
                Thanks! We&apos;ll review your request and reach out within one business day to discuss your scan job.
              </p>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-5"
            >
              {/* Name + Email row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[13px] font-semibold text-slate-700 mb-1.5">Full Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="John Smith"
                    value={formState.name}
                    onChange={e => setFormState(p => ({ ...p, name: e.target.value }))}
                    className="w-full h-11 px-3.5 rounded-[10px] border border-slate-200 text-[14px] text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-500 focus:shadow-[0_0_0_3px_rgba(37,99,235,0.12)] transition-all bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[13px] font-semibold text-slate-700 mb-1.5">Email Address *</label>
                  <input
                    type="email"
                    required
                    placeholder="john@example.com"
                    value={formState.email}
                    onChange={e => setFormState(p => ({ ...p, email: e.target.value }))}
                    className="w-full h-11 px-3.5 rounded-[10px] border border-slate-200 text-[14px] text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-500 focus:shadow-[0_0_0_3px_rgba(37,99,235,0.12)] transition-all bg-white"
                  />
                </div>
              </div>

              {/* Phone */}
              <div>
                <label className="block text-[13px] font-semibold text-slate-700 mb-1.5">Phone Number</label>
                <input
                  type="tel"
                  placeholder="+1 (555) 000-0000"
                  value={formState.phone}
                  onChange={e => setFormState(p => ({ ...p, phone: e.target.value }))}
                  className="w-full h-11 px-3.5 rounded-[10px] border border-slate-200 text-[14px] text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-500 focus:shadow-[0_0_0_3px_rgba(37,99,235,0.12)] transition-all bg-white"
                />
              </div>

              {/* Tail numbers */}
              <div>
                <label className="block text-[13px] font-semibold text-slate-700 mb-1.5">Aircraft Tail Number(s) *</label>
                <input
                  type="text"
                  required
                  placeholder="N4821G, N2204X"
                  value={formState.tail_numbers}
                  onChange={e => setFormState(p => ({ ...p, tail_numbers: e.target.value }))}
                  className="w-full h-11 px-3.5 rounded-[10px] border border-slate-200 text-[14px] text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-500 focus:shadow-[0_0_0_3px_rgba(37,99,235,0.12)] transition-all bg-white"
                />
                <p className="text-[11px] text-slate-400 mt-1.5">Enter one or multiple tail numbers separated by commas</p>
              </div>

              {/* Record volume dropdown */}
              <div>
                <label className="block text-[13px] font-semibold text-slate-700 mb-1.5">Estimated Record Volume *</label>
                <select
                  required
                  value={formState.record_volume}
                  onChange={e => setFormState(p => ({ ...p, record_volume: e.target.value }))}
                  className="w-full h-11 px-3.5 rounded-[10px] border border-slate-200 text-[14px] text-slate-900 outline-none focus:border-blue-500 focus:shadow-[0_0_0_3px_rgba(37,99,235,0.12)] transition-all bg-white appearance-none cursor-pointer"
                >
                  <option value="" disabled>Select number of aircraft…</option>
                  <option value="1">1 aircraft</option>
                  <option value="2-5">2–5 aircraft</option>
                  <option value="6-10">6–10 aircraft</option>
                  <option value="fleet">Fleet (11+ aircraft)</option>
                </select>
              </div>

              {/* Message */}
              <div>
                <label className="block text-[13px] font-semibold text-slate-700 mb-1.5">Additional Notes</label>
                <textarea
                  rows={4}
                  placeholder="Tell us about the condition of your records, your location, timeline, or anything else we should know…"
                  value={formState.message}
                  onChange={e => setFormState(p => ({ ...p, message: e.target.value }))}
                  className="w-full px-3.5 py-3 rounded-[10px] border border-slate-200 text-[14px] text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-500 focus:shadow-[0_0_0_3px_rgba(37,99,235,0.12)] transition-all bg-white resize-none leading-relaxed"
                />
              </div>

              {submitError && (
                <div className="px-4 py-3 rounded-[10px] bg-red-50 border border-red-200 text-red-700 text-[13px]">
                  {submitError}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full h-12 flex items-center justify-center gap-2 rounded-[10px] bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-[15px] font-semibold transition-all shadow-md hover:shadow-lg"
              >
                {submitting ? (
                  <span className="inline-flex items-center gap-1.5">
                    {[0, 1, 2].map(i => (
                      <span
                        key={i}
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background: '#fff',
                          display: 'inline-block',
                          animation: `ma-pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                        }}
                      />
                    ))}
                    <style>{`@keyframes ma-pulse{0%,60%,100%{transform:scale(0.7);opacity:0.5}30%{transform:scale(1);opacity:1}}`}</style>
                  </span>
                ) : (
                  <>
                    Send Quote Request
                    <ArrowRightIcon className="w-4 h-4" />
                  </>
                )}
              </button>

              <p className="text-center text-[12px] text-slate-400">
                We respond within 1 business day. Your information is kept strictly confidential.
              </p>
            </form>
          )}
        </div>
      </section>

      {/* ── SECTION 8: Footer ── */}
      <footer className="bg-slate-900 py-12 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            {/* Logo */}
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-[8px] bg-blue-600 flex items-center justify-center">
                <PlaneIcon className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold text-[15px] text-white tracking-tight">
                myaircraft<span className="text-blue-400">.us</span>
              </span>
            </div>

            {/* Links */}
            <nav className="flex items-center gap-1">
              {[
                { label: 'Platform', href: '/' },
                { label: 'Privacy', href: '/privacy' },
                { label: 'Terms', href: '/terms' },
                { label: 'Contact', href: 'mailto:info@myaircraft.us' },
              ].map((link, idx, arr) => (
                <span key={link.label} className="flex items-center">
                  <Link
                    href={link.href}
                    className="text-[13px] text-slate-400 hover:text-white transition-colors px-3 py-1"
                  >
                    {link.label}
                  </Link>
                  {idx < arr.length - 1 && (
                    <span className="text-slate-700 text-[12px]">·</span>
                  )}
                </span>
              ))}
            </nav>

            {/* Copyright */}
            <p className="text-[12px] text-slate-500">
              © 2025 myaircraft.us. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
