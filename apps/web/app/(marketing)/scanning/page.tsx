import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Scanning Service — myaircraft.us',
  description: 'Professional document scanning and AI ingestion. Transform decades of paper logbooks into searchable, structured records.',
}

const serviceTypes = [
  {
    icon: 'home',
    title: 'Onsite Scanning',
    badge: 'We come to you',
    description: 'Our scanning team comes to your hangar or FBO. We bring all equipment and scan every document on-site — no shipping required.',
    features: [
      'Schedule at your convenience',
      'We bring all scanning equipment',
      'Complete in one visit',
      'No risk of documents being lost in transit',
      'Ideal for large collections or fragile logbooks',
      'Available nationwide',
    ],
  },
  {
    icon: 'mail',
    title: 'Mail-in Scanning',
    badge: 'Ship to us',
    description: 'Ship us your logbooks using our prepaid shipping label. We scan, ingest, and return all originals within 5–7 business days.',
    features: [
      'Prepaid shipping label provided',
      'Insured shipment both ways',
      'Originals returned via tracked mail',
      'Turnaround in 5–7 business days',
      'Status updates via email',
      'Ideal for remote customers',
    ],
  },
]

const processSteps = [
  { step: '01', title: 'Schedule', description: 'Book your scanning appointment online. Choose onsite or mail-in.' },
  { step: '02', title: 'Ship or We Come', description: 'Mail-in: we send a prepaid label. Onsite: we schedule a visit to your location.' },
  { step: '03', title: 'Scan & Ingest', description: 'Every page is professionally scanned at 600 DPI and processed through our AI ingestion pipeline.' },
  { step: '04', title: 'Review & Approve', description: 'You get a preview of all extracted records before they\'re finalized. Flag anything that needs correction.' },
  { step: '05', title: 'Ready in Days', description: 'Your complete, searchable aircraft record is live in myaircraft.us within 5–7 business days.' },
]

const includedDocs = [
  'Airframe logbook',
  'Engine logbook(s)',
  'Propeller logbook(s)',
  'Avionics logs',
  'STC documentation',
  'FAA Form 337s',
  'Owner-produced parts records',
  'Weight & balance records',
  'Pilot Operating Handbook (POH)',
  'Airworthiness certificates',
]

export default function ScanningPage() {
  return (
    <div className="pt-[88px]">
      {/* Hero */}
      <section className="relative py-24 overflow-hidden">
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 0%, #EFF6FF 0%, #F8F9FB 60%, #F8F9FB 100%)' }} />
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(#2563EB 1px, transparent 1px), linear-gradient(90deg, #2563EB 1px, transparent 1px)', backgroundSize: '60px 60px' }} />
        <div className="relative max-w-4xl mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#EFF6FF] border border-[#BFDBFE] text-[#2563EB] text-[13px] font-medium mb-6">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
            Professional Document Scanning
          </div>
          <h1 className="text-[52px] lg:text-[64px] font-extrabold text-[#0D1117] leading-[1.1] tracking-tight mb-6">
            Paper logbooks,{' '}
            <span className="text-[#2563EB]">digitized.</span>
          </h1>
          <p className="text-[20px] text-[#4B5563] leading-relaxed mb-6 max-w-2xl mx-auto">
            Transform decades of handwritten logbooks into searchable, structured records — with full AI ingestion and human QA.
          </p>

          {/* Announcement banner */}
          <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-[10px] bg-[#F0FDF4] border border-[#BBF7D0] text-[#16A34A] text-[14px] font-medium mb-10">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            Free setup assistance included with every plan
          </div>

          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/signup" className="inline-flex items-center gap-2 px-6 py-3.5 text-[15px] font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-[12px] transition-all shadow-[0_4px_20px_rgba(37,99,235,0.3)]">
              Book scanning appointment →
            </Link>
            <Link href="/pricing" className="inline-flex items-center gap-2 px-6 py-3.5 text-[15px] font-medium text-[#374151] bg-white border border-[#E2E8F0] hover:bg-[#F8F9FB] rounded-[12px] transition-all">
              View pricing
            </Link>
          </div>
        </div>
      </section>

      {/* Service Types */}
      <section className="py-20 bg-white">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-14">
            <h2 className="text-[36px] font-extrabold text-[#0D1117] tracking-tight mb-3">Two ways to get scanned</h2>
            <p className="text-[18px] text-[#6B7280]">Choose the option that works best for your situation.</p>
          </div>
          <div className="grid md:grid-cols-2 gap-8">
            {serviceTypes.map((service) => (
              <div key={service.title} className="bg-[#F8F9FB] border border-[#E2E8F0] rounded-[20px] p-8 hover:border-[#BFDBFE] transition-colors">
                <div className="flex items-start gap-4 mb-5">
                  <div className="w-12 h-12 rounded-[12px] bg-[#EFF6FF] flex items-center justify-center flex-shrink-0">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      {service.icon === 'home' && <><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></>}
                      {service.icon === 'mail' && <><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></>}
                    </svg>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-extrabold text-[20px] text-[#0D1117]">{service.title}</h3>
                      <span className="px-2 py-0.5 text-[11px] font-semibold text-[#2563EB] bg-[#EFF6FF] rounded-[5px]">{service.badge}</span>
                    </div>
                    <p className="text-[14px] text-[#6B7280] leading-relaxed">{service.description}</p>
                  </div>
                </div>
                <ul className="space-y-2">
                  {service.features.map(f => (
                    <li key={f} className="flex items-center gap-2 text-[14px] text-[#374151]">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Process Steps */}
      <section className="py-20 bg-[#F8F9FB]">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-14">
            <h2 className="text-[36px] font-extrabold text-[#0D1117] tracking-tight mb-3">How it works</h2>
            <p className="text-[18px] text-[#6B7280]">From scheduling to searchable records in under a week.</p>
          </div>
          <div className="relative">
            <div className="hidden md:block absolute top-8 left-[10%] right-[10%] h-px bg-[#E2E8F0]" />
            <div className="grid md:grid-cols-5 gap-4">
              {processSteps.map((step) => (
                <div key={step.step} className="relative">
                  <div className="bg-white border border-[#E2E8F0] rounded-[16px] p-5 text-center relative z-10 hover:border-[#BFDBFE] transition-colors">
                    <div className="w-10 h-10 rounded-full bg-[#EFF6FF] border-2 border-[#BFDBFE] flex items-center justify-center mx-auto mb-3">
                      <span className="text-[13px] font-extrabold text-[#2563EB]">{step.step}</span>
                    </div>
                    <h3 className="font-semibold text-[14px] text-[#0D1117] mb-1.5">{step.title}</h3>
                    <p className="text-[12px] text-[#6B7280] leading-relaxed">{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* What's Included */}
      <section className="py-20 bg-white">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-[36px] font-extrabold text-[#0D1117] tracking-tight mb-4">What&apos;s included</h2>
              <p className="text-[17px] text-[#6B7280] leading-relaxed mb-6">
                We scan and ingest every document associated with your aircraft. If it&apos;s in the records, it gets digitized.
              </p>
              <div className="flex items-baseline gap-3 mb-2">
                <span className="text-[42px] font-extrabold text-[#0D1117]">$1,000</span>
                <span className="text-[16px] text-[#6B7280]">per aircraft set</span>
              </div>
              <p className="text-[13px] text-[#9CA3AF] mb-8">One-time fee. All originals returned. No subscription required.</p>
              <Link href="/signup" className="inline-flex items-center gap-2 px-6 py-3.5 text-[15px] font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-[12px] transition-all shadow-[0_4px_20px_rgba(37,99,235,0.3)]">
                Book your scanning →
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {includedDocs.map(doc => (
                <div key={doc} className="flex items-center gap-2.5 p-3 bg-[#F8F9FB] border border-[#E2E8F0] rounded-[10px]">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  <span className="text-[13px] text-[#374151] font-medium">{doc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-28" style={{ background: '#0D1117' }}>
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-[42px] font-extrabold text-white tracking-tight leading-tight mb-4">
            Ready to digitize your records?
          </h2>
          <p className="text-[18px] text-[#9CA3AF] mb-10">Book your scanning appointment today. We handle everything.</p>
          <Link href="/signup" className="inline-flex items-center gap-2 px-8 py-4 text-[15px] font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-[12px] transition-all shadow-[0_4px_20px_rgba(37,99,235,0.4)]">
            Book scanning appointment →
          </Link>
        </div>
      </section>
    </div>
  )
}
