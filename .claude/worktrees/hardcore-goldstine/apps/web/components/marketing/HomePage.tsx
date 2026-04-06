'use client'
import Link from 'next/link'

// ─── Hero ──────────────────────────────────────────────────────────────────────

function HeroSection() {
  return (
    <section className="bg-gradient-to-b from-[#f0f4fa] to-white pt-24 pb-20">
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left */}
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[13px] font-medium mb-6" style={{ background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="#1d4ed8"><path d="M12 2l2.4 7.2H22l-6.2 4.5 2.4 7.2L12 17l-6.2 3.9 2.4-7.2L2 9.2h7.6L12 2z"/></svg>
              Aviation Document Intelligence
            </div>
            <h1 className="text-[52px] lg:text-[60px] font-extrabold text-[#0f172a] leading-[1.1] tracking-tight mb-6">
              Ask your aircraft{' '}
              <span style={{ color: '#0c2d6b' }}>anything.</span>
            </h1>
            <p className="text-[18px] text-[#475569] leading-relaxed mb-8 max-w-lg">
              Upload logbooks, POH, manuals, and maintenance records. Ask questions in plain English. Get exact answers with page-level citations — from your documents, not the internet.
            </p>
            <div className="flex flex-wrap gap-3 mb-10">
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 px-6 py-3.5 text-[15px] font-semibold text-white rounded-xl transition-all"
                style={{ background: '#0c2d6b', boxShadow: '0 4px 20px rgba(12,45,107,0.3)' }}
              >
                Launch App
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center gap-2 px-6 py-3.5 text-[15px] font-medium text-[#374151] bg-white rounded-xl transition-all"
                style={{ border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
              >
                View Pricing
              </Link>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {['Citation-backed answers', 'Aircraft-by-aircraft organization', 'Secure team access'].map(t => (
                <span key={t} className="flex items-center gap-1.5 text-[13px] text-[#64748b]">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  {t}
                </span>
              ))}
            </div>
          </div>

          {/* Right — aircraft image with floating card */}
          <div className="relative flex justify-center lg:justify-end">
            <div className="relative">
              <img
                src="https://images.unsplash.com/photo-1690977088513-66984778b5ae?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxzbWFsbCUyMGFpcnBsYW5lJTIwZmx5aW5nJTIwYmx1ZSUyMHNreXxlbnwxfHx8fDE3NzUxMzE0OTh8MA&ixlib=rb-4.1.0&q=80&w=1080"
                alt="Small aircraft flying"
                className="rounded-2xl w-full max-w-[520px] object-cover"
                style={{ height: 380, boxShadow: '0 20px 60px rgba(12,45,107,0.15)' }}
              />
              {/* Floating status card */}
              <div
                className="absolute -bottom-5 -left-5 bg-white rounded-xl p-4 flex items-center gap-3"
                style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.12)', border: '1px solid rgba(15,23,42,0.06)' }}
              >
                <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: '#ecfdf5' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-[#0f172a]">N12345 — Airworthy</p>
                  <p className="text-[11px] text-[#64748b]">Annual due in 47 days</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ─── Trust strip ───────────────────────────────────────────────────────────────

function TrustStrip() {
  return (
    <section className="bg-white" style={{ borderBottom: '1px solid #e2e8f0' }}>
      <div className="max-w-6xl mx-auto px-6 py-8">
        <p className="text-center text-[13px] text-[#94a3b8] font-medium mb-6">
          Trusted by owners and operators of
        </p>
        <div className="flex flex-wrap justify-center gap-x-10 gap-y-3">
          {['Cessna', 'Piper', 'Beechcraft', 'Cirrus', 'Mooney', 'Diamond', 'Bonanza'].map(brand => (
            <span key={brand} className="text-[15px] font-semibold text-[#cbd5e1]">{brand}</span>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── How it works ──────────────────────────────────────────────────────────────

function HowItWorks() {
  const steps = [
    { num: '01', title: 'Upload & Scan', desc: 'Upload PDFs, photos of logbooks, work orders, POH — any aviation document.' },
    { num: '02', title: 'AI Classifies', desc: 'Our AI automatically identifies document type, aircraft, dates, and key data.' },
    { num: '03', title: 'Ask Anything', desc: 'Ask questions in plain English. Get answers with exact page citations.' },
    { num: '04', title: 'Generate & Act', desc: 'Create maintenance entries, compliance reports, and reminders automatically.' },
  ]

  return (
    <section id="how-it-works" className="bg-white py-24">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-14">
          <h2 className="text-[36px] font-bold text-[#0f172a] tracking-tight mb-3">How it works</h2>
          <p className="text-[16px] text-[#64748b] max-w-lg mx-auto">Four steps from paper records to an intelligent, searchable knowledge base.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map(step => (
            <div key={step.num} className="relative">
              <div className="text-[11px] font-bold tracking-widest text-[#0c2d6b] mb-3 uppercase">{step.num}</div>
              <h3 className="text-[16px] font-semibold text-[#0f172a] mb-2">{step.title}</h3>
              <p className="text-[14px] text-[#64748b] leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Features ─────────────────────────────────────────────────────────────────

function FeaturesSection() {
  const features = [
    { title: 'Records Intelligence', desc: 'Every document is classified, indexed, and cross-referenced. Find anything in seconds.', icon: '📂' },
    { title: 'Compliance Tracking', desc: 'Track AD compliance, inspection due dates, and regulatory requirements automatically.', icon: '✅' },
    { title: 'Maintenance History', desc: 'Complete timeline of every maintenance event extracted from your logbooks and work orders.', icon: '🔧' },
    { title: 'Smart Reminders', desc: 'Never miss an annual, 100-hour, transponder check, or custom maintenance interval.', icon: '🔔' },
    { title: 'Secure & Auditable', desc: 'SOC 2-aligned infrastructure. Every document access is logged and auditable.', icon: '🔒' },
    { title: 'Team Collaboration', desc: 'Share aircraft records with your A&P, IA, or co-owner with role-based access control.', icon: '👥' },
  ]

  return (
    <section className="py-24" style={{ background: '#f8f9fb' }}>
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-14">
          <h2 className="text-[36px] font-bold text-[#0f172a] tracking-tight mb-3">Everything your aircraft records need</h2>
          <p className="text-[16px] text-[#64748b] max-w-lg mx-auto">Built specifically for aviation documentation requirements.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map(f => (
            <div
              key={f.title}
              className="bg-white rounded-2xl p-6"
              style={{ border: '1px solid rgba(15,23,42,0.06)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
            >
              <div className="text-[28px] mb-3">{f.icon}</div>
              <h3 className="text-[15px] font-semibold text-[#0f172a] mb-2">{f.title}</h3>
              <p className="text-[13px] text-[#64748b] leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Solutions ─────────────────────────────────────────────────────────────────

function SolutionsSection() {
  const solutions = [
    { title: 'Aircraft Owners', desc: 'Keep all your records organized, searchable, and always accessible from any device.', href: '/solutions' },
    { title: 'A&P Mechanics & IAs', desc: 'Access complete maintenance history, generate logbook entries, and track compliance.', href: '/solutions' },
    { title: 'Fleet Operators', desc: 'Manage multiple aircraft with fleet-level visibility into compliance and maintenance status.', href: '/solutions' },
    { title: 'Brokers & Buyers', desc: 'Instantly understand the complete history of any aircraft before a transaction.', href: '/solutions' },
  ]

  return (
    <section className="bg-white py-24">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-14">
          <h2 className="text-[36px] font-bold text-[#0f172a] tracking-tight mb-3">Built for everyone in aviation</h2>
          <p className="text-[16px] text-[#64748b]">Whether you own one aircraft or manage a fleet.</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-5">
          {solutions.map(s => (
            <Link key={s.title} href={s.href}>
              <div
                className="rounded-2xl p-7 hover:shadow-md transition-all cursor-pointer group"
                style={{ border: '1px solid rgba(15,23,42,0.08)', background: '#f8f9fb' }}
              >
                <h3 className="text-[17px] font-semibold text-[#0f172a] mb-2 group-hover:text-[#0c2d6b] transition-colors">{s.title}</h3>
                <p className="text-[14px] text-[#64748b] leading-relaxed">{s.desc}</p>
                <div className="mt-4 flex items-center gap-1 text-[13px] text-[#0c2d6b] font-medium">
                  Learn more
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Scanning CTA ──────────────────────────────────────────────────────────────

function ScanningCTA() {
  return (
    <section className="py-24" style={{ background: '#f8f9fb' }}>
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <span
              className="inline-block text-[12px] font-semibold uppercase tracking-wider mb-4 px-3 py-1 rounded-full"
              style={{ background: '#e8edf5', color: '#0c2d6b' }}
            >
              Professional Scanning Service
            </span>
            <h2 className="text-[32px] font-bold text-[#0f172a] tracking-tight mb-4">
              We&apos;ll scan your paper records for you
            </h2>
            <p className="text-[15px] text-[#64748b] leading-relaxed mb-6">
              Ship us your logbooks, maintenance records, and manuals. We&apos;ll professionally scan, classify, and upload everything into your account. Starting at $1,000.
            </p>
            <ul className="space-y-3 mb-8">
              {[
                'Professional flatbed scanning at 600 DPI',
                'AI-powered classification and indexing',
                'Secure round-trip shipping',
                'Your records back in 5–7 business days',
              ].map(item => (
                <li key={item} className="flex items-center gap-2.5 text-[14px] text-[#374151]">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  {item}
                </li>
              ))}
            </ul>
            <Link
              href="/scanning"
              className="inline-flex items-center gap-2 px-6 py-3 text-[14px] font-semibold text-white rounded-xl transition-all"
              style={{ background: '#0c2d6b' }}
            >
              Learn about scanning
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </Link>
          </div>
          <div className="relative">
            <div
              className="rounded-2xl overflow-hidden"
              style={{ boxShadow: '0 20px 60px rgba(12,45,107,0.1)' }}
            >
              <img
                src="https://images.unsplash.com/photo-1760089885613-e8861963223a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjZXNzbmElMjBhaXJwbGFuZSUyMGhhbmdhcnxlbnwxfHx8fDE3NzUxMzE0OTd8MA&ixlib=rb-4.1.0&q=80&w=800"
                alt="Aircraft in hangar"
                className="w-full object-cover"
                style={{ height: 360 }}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ─── Security ─────────────────────────────────────────────────────────────────

function SecuritySection() {
  return (
    <section className="bg-white py-20">
      <div className="max-w-4xl mx-auto px-6 text-center">
        <h2 className="text-[30px] font-bold text-[#0f172a] tracking-tight mb-3">Your data is safe with us</h2>
        <p className="text-[15px] text-[#64748b] mb-12">Built on enterprise-grade infrastructure with aviation-specific security practices.</p>
        <div className="grid sm:grid-cols-3 gap-8">
          {[
            { title: 'End-to-End Encryption', desc: 'All documents encrypted at rest and in transit using AES-256.' },
            { title: 'Access Controls', desc: 'Role-based permissions ensure the right people see the right records.' },
            { title: 'Audit Logging', desc: 'Every document access and change is logged for compliance and accountability.' },
          ].map(item => (
            <div key={item.title}>
              <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(12,45,107,0.08)' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0c2d6b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2l8 3.5v5.5c0 4.5-3.5 8-8 9.5C7.5 19 4 15.5 4 11V5.5L12 2z"/>
                  <polyline points="9 12 11 14 15 10"/>
                </svg>
              </div>
              <h3 className="text-[15px] font-semibold text-[#0f172a] mb-2">{item.title}</h3>
              <p className="text-[13px] text-[#64748b] leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Final CTA ─────────────────────────────────────────────────────────────────

function FinalCTA() {
  return (
    <section className="py-24" style={{ background: '#0c2d6b' }}>
      <div className="max-w-3xl mx-auto px-6 text-center">
        <h2 className="text-[40px] font-bold text-white tracking-tight mb-4 leading-tight">
          Your aircraft records, finally organized.
        </h2>
        <p className="text-[16px] mb-10" style={{ color: 'rgba(255,255,255,0.7)' }}>
          Join aircraft owners, mechanics, and operators who rely on myaircraft to manage their records.
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 px-8 py-4 text-[15px] font-semibold text-[#0c2d6b] bg-white rounded-xl transition-all hover:bg-[#f1f3f8]"
          >
            Get Started Free
          </Link>
          <Link
            href="/pricing"
            className="inline-flex items-center gap-2 px-8 py-4 text-[15px] font-semibold text-white rounded-xl transition-all"
            style={{ border: '2px solid rgba(255,255,255,0.3)' }}
          >
            View Pricing
          </Link>
        </div>
        <p className="text-[13px] mt-6" style={{ color: 'rgba(255,255,255,0.45)' }}>
          14-day free trial. No credit card required.
        </p>
      </div>
    </section>
  )
}

// ─── Export ────────────────────────────────────────────────────────────────────

export function HomePage() {
  return (
    <>
      <HeroSection />
      <TrustStrip />
      <HowItWorks />
      <FeaturesSection />
      <SolutionsSection />
      <ScanningCTA />
      <SecuritySection />
      <FinalCTA />
    </>
  )
}
