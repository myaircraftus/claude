import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Aviation Resources — myaircraft.us',
  description: 'Key aviation regulations, FAA links, logbook standards, and a glossary of terms for aircraft owners, mechanics, and inspectors.',
}

const regulations = [
  {
    part: '14 CFR Part 91',
    title: 'General Operating and Flight Rules',
    description: 'Covers the general rules for operating civil aircraft in the US, including maintenance requirements under 91.409 (inspections) and 91.417 (maintenance records).',
    href: 'https://www.ecfr.gov/current/title-14/chapter-I/subchapter-F/part-91',
  },
  {
    part: '14 CFR Part 43',
    title: 'Maintenance, Preventive Maintenance, Rebuilding, and Alteration',
    description: 'Establishes rules for performing maintenance on certificated aircraft, including who may perform work, what must be recorded, and return-to-service requirements.',
    href: 'https://www.ecfr.gov/current/title-14/chapter-I/subchapter-C/part-43',
  },
  {
    part: '14 CFR Part 65',
    title: 'Certification: Airmen Other Than Flight Crewmembers',
    description: 'Covers certification of mechanics and repairmen, including A&P mechanic and IA (Inspection Authorization) requirements.',
    href: 'https://www.ecfr.gov/current/title-14/chapter-I/subchapter-D/part-65',
  },
  {
    part: '14 CFR Part 39',
    title: 'Airworthiness Directives',
    description: 'Establishes the framework for FAA Airworthiness Directives — legally enforceable rules requiring specific actions to restore aircraft airworthiness.',
    href: 'https://www.ecfr.gov/current/title-14/chapter-I/subchapter-C/part-39',
  },
]

const faaLinks = [
  {
    title: 'FAA Aircraft Registry',
    description: 'Search and verify registered aircraft by N-number, serial number, or owner name.',
    href: 'https://registry.faa.gov/aircraftinquiry/',
    badge: 'Aircraft Registry',
  },
  {
    title: 'FSDO Locator',
    description: 'Find the Flight Standards District Office responsible for your geographic area.',
    href: 'https://www.faa.gov/about/office_org/headquarters_offices/avs/offices/afx/afs/fsdo',
    badge: 'Regulatory',
  },
  {
    title: 'Document Retrieval Service (DRS)',
    description: 'Request FAA records including aircraft records, STC data, and historical documents.',
    href: 'https://drs.faa.gov/',
    badge: 'Records',
  },
  {
    title: 'Airworthiness Directives Search',
    description: 'Official FAA AD search tool — search by make, model, and AD number.',
    href: 'https://rgl.faa.gov/Regulatory_and_Guidance_Library/rgAD.nsf/0/list?OpenPage',
    badge: 'ADs',
  },
  {
    title: 'DynAIRCS (AD Compliance)',
    description: 'FAA system for checking AD applicability for specific aircraft make and model.',
    href: 'https://av-info.faa.gov/dad/query/AW-2.cfm',
    badge: 'Compliance',
  },
  {
    title: 'FAA eCFR',
    description: 'Electronic Code of Federal Regulations — searchable, up-to-date aviation rules.',
    href: 'https://www.ecfr.gov/current/title-14',
    badge: 'Regulations',
  },
]

const logbookStandards = [
  {
    title: 'What must be recorded (Part 43.9)',
    items: [
      'Description of the work performed',
      'Date the work was completed',
      'Name and certificate number of the person approving the work',
      'Signature of the approving person',
    ],
  },
  {
    title: 'What must be recorded (Part 91.417)',
    items: [
      'Total time in service (airframe, engine, propeller)',
      'Current status of life-limited parts',
      'Time since last overhaul (all items required to be overhauled)',
      'Inspection status including type, frequency, and time and date of last inspection',
      'Current status of applicable ADs',
      'List of major alterations and repairs',
    ],
  },
  {
    title: 'Signature requirements',
    items: [
      'A&P mechanics must sign with certificate number',
      'IAs must sign off annual inspections with IA certificate number',
      'Owner sign-offs required for preventive maintenance',
      'Electronic signatures are accepted if tamper-evident',
    ],
  },
  {
    title: 'Amendment procedures',
    items: [
      'Errors must be crossed out with a single line — never erased or obscured',
      'Corrections must be initialed and dated',
      'Supplemental entries may be added to clarify prior entries',
      'FAA may require reconstruction of lost or damaged records',
    ],
  },
]

const glossary = [
  { term: 'AD', definition: 'Airworthiness Directive — a legally enforceable rule issued by the FAA requiring specific maintenance actions to correct an unsafe condition.' },
  { term: 'STC', definition: 'Supplemental Type Certificate — FAA approval for a modification or alteration to a certificated aircraft that deviates from the original type design.' },
  { term: '337', definition: 'FAA Form 337 — Major Repair and Alteration form, required to be filed with the FAA for any major repair or alteration to a certificated aircraft.' },
  { term: 'MEL', definition: 'Minimum Equipment List — a document specifying which instruments and equipment may be inoperative while still maintaining airworthiness for specific operations.' },
  { term: 'AFMS', definition: 'Approved Flight Manual Supplement — an FAA-approved supplement to the Pilot Operating Handbook, typically issued with an STC.' },
  { term: 'Logbook', definition: 'The official maintenance record for an aircraft, engine, propeller, or component, as required by 14 CFR Part 91.417.' },
  { term: 'TBO', definition: 'Time Between Overhaul — manufacturer-recommended interval between engine or component overhauls, stated in hours or calendar time.' },
  { term: 'SMOH', definition: 'Since Major Overhaul — total time accumulated since the last major overhaul, used to assess engine and component condition.' },
  { term: 'SNEW', definition: 'Since New — total time since manufacture, with no overhauls having been performed.' },
  { term: 'IA', definition: 'Inspection Authorization — an FAA authorization held by experienced A&P mechanics that allows them to conduct annual inspections and approve major repairs.' },
  { term: 'A&P', definition: 'Airframe and Powerplant — FAA mechanic certificate authorizing the holder to perform maintenance on aircraft airframes and engines.' },
  { term: 'Return to Service', definition: 'A formal approval by a certificated person (A&P, IA, or owner for preventive maintenance) that an aircraft is airworthy after maintenance.' },
]

export default function ResourcesPage() {
  return (
    <div className="pt-[88px]">
      {/* Hero */}
      <section className="relative py-20 overflow-hidden">
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 0%, #EFF6FF 0%, #F8F9FB 60%, #F8F9FB 100%)' }} />
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(#2563EB 1px, transparent 1px), linear-gradient(90deg, #2563EB 1px, transparent 1px)', backgroundSize: '60px 60px' }} />
        <div className="relative max-w-4xl mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#EFF6FF] border border-[#BFDBFE] text-[#2563EB] text-[13px] font-medium mb-6">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
            Aviation Resources
          </div>
          <h1 className="text-[52px] lg:text-[60px] font-extrabold text-[#0D1117] leading-[1.1] tracking-tight mb-4">
            Aviation <span className="text-[#2563EB]">Regulatory Resources</span>
          </h1>
          <p className="text-[20px] text-[#4B5563] leading-relaxed max-w-2xl mx-auto">
            Key regulations, official FAA links, logbook standards, and a glossary of common aviation maintenance terms.
          </p>
        </div>
      </section>

      {/* Key Regulations */}
      <section className="py-20 bg-white">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-[32px] font-extrabold text-[#0D1117] tracking-tight mb-2">Key Regulations</h2>
          <p className="text-[16px] text-[#6B7280] mb-10">The core FAA regulations governing aircraft maintenance and records.</p>
          <div className="space-y-4">
            {regulations.map((reg) => (
              <div key={reg.part} className="flex flex-col md:flex-row md:items-start gap-4 p-6 bg-[#F8F9FB] border border-[#E2E8F0] rounded-[16px] hover:border-[#BFDBFE] transition-colors">
                <div className="flex-shrink-0">
                  <span className="inline-block px-3 py-1 text-[13px] font-semibold text-[#2563EB] bg-[#EFF6FF] rounded-[8px]">{reg.part}</span>
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-[16px] text-[#0D1117] mb-1">{reg.title}</h3>
                  <p className="text-[14px] text-[#6B7280] leading-relaxed mb-3">{reg.description}</p>
                  <a
                    href={reg.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#2563EB] hover:text-[#1D4ED8] transition-colors"
                  >
                    View on eCFR
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAA Links */}
      <section className="py-20 bg-[#F8F9FB]">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-[32px] font-extrabold text-[#0D1117] tracking-tight mb-2">FAA Links</h2>
          <p className="text-[16px] text-[#6B7280] mb-10">Official FAA tools and databases used by owners, mechanics, and inspectors.</p>
          <div className="grid md:grid-cols-2 gap-4">
            {faaLinks.map((link) => (
              <a
                key={link.title}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-4 p-5 bg-white border border-[#E2E8F0] rounded-[14px] hover:border-[#BFDBFE] hover:shadow-[0_2px_12px_rgba(37,99,235,0.08)] transition-all group"
              >
                <div className="w-9 h-9 rounded-[9px] bg-[#EFF6FF] flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/>
                  </svg>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-[15px] text-[#0D1117] group-hover:text-[#2563EB] transition-colors">{link.title}</span>
                    <span className="px-2 py-0.5 text-[11px] font-medium text-[#6B7280] bg-[#F1F3F7] rounded-[5px]">{link.badge}</span>
                  </div>
                  <p className="text-[13px] text-[#6B7280] leading-relaxed">{link.description}</p>
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* Logbook Standards */}
      <section className="py-20 bg-white">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-[32px] font-extrabold text-[#0D1117] tracking-tight mb-2">Logbook Standards</h2>
          <p className="text-[16px] text-[#6B7280] mb-10">What FAA regulations require for aircraft maintenance records.</p>
          <div className="grid md:grid-cols-2 gap-6">
            {logbookStandards.map((section) => (
              <div key={section.title} className="p-6 bg-[#F8F9FB] border border-[#E2E8F0] rounded-[16px]">
                <h3 className="font-semibold text-[16px] text-[#0D1117] mb-4">{section.title}</h3>
                <ul className="space-y-2">
                  {section.items.map(item => (
                    <li key={item} className="flex items-start gap-2.5 text-[14px] text-[#374151]">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 flex-shrink-0"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Glossary */}
      <section className="py-20 bg-[#F8F9FB]">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-[32px] font-extrabold text-[#0D1117] tracking-tight mb-2">Glossary</h2>
          <p className="text-[16px] text-[#6B7280] mb-10">Common aviation maintenance and records terminology.</p>
          <div className="grid md:grid-cols-2 gap-4">
            {glossary.map((item) => (
              <div key={item.term} className="flex gap-3 p-4 bg-white border border-[#E2E8F0] rounded-[12px]">
                <div className="flex-shrink-0 mt-0.5">
                  <span className="inline-block min-w-[44px] px-2 py-0.5 text-[12px] font-extrabold text-[#2563EB] bg-[#EFF6FF] rounded-[6px] text-center">{item.term}</span>
                </div>
                <p className="text-[13px] text-[#6B7280] leading-relaxed">{item.definition}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-white border-t border-[#E2E8F0]">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-[28px] font-extrabold text-[#0D1117] tracking-tight mb-3">Have a question?</h2>
          <p className="text-[17px] text-[#6B7280] mb-8">
            We&apos;re here to help you navigate aviation records requirements. Reach out anytime.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="/signup" className="inline-flex items-center gap-2 px-6 py-3.5 text-[15px] font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-[12px] transition-all shadow-[0_4px_20px_rgba(37,99,235,0.3)]">
              Get started free →
            </Link>
            <a href="mailto:support@myaircraft.us" className="inline-flex items-center gap-2 px-6 py-3.5 text-[15px] font-medium text-[#374151] bg-white border border-[#E2E8F0] hover:bg-[#F8F9FB] rounded-[12px] transition-all">
              Contact us
            </a>
          </div>
        </div>
      </section>
    </div>
  )
}
