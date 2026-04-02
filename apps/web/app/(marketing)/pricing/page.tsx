'use client'
import { useState } from 'react'
import Link from 'next/link'

const plans = [
  {
    name: 'Aircraft Plan',
    price: '$100',
    period: '/aircraft/month',
    description: 'Everything you need to manage a single aircraft\'s complete history.',
    features: [
      'Unlimited users per aircraft',
      'Unlimited document storage',
      'FAA AD auto-sync',
      'Smart reminders',
      'Full logbook access',
      'AI-powered search',
      'Share with your IA',
      'PDF export',
    ],
    cta: 'Start free trial',
    href: '/signup',
    highlight: false,
  },
  {
    name: 'Mechanic Plan',
    price: '$100',
    period: '/mechanic/month',
    description: 'A professional workspace for A&P mechanics, IAs, and repair stations.',
    features: [
      'Mechanic workspace',
      'Digital sign-offs',
      'Work order management',
      'Credential tracking',
      'Access to all assigned aircraft',
      'AD lookup per aircraft',
      'Compliance reporting',
      'Client sharing',
    ],
    cta: 'Start free trial',
    href: '/signup',
    highlight: true,
  },
  {
    name: 'Scanning Service',
    price: '$1,000',
    period: '/aircraft set',
    description: 'One-time service: we scan all physical logbooks and ingest them for you.',
    features: [
      'Professional document scanning',
      'AI ingestion of all records',
      'Structured record output',
      'Human review & QA',
      'All logbooks returned',
      'Ready in 5–7 business days',
      'Includes airframe, engine & prop',
      'STCs and 337s included',
    ],
    cta: 'Book scanning',
    href: '/scanning',
    highlight: false,
    badge: 'One-time fee',
  },
]

const comparison = [
  { feature: 'Document storage', aircraft: true, mechanic: true, scanning: true },
  { feature: 'AI-powered search', aircraft: true, mechanic: true, scanning: false },
  { feature: 'FAA AD auto-sync', aircraft: true, mechanic: true, scanning: false },
  { feature: 'Smart reminders', aircraft: true, mechanic: false, scanning: false },
  { feature: 'Mechanic sign-offs', aircraft: false, mechanic: true, scanning: false },
  { feature: 'Work orders', aircraft: false, mechanic: true, scanning: false },
  { feature: 'Physical scanning', aircraft: false, mechanic: false, scanning: true },
  { feature: 'AI ingestion & QA', aircraft: false, mechanic: false, scanning: true },
]

const faqs = [
  {
    q: 'Can I add multiple aircraft?',
    a: 'Yes. Each aircraft is billed separately at $100/month. You can manage all your aircraft from a single dashboard, and mechanics can be shared across multiple aircraft.',
  },
  {
    q: 'What\'s included in the scanning service?',
    a: 'The $1,000 scanning service covers all physical logbooks for one aircraft — airframe, engine(s), propeller(s), plus any STCs, 337s, or supplemental documents you include. We scan, AI-ingest, and QA every page, then return all originals.',
  },
  {
    q: 'Is there a free trial?',
    a: 'Yes. Every plan includes a 14-day free trial. No credit card required to start. You can upload documents, try AI search, and explore the full feature set before committing.',
  },
  {
    q: 'How is billing handled?',
    a: 'Monthly or annual billing via credit card. Annual billing saves ~15%. The scanning service is a one-time payment — no subscription required for that service alone.',
  },
  {
    q: 'Can a mechanic access multiple aircraft?',
    a: 'Yes. A Mechanic Plan seat gives access to all aircraft assigned to that mechanic. Aircraft owners grant access per-aircraft, and mechanics can see all their assigned aircraft in one workspace.',
  },
]

export default function PricingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  return (
    <div className="pt-[88px]">
      {/* Hero */}
      <section className="relative py-20 overflow-hidden">
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 0%, #EFF6FF 0%, #F8F9FB 60%, #F8F9FB 100%)' }} />
        <div className="relative max-w-3xl mx-auto px-6 text-center">
          <h1 className="text-[52px] lg:text-[60px] font-extrabold text-[#0D1117] leading-[1.1] tracking-tight mb-4">
            Simple, transparent <span className="text-[#2563EB]">pricing</span>
          </h1>
          <p className="text-[20px] text-[#4B5563] leading-relaxed">
            No per-user fees for owners. No surprise charges. Start with a 14-day free trial.
          </p>
        </div>
      </section>

      {/* Plan Cards */}
      <section className="pb-20 bg-[#F8F9FB]">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid md:grid-cols-3 gap-6">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`relative rounded-[20px] p-8 flex flex-col ${
                  plan.highlight
                    ? 'bg-[#2563EB] text-white shadow-[0_8px_40px_rgba(37,99,235,0.3)]'
                    : 'bg-white border border-[#E2E8F0]'
                }`}
              >
                {plan.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="px-3 py-1 text-[12px] font-semibold text-white bg-[#1D4ED8] rounded-full border border-[rgba(255,255,255,0.2)]">Most Popular</span>
                  </div>
                )}
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="px-3 py-1 text-[12px] font-semibold text-[#2563EB] bg-[#EFF6FF] rounded-full border border-[#BFDBFE]">{plan.badge}</span>
                  </div>
                )}
                <div className="mb-6">
                  <h2 className={`font-extrabold text-[20px] mb-1 ${plan.highlight ? 'text-white' : 'text-[#0D1117]'}`}>{plan.name}</h2>
                  <p className={`text-[13px] mb-4 ${plan.highlight ? 'text-[rgba(255,255,255,0.7)]' : 'text-[#6B7280]'}`}>{plan.description}</p>
                  <div className="flex items-baseline gap-1">
                    <span className={`text-[48px] font-extrabold tracking-tight ${plan.highlight ? 'text-white' : 'text-[#0D1117]'}`}>{plan.price}</span>
                    <span className={`text-[14px] ${plan.highlight ? 'text-[rgba(255,255,255,0.7)]' : 'text-[#6B7280]'}`}>{plan.period}</span>
                  </div>
                </div>
                <ul className="space-y-2.5 mb-8 flex-1">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-center gap-2.5 text-[14px]">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={plan.highlight ? 'rgba(255,255,255,0.8)' : '#10B981'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      <span className={plan.highlight ? 'text-[rgba(255,255,255,0.9)]' : 'text-[#374151]'}>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={plan.href}
                  className={`w-full py-3.5 text-center text-[15px] font-semibold rounded-[12px] transition-all ${
                    plan.highlight
                      ? 'bg-white text-[#2563EB] hover:bg-[#F0F4FF]'
                      : 'bg-[#2563EB] text-white hover:bg-[#1D4ED8] shadow-[0_2px_8px_rgba(37,99,235,0.25)]'
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Feature Comparison */}
      <section className="py-20 bg-white">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="text-[32px] font-extrabold text-[#0D1117] tracking-tight mb-2 text-center">Feature comparison</h2>
          <p className="text-[16px] text-[#6B7280] text-center mb-10">See exactly what each plan includes.</p>
          <div className="border border-[#E2E8F0] rounded-[16px] overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-[#F8F9FB]">
                  <th className="text-left px-5 py-3.5 text-[13px] font-semibold text-[#374151]">Feature</th>
                  <th className="text-center px-5 py-3.5 text-[13px] font-semibold text-[#374151]">Aircraft</th>
                  <th className="text-center px-5 py-3.5 text-[13px] font-semibold text-[#2563EB]">Mechanic</th>
                  <th className="text-center px-5 py-3.5 text-[13px] font-semibold text-[#374151]">Scanning</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F3F7]">
                {comparison.map((row) => (
                  <tr key={row.feature} className="hover:bg-[#F8F9FB]">
                    <td className="px-5 py-3.5 text-[14px] text-[#374151]">{row.feature}</td>
                    <td className="px-5 py-3.5 text-center">
                      {row.aircraft ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto"><polyline points="20 6 9 17 4 12"/></svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mx-auto"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      {row.mechanic ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto"><polyline points="20 6 9 17 4 12"/></svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mx-auto"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      {row.scanning ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto"><polyline points="20 6 9 17 4 12"/></svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mx-auto"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 bg-[#F8F9FB]">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="text-[32px] font-extrabold text-[#0D1117] tracking-tight mb-2 text-center">Frequently asked questions</h2>
          <p className="text-[16px] text-[#6B7280] text-center mb-10">Everything you need to know about pricing.</p>
          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <div key={faq.q} className="bg-white border border-[#E2E8F0] rounded-[12px] overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-5 py-4 text-left gap-4 hover:bg-[#F8F9FB] transition-colors"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  <span className="font-medium text-[15px] text-[#0D1117]">{faq.q}</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    style={{ flexShrink: 0, transform: openFaq === i ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 200ms ease' }}>
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
                {openFaq === i && (
                  <div className="px-5 pb-4">
                    <p className="text-[14px] text-[#6B7280] leading-relaxed">{faq.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-28" style={{ background: '#0D1117' }}>
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-[42px] font-extrabold text-white tracking-tight leading-tight mb-4">
            Start your free trial today.
          </h2>
          <p className="text-[18px] text-[#9CA3AF] mb-4">14 days free. No credit card required.</p>
          <p className="text-[14px] text-[#6B7280] mb-10">Setup takes under 30 minutes.</p>
          <Link href="/signup" className="inline-flex items-center gap-2 px-8 py-4 text-[15px] font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-[12px] transition-all shadow-[0_4px_20px_rgba(37,99,235,0.4)]">
            Get started free →
          </Link>
        </div>
      </section>
    </div>
  )
}
