import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Solutions — myaircraft.us',
  description: 'Built for every role in aviation. Whether you own one aircraft or manage a fleet, myaircraft.us has you covered.',
}

const roles = [
  {
    title: 'Aircraft Owners',
    icon: 'plane',
    tagline: 'Know your aircraft completely',
    painPoints: [
      'Logbooks scattered across binders and folders',
      'Can\'t quickly verify AD compliance before a flight',
      'Preparing for an annual takes days of document hunting',
    ],
    solution: 'One place for every document, every entry, every AD. Ask questions in plain English and get answers backed by your own records — not guesses.',
    features: ['Full logbook history', 'AD compliance dashboard', 'Annual prep checklist', 'Share with your IA instantly'],
  },
  {
    title: 'A&P Mechanics',
    icon: 'wrench',
    tagline: 'Work smarter, sign off faster',
    painPoints: [
      'Digging through paper records to verify prior work',
      'Manually looking up applicable ADs for each aircraft',
      'Work orders and sign-offs buried in filing cabinets',
    ],
    solution: 'Access a complete maintenance history the moment you open a work order. Pull up applicable ADs automatically. Log work and capture your sign-off digitally.',
    features: ['Mechanic workspace', 'Digital sign-offs', 'Work order history', 'AD lookup per aircraft'],
  },
  {
    title: 'Inspection Authorities',
    icon: 'clipboard',
    tagline: 'Sign with confidence',
    painPoints: [
      'Incomplete records presented at annual time',
      'Verifying AD compliance manually across dozens of ADs',
      'No audit trail for prior sign-offs',
    ],
    solution: 'Review the full maintenance history before signing anything. Verify every AD is addressed. Download a complete compliance report in one click.',
    features: ['Full record review', 'AD compliance verification', 'Compliance report export', 'Prior IA sign-off history'],
  },
  {
    title: 'Pre-buy Inspectors',
    icon: 'search',
    tagline: 'Complete logbook review in the field',
    painPoints: [
      'Physical logbooks only — no way to search or cross-reference',
      'Missing entries discovered after purchase',
      'No structured report to share with buyers',
    ],
    solution: 'Upload photos of logbooks on-site and get a structured review with flagged discrepancies, missing entries, and AD gaps — before the deal closes.',
    features: ['On-site photo upload', 'Discrepancy flagging', 'Structured PDF report', 'Share with buyer instantly'],
  },
  {
    title: 'Buyers & Sellers',
    icon: 'handshake',
    tagline: 'Build trust, close faster',
    painPoints: [
      'Buyers can\'t verify aircraft history without physical access',
      'Sellers struggle to present records professionally',
      'Disputes about record completeness delay or kill deals',
    ],
    solution: 'Sellers can present a complete, professional digital record package. Buyers can verify everything before traveling to inspect.',
    features: ['Digital record package', 'Shareable history report', 'AD compliance summary', 'Verified document library'],
  },
  {
    title: 'Fleet Managers',
    icon: 'grid',
    tagline: 'Manage your entire fleet in one view',
    painPoints: [
      'No centralized view of what\'s due across multiple aircraft',
      'Missed ADs or inspections on low-utilization aircraft',
      'Coordinating maintenance across multiple mechanics',
    ],
    solution: 'Fleet-level dashboard shows every aircraft\'s status at a glance. Upcoming inspections, overdue items, and AD gaps surfaced automatically.',
    features: ['Fleet dashboard', 'Cross-aircraft AD tracking', 'Multi-mechanic access', 'Bulk reminder setup'],
  },
]

function RoleIcon({ name }: { name: string }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {name === 'plane' && <><path d="M21 16v-2l-8-5V3.5A1.5 1.5 0 0 0 11.5 2h0A1.5 1.5 0 0 0 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></>}
      {name === 'wrench' && <><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></>}
      {name === 'clipboard' && <><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="11" y2="16"/></>}
      {name === 'search' && <><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>}
      {name === 'handshake' && <><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/></>}
      {name === 'grid' && <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>}
    </svg>
  )
}

export default function SolutionsPage() {
  return (
    <div className="pt-[88px]">
      {/* Hero */}
      <section className="relative py-24 overflow-hidden">
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 0%, #EFF6FF 0%, #F8F9FB 60%, #F8F9FB 100%)' }} />
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(#2563EB 1px, transparent 1px), linear-gradient(90deg, #2563EB 1px, transparent 1px)', backgroundSize: '60px 60px' }} />
        <div className="relative max-w-4xl mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#EFF6FF] border border-[#BFDBFE] text-[#2563EB] text-[13px] font-medium mb-6">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            Built for every role
          </div>
          <h1 className="text-[52px] lg:text-[64px] font-extrabold text-[#0D1117] leading-[1.1] tracking-tight mb-6">
            Built for <span className="text-[#2563EB]">every role</span><br />in aviation
          </h1>
          <p className="text-[20px] text-[#4B5563] leading-relaxed max-w-2xl mx-auto">
            From solo aircraft owners to fleet operators — myaircraft.us adapts to how you work.
          </p>
        </div>
      </section>

      {/* Role Cards */}
      <section className="py-16 bg-white">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-8">
            {roles.map((role) => (
              <div key={role.title} className="bg-[#F8F9FB] border border-[#E2E8F0] rounded-[20px] p-8 hover:border-[#BFDBFE] transition-colors">
                <div className="flex items-start gap-4 mb-5">
                  <div className="w-12 h-12 rounded-[12px] bg-[#EFF6FF] flex items-center justify-center flex-shrink-0">
                    <RoleIcon name={role.icon} />
                  </div>
                  <div>
                    <h2 className="font-extrabold text-[20px] text-[#0D1117]">{role.title}</h2>
                    <p className="text-[14px] text-[#2563EB] font-medium">{role.tagline}</p>
                  </div>
                </div>

                <div className="mb-5">
                  <p className="text-[12px] font-semibold text-[#9CA3AF] uppercase tracking-wide mb-2">Common challenges</p>
                  <ul className="space-y-1.5">
                    {role.painPoints.map(p => (
                      <li key={p} className="flex items-start gap-2 text-[13px] text-[#6B7280]">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 flex-shrink-0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>

                <p className="text-[14px] text-[#374151] leading-relaxed mb-5">{role.solution}</p>

                <div className="flex flex-wrap gap-2">
                  {role.features.map(f => (
                    <span key={f} className="px-2.5 py-1 text-[12px] font-medium text-[#2563EB] bg-[#EFF6FF] rounded-[6px]">{f}</span>
                  ))}
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
            Find your fit.
          </h2>
          <p className="text-[18px] text-[#9CA3AF] mb-10">Every plan includes all features. Start with one aircraft or one mechanic seat.</p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="/signup" className="inline-flex items-center gap-2 px-8 py-4 text-[15px] font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-[12px] transition-all shadow-[0_4px_20px_rgba(37,99,235,0.4)]">
              Start for free →
            </Link>
            <Link href="/pricing" className="inline-flex items-center gap-2 px-8 py-4 text-[15px] font-medium text-white border border-[#2A3347] hover:border-[#4B5563] rounded-[12px] transition-all">
              View pricing
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
