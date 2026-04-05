'use client'

import { useState } from 'react'

type PersonaKey = 'pilot' | 'owner' | 'mechanic'

interface Step {
  title: string
  detail: string
  icon: string
}

interface Persona {
  key: PersonaKey
  label: string
  emoji: string
  color: string
  bgColor: string
  borderColor: string
  headline: string
  flow: Step[]
  outputs: string[]
  sampleQuery: string
  sampleAnswer: string
}

const PERSONAS: Persona[] = [
  {
    key: 'pilot',
    label: 'Pilot',
    emoji: '🛩️',
    color: 'text-sky-700',
    bgColor: 'bg-sky-50',
    borderColor: 'border-sky-300',
    headline: 'Flight-ready in seconds.',
    flow: [
      { title: 'Upload POH', detail: 'Drop the PDF. We index every page.', icon: '📄' },
      { title: 'Ask plainly', detail: '"V-speeds at max gross?"', icon: '💬' },
      { title: 'Get cited answer', detail: 'Exact page, exact section.', icon: '✅' },
      { title: 'Fly confident', detail: 'No more flipping through binders.', icon: '✈️' },
    ],
    outputs: [
      'V-speeds, limitations, W&B',
      'Emergency procedures',
      'Logbook & currency status',
      'Upcoming inspections',
    ],
    sampleQuery: 'What\'s the max demonstrated crosswind for a C172S?',
    sampleAnswer: '15 knots per POH §2 Limitations, p. 2-8.',
  },
  {
    key: 'owner',
    label: 'Aircraft Owner',
    emoji: '🏆',
    color: 'text-amber-700',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-300',
    headline: 'Every record, one place.',
    flow: [
      { title: 'Upload logbooks', detail: 'Airframe, engine, prop — all of them.', icon: '📚' },
      { title: 'Sync FAA data', detail: 'ADs auto-applied by model & serial.', icon: '🔄' },
      { title: 'Ask anything', detail: '"Last annual? Outstanding SBs?"', icon: '💬' },
      { title: 'Sell with proof', detail: 'Prebuy package in one click.', icon: '💼' },
    ],
    outputs: [
      'Maintenance liability view',
      'AD compliance status',
      'Records integrity score',
      'Team access controls',
    ],
    sampleQuery: 'When was the last IFR cert on N12345?',
    sampleAnswer: 'Mar 14, 2025, logbook p. 47 — expires Mar 2027.',
  },
  {
    key: 'mechanic',
    label: 'Mechanic / IA',
    emoji: '🔧',
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-300',
    headline: 'Spec to sign-off, fast.',
    flow: [
      { title: 'Upload service manuals', detail: 'OEM manuals, SBs, ADs.', icon: '📖' },
      { title: 'Search by part or task', detail: '"Torque on MLG axle nut?"', icon: '🔍' },
      { title: 'Verify applicability', detail: 'AD check for this exact serial.', icon: '📋' },
      { title: 'Document sign-off', detail: 'Cite sources in your entry.', icon: '✍️' },
    ],
    outputs: [
      'Torque specs & procedures',
      'AD & SB applicability',
      'Work order history',
      'OCR\'d logbook pages',
    ],
    sampleQuery: 'Landing gear rigging for PA28-181 G1000?',
    sampleAnswer: 'Service Manual §32-10-00, 4 steps, p. 32-14.',
  },
]

export function RolePersonaDiagram() {
  const [selected, setSelected] = useState<PersonaKey>('pilot')
  const persona = PERSONAS.find((p) => p.key === selected) ?? PERSONAS[0]

  return (
    <section id="role-diagram" className="py-24 bg-white">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#EFF6FF] border border-[#BFDBFE] text-[#2563EB] text-[12px] font-semibold uppercase tracking-wide mb-4">
            Pick your role
          </div>
          <h2 className="text-[38px] font-extrabold text-[#0D1117] tracking-tight mb-3">
            See what you&apos;ll get.
          </h2>
          <p className="text-[17px] text-[#6B7280] max-w-2xl mx-auto">
            Every role in aviation has a different workflow. Click a persona to see your path from
            upload → answer.
          </p>
        </div>

        {/* Persona selector tabs */}
        <div className="flex flex-wrap justify-center gap-2 mb-10">
          {PERSONAS.map((p) => (
            <button
              key={p.key}
              onClick={() => setSelected(p.key)}
              className={`group inline-flex items-center gap-2 px-5 py-3 rounded-[14px] border-2 font-semibold text-[15px] transition-all ${
                selected === p.key
                  ? `${p.bgColor} ${p.borderColor} ${p.color} shadow-[0_4px_20px_rgba(0,0,0,0.08)] scale-105`
                  : 'bg-white border-[#E2E8F0] text-[#6B7280] hover:border-[#CBD5E1]'
              }`}
            >
              <span className="text-xl">{p.emoji}</span>
              {p.label}
            </button>
          ))}
        </div>

        {/* Diagram */}
        <div
          className={`p-8 md:p-10 rounded-[24px] border-2 ${persona.borderColor} ${persona.bgColor}/40 transition-all`}
        >
          <h3 className={`text-[28px] font-extrabold mb-8 text-center ${persona.color}`}>
            {persona.headline}
          </h3>

          {/* Flow diagram */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 md:gap-2 mb-10">
            {persona.flow.map((step, i) => (
              <div key={i} className="relative">
                {/* Arrow connector (desktop only) */}
                {i < persona.flow.length - 1 && (
                  <div className="hidden md:flex absolute top-[44px] -right-2 w-4 items-center justify-center z-10 pointer-events-none">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={persona.color}>
                      <line x1="5" y1="12" x2="19" y2="12" />
                      <polyline points="12 5 19 12 12 19" />
                    </svg>
                  </div>
                )}
                {/* Step card */}
                <div className="bg-white rounded-[16px] p-5 border-2 border-white shadow-[0_2px_8px_rgba(0,0,0,0.04)] h-full">
                  <div className="flex items-center gap-2 mb-3">
                    <div className={`w-8 h-8 rounded-full ${persona.bgColor} ${persona.color} flex items-center justify-center text-[13px] font-bold border-2 ${persona.borderColor}`}>
                      {i + 1}
                    </div>
                    <span className="text-2xl">{step.icon}</span>
                  </div>
                  <p className="font-bold text-[15px] text-[#0D1117] mb-1">{step.title}</p>
                  <p className="text-[13px] text-[#6B7280] leading-relaxed">{step.detail}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Outputs + sample */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* What you get */}
            <div className="bg-white rounded-[16px] p-6 border border-[#E2E8F0]">
              <h4 className="font-bold text-[15px] text-[#0D1117] mb-4 flex items-center gap-2">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                What you get
              </h4>
              <ul className="space-y-2">
                {persona.outputs.map((o) => (
                  <li key={o} className="flex items-start gap-2 text-[14px] text-[#374151]">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={persona.color.includes('sky') ? '#0284c7' : persona.color.includes('amber') ? '#d97706' : '#2563eb'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mt-1.5 flex-shrink-0"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>
                    {o}
                  </li>
                ))}
              </ul>
            </div>

            {/* Sample query */}
            <div className="bg-white rounded-[16px] p-6 border border-[#E2E8F0]">
              <h4 className="font-bold text-[15px] text-[#0D1117] mb-4 flex items-center gap-2">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                Sample answer
              </h4>
              <div className="space-y-3">
                <div className={`px-4 py-3 rounded-[12px] ${persona.bgColor} border ${persona.borderColor}/50`}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6B7280] mb-1">You ask</p>
                  <p className={`text-[14px] font-medium ${persona.color}`}>{persona.sampleQuery}</p>
                </div>
                <div className="px-4 py-3 rounded-[12px] bg-[#F8F9FB] border border-[#E2E8F0]">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6B7280] mb-1">myaircraft.us answers</p>
                  <p className="text-[14px] text-[#0D1117]">{persona.sampleAnswer}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center mt-10">
          <a
            href="/signup"
            className="inline-flex items-center gap-2 px-6 py-3.5 text-[15px] font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-[12px] transition-all shadow-[0_4px_20px_rgba(37,99,235,0.3)]"
          >
            Start free — no credit card
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </a>
        </div>
      </div>
    </section>
  )
}
