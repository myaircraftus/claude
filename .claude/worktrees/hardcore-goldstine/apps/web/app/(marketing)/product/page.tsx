import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Product — myaircraft.us',
  description: 'Your aircraft\'s digital brain. Full history, instant answers. AI-powered document ingestion, AD sync, maintenance tracking, and more.',
}

const capabilities = [
  {
    icon: 'upload',
    title: 'Document Ingestion',
    description: 'Upload logbooks, photos, STCs, 337s, and maintenance records. Our AI extracts and structures every entry automatically — no manual data entry.',
    bullets: ['PDF, image, and scan support', 'AI OCR for handwritten logbooks', 'Automatic field extraction', 'Version history preserved'],
  },
  {
    icon: 'shield',
    title: 'Airworthiness Directives',
    description: 'Automatically synced from the FAA. Every applicable AD is tracked against your aircraft\'s make, model, and serial number — with compliance status.',
    bullets: ['Live FAA AD database sync', 'Compliance status per AD', 'Recurring vs. one-time tracking', 'Alert on new applicable ADs'],
  },
  {
    icon: 'wrench',
    title: 'Maintenance Tracking',
    description: 'Log every inspection, repair, and modification. Track sign-offs, approvals, and work order history across the entire life of the aircraft.',
    bullets: ['Annual & 100-hour tracking', 'STC and 337 records', 'Work order history', 'Mechanic sign-off capture'],
  },
  {
    icon: 'bell',
    title: 'Smart Reminders',
    description: 'Never miss a due date. Set reminders for annuals, ELT battery replacements, pitot-static checks, and any custom interval.',
    bullets: ['Recurring interval reminders', 'Email & in-app notifications', 'Custom reminder types', 'Multi-aircraft dashboard view'],
  },
  {
    icon: 'book',
    title: 'Logbook Organization',
    description: 'All your logbooks in one place — airframe, engine, propeller, and avionics. Browse, search, and share with inspectors instantly.',
    bullets: ['Separate logbook per component', 'Full-text search across all records', 'Share with IAs via link', 'Export to PDF anytime'],
  },
  {
    icon: 'search',
    title: 'AI-Powered Search',
    description: 'Ask questions in plain English and get exact answers with page-level citations — from your documents, not the internet.',
    bullets: ['Natural language queries', 'Citation-backed answers', 'Cross-document search', 'Aircraft-scoped results'],
  },
]

const steps = [
  { step: '01', title: 'Upload Documents', description: 'Drag and drop PDFs, photos, or scanned logbooks. We also accept Google Drive links.' },
  { step: '02', title: 'AI Extracts Data', description: 'Our AI reads every page, identifies dates, tach times, part numbers, signatures, and regulatory references.' },
  { step: '03', title: 'Structured Records', description: 'Every entry is organized into a searchable, structured timeline for each aircraft component.' },
  { step: '04', title: 'Instant Answers', description: 'Ask anything in plain English. Get exact answers with the source document and page number cited.' },
]

const roles = [
  { title: 'Aircraft Owners', description: 'Know your aircraft\'s complete history at a glance. Prepare for annuals in minutes, not days.' },
  { title: 'A&P Mechanics', description: 'Access records instantly. Log work, capture sign-offs, and share with IAs without paperwork.' },
  { title: 'Inspection Authorities', description: 'Review full maintenance history before signing. Verify AD compliance with one click.' },
  { title: 'Pre-buy Inspectors', description: 'Complete logbook review in the field. Flag discrepancies and generate reports instantly.' },
]

function IconSvg({ name }: { name: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {name === 'upload' && <><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></>}
      {name === 'shield' && <><path d="M12 2l8 3.5v5.5c0 4.5-3.5 8-8 9.5C7.5 19 4 15.5 4 11V5.5L12 2z"/><polyline points="9 12 11 14 15 10"/></>}
      {name === 'wrench' && <><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></>}
      {name === 'bell' && <><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></>}
      {name === 'book' && <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></>}
      {name === 'search' && <><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>}
    </svg>
  )
}

export default function ProductPage() {
  return (
    <div className="pt-[88px]">
      {/* Hero */}
      <section className="relative py-24 overflow-hidden">
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 0%, #EFF6FF 0%, #F8F9FB 60%, #F8F9FB 100%)' }} />
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(#2563EB 1px, transparent 1px), linear-gradient(90deg, #2563EB 1px, transparent 1px)', backgroundSize: '60px 60px' }} />
        <div className="relative max-w-4xl mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#EFF6FF] border border-[#BFDBFE] text-[#2563EB] text-[13px] font-medium mb-6">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="#2563EB"><path d="M12 2l2.4 7.2H22l-6.2 4.5 2.4 7.2L12 17l-6.2 3.9 2.4-7.2L2 9.2h7.6L12 2z"/></svg>
            Aviation Document Intelligence
          </div>
          <h1 className="text-[52px] lg:text-[64px] font-extrabold text-[#0D1117] leading-[1.1] tracking-tight mb-6">
            Your Aircraft&apos;s{' '}
            <span className="text-[#2563EB]">Digital Brain</span>
          </h1>
          <p className="text-[20px] text-[#4B5563] leading-relaxed mb-10 max-w-2xl mx-auto">
            Full history, instant answers. Upload any document and ask your aircraft anything — we do the rest.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/signup" className="inline-flex items-center gap-2 px-6 py-3.5 text-[15px] font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-[12px] transition-all shadow-[0_4px_20px_rgba(37,99,235,0.3)] hover:shadow-[0_8px_32px_rgba(37,99,235,0.4)]">
              Start for free
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </Link>
            <Link href="/pricing" className="inline-flex items-center gap-2 px-6 py-3.5 text-[15px] font-medium text-[#374151] bg-white border border-[#E2E8F0] hover:bg-[#F8F9FB] rounded-[12px] transition-all shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
              See pricing
            </Link>
          </div>
        </div>
      </section>

      {/* Core Capabilities */}
      <section className="py-24 bg-white">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-[36px] font-extrabold text-[#0D1117] tracking-tight mb-4">Core capabilities</h2>
            <p className="text-[18px] text-[#6B7280] max-w-2xl mx-auto">Everything you need to manage aircraft records intelligently — in one place.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {capabilities.map((cap) => (
              <div key={cap.title} className="bg-[#F8F9FB] border border-[#E2E8F0] rounded-[16px] p-6 hover:border-[#BFDBFE] transition-colors">
                <div className="w-10 h-10 rounded-[10px] bg-[#EFF6FF] flex items-center justify-center mb-4">
                  <IconSvg name={cap.icon} />
                </div>
                <h3 className="font-semibold text-[17px] text-[#0D1117] mb-2">{cap.title}</h3>
                <p className="text-[14px] text-[#6B7280] leading-relaxed mb-4">{cap.description}</p>
                <ul className="space-y-1.5">
                  {cap.bullets.map(b => (
                    <li key={b} className="flex items-center gap-2 text-[13px] text-[#4B5563]">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-24 bg-[#F8F9FB]">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-[36px] font-extrabold text-[#0D1117] tracking-tight mb-4">How it works</h2>
            <p className="text-[18px] text-[#6B7280]">From paper to answers in four simple steps.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {steps.map((step, i) => (
              <div key={step.step} className="relative">
                {i < steps.length - 1 && (
                  <div className="hidden lg:block absolute top-5 left-[calc(100%+0px)] w-full h-px bg-[#E2E8F0] z-0" style={{ width: 'calc(100% - 20px)', left: 'calc(100% + 10px)' }} />
                )}
                <div className="bg-white border border-[#E2E8F0] rounded-[16px] p-6 relative z-10">
                  <div className="text-[28px] font-extrabold text-[#2563EB] mb-3">{step.step}</div>
                  <h3 className="font-semibold text-[16px] text-[#0D1117] mb-2">{step.title}</h3>
                  <p className="text-[13px] text-[#6B7280] leading-relaxed">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* For Every Aviation Professional */}
      <section className="py-24 bg-white">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-[36px] font-extrabold text-[#0D1117] tracking-tight mb-4">For every aviation professional</h2>
            <p className="text-[18px] text-[#6B7280]">Whether you own one airplane or maintain a fleet — myaircraft.us works for you.</p>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            {roles.map((role) => (
              <div key={role.title} className="flex gap-4 p-6 bg-[#F8F9FB] border border-[#E2E8F0] rounded-[16px]">
                <div className="w-10 h-10 rounded-[10px] bg-[#EFF6FF] flex items-center justify-center flex-shrink-0">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-[16px] text-[#0D1117] mb-1">{role.title}</h3>
                  <p className="text-[14px] text-[#6B7280] leading-relaxed">{role.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-28" style={{ background: '#0D1117' }}>
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-[42px] font-extrabold text-white tracking-tight leading-tight mb-4">
            Ready to get started?
          </h2>
          <p className="text-[18px] text-[#9CA3AF] mb-10">Set up your aircraft workspace in minutes. No credit card required.</p>
          <Link href="/signup" className="inline-flex items-center gap-2 px-8 py-4 text-[15px] font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-[12px] transition-all shadow-[0_4px_20px_rgba(37,99,235,0.4)]">
            Start for free →
          </Link>
        </div>
      </section>
    </div>
  )
}
