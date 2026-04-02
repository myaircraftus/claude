'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  FileText,
  Search,
  Wrench,
  Zap,
  Lock,
  Download,
  Plane,
  Building2,
  TrendingUp,
  ShoppingCart,
  ClipboardCheck,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  ScanLine,
  Upload,
  ArrowRight,
  Star,
  Shield,
} from 'lucide-react'
import { MarketingNav } from './MarketingNav'

// ─── Hero mock dashboard card ────────────────────────────────────────────────
function AircraftMockCard() {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: '#fff', border: '1px solid #E2E8F0', boxShadow: '0 24px 64px rgba(0,0,0,0.12)' }}
    >
      {/* Card header */}
      <div style={{ background: '#0D1117', padding: '16px 20px' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: '#2563EB' }}
            >
              <Plane size={18} color="white" />
            </div>
            <div>
              <p className="text-white font-bold text-lg leading-none">N67844</p>
              <p style={{ color: '#94A3B8', fontSize: 12 }}>Cessna 152 · 1979</p>
            </div>
          </div>
          <span
            className="text-xs font-semibold px-3 py-1 rounded-full"
            style={{ background: 'rgba(22,163,74,0.15)', color: '#4ADE80' }}
          >
            Valid
          </span>
        </div>
      </div>

      {/* Card body */}
      <div style={{ padding: '20px' }}>
        <div className="grid grid-cols-2 gap-4 mb-5">
          {[
            { label: 'Owner', value: 'J. Anderson' },
            { label: 'Serial No.', value: '15285432' },
            { label: 'Total Time', value: '4,812 hrs' },
            { label: 'Last Annual', value: 'Mar 2025' },
          ].map(({ label, value }) => (
            <div key={label}>
              <p style={{ color: '#94A3B8', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
              <p style={{ color: '#0D1117', fontSize: 14, fontWeight: 600, marginTop: 2 }}>{value}</p>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: '#F1F5F9', marginBottom: 16 }} />

        {/* Record summary */}
        <p style={{ color: '#64748B', fontSize: 12, fontWeight: 600, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Records on file</p>
        <div className="flex flex-col gap-2">
          {[
            { icon: FileText, label: 'Airframe Logbook', status: 'Indexed', color: '#2563EB' },
            { icon: Wrench, label: 'Engine Logbook', status: 'Indexed', color: '#2563EB' },
            { icon: ClipboardCheck, label: 'Annual Inspection', status: 'Current', color: '#16A34A' },
            { icon: Shield, label: 'AD Compliance', status: '12 tracked', color: '#7C3AED' },
          ].map(({ icon: Icon, label, status, color }) => (
            <div key={label} className="flex items-center justify-between rounded-xl px-3 py-2" style={{ background: '#F8FAFC' }}>
              <div className="flex items-center gap-2.5">
                <Icon size={14} color={color} />
                <span style={{ color: '#374151', fontSize: 13, fontWeight: 500 }}>{label}</span>
              </div>
              <span style={{ color, fontSize: 12, fontWeight: 600 }}>{status}</span>
            </div>
          ))}
        </div>

        {/* Footer action */}
        <button
          className="w-full mt-5 py-2.5 rounded-xl text-sm font-semibold"
          style={{ background: '#2563EB', color: 'white' }}
        >
          Open Aircraft Record →
        </button>
      </div>
    </div>
  )
}

// ─── FAQ Accordion ────────────────────────────────────────────────────────────
const FAQ_ITEMS = [
  {
    q: 'How does scanning work?',
    a: 'We send a trained technician to your location with professional scanning equipment. We scan all logbooks, maintenance records, STCs, and supporting documents on-site. Most single-aircraft sets are completed in a half-day. You receive a structured, indexed digital record set — not just raw PDFs.',
  },
  {
    q: 'What if I already have digital records?',
    a: "Upload directly — no scanning fee applies. We accept PDFs, photos, and most common formats. Our team helps structure and label your records so they're fully searchable. Free ingestion assistance is included for all accounts.",
  },
  {
    q: 'How is pricing calculated?',
    a: 'Aircraft subscriptions are $100/aircraft/month. Mechanic access is $100/mechanic/month. Onsite scanning is a one-time $1,000 fee per aircraft logbook set, with an optional $100/month payment path. There are no hidden fees and free setup is always included.',
  },
  {
    q: 'How long does setup take?',
    a: 'For upload accounts, your aircraft dashboard is typically live within 1–2 business days after ingestion. For onsite scanning, expect 3–5 business days from the scan date to a fully indexed, searchable record set.',
  },
  {
    q: 'Is my data secure?',
    a: 'Yes. All records are encrypted at rest and in transit. Access is role-based — only the people you explicitly invite can view your aircraft records. You retain full ownership of your data and can export or delete it at any time.',
  },
  {
    q: 'Can I share records with my mechanic?',
    a: 'Absolutely. You can invite mechanics, inspectors, brokers, or anyone else with a specific access level. Sharing is granular — you control exactly what each person can see. Temporary access links are also supported for prebuy inspections.',
  },
]

function FAQAccordion() {
  const [open, setOpen] = useState<number | null>(null)
  return (
    <div className="flex flex-col gap-3">
      {FAQ_ITEMS.map((item, i) => (
        <div
          key={i}
          className="rounded-2xl overflow-hidden"
          style={{ border: '1px solid #E2E8F0', background: '#fff' }}
        >
          <button
            className="w-full flex items-center justify-between text-left px-6 py-5"
            onClick={() => setOpen(open === i ? null : i)}
          >
            <span style={{ color: '#0D1117', fontSize: 16, fontWeight: 600 }}>{item.q}</span>
            <span className="ml-4 flex-shrink-0" style={{ color: '#2563EB' }}>
              {open === i ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </span>
          </button>
          {open === i && (
            <div
              className="px-6 pb-5"
              style={{ borderTop: '1px solid #F1F5F9' }}
            >
              <p className="pt-4" style={{ color: '#4B5563', fontSize: 15, lineHeight: 1.7 }}>{item.a}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────
export function HomePage() {
  return (
    <div style={{ background: '#fff', color: '#0D1117', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <MarketingNav />

      {/* ── 1. HERO ─────────────────────────────────────────────────────────── */}
      <section
        style={{
          background: 'linear-gradient(160deg, #F8FAFF 0%, #EEF4FF 50%, #F8FAFF 100%)',
          paddingTop: 120,
          paddingBottom: 100,
        }}
      >
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            {/* Left */}
            <div>
              <div
                className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 mb-6 text-sm font-medium"
                style={{ background: '#EFF6FF', color: '#2563EB', border: '1px solid #BFDBFE' }}
              >
                <Star size={13} />
                Aviation records, finally organized
              </div>

              <h1
                className="font-extrabold leading-tight mb-6"
                style={{ fontSize: 'clamp(2rem, 4vw, 3.5rem)', color: '#0D1117', letterSpacing: '-0.02em' }}
              >
                The Modern Platform for Aircraft Records &amp; Logbooks
              </h1>

              <p
                className="mb-8 leading-relaxed"
                style={{ fontSize: 18, color: '#4B5563', maxWidth: 520 }}
              >
                Digitize, organize, search, and manage aircraft maintenance records — for owners, mechanics, and operators.
              </p>

              <div className="flex flex-wrap gap-3 mb-8">
                <Link
                  href="/signup"
                  className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl font-semibold text-white"
                  style={{ background: '#2563EB', fontSize: 15, boxShadow: '0 4px 20px rgba(37,99,235,0.35)' }}
                >
                  Book a Demo <ArrowRight size={16} />
                </Link>
                <a
                  href="#how-it-works"
                  className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl font-semibold"
                  style={{ background: '#fff', color: '#0D1117', fontSize: 15, border: '1px solid #E2E8F0', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
                >
                  See How It Works
                </a>
              </div>

              {/* Micro-trust strip */}
              <div
                className="inline-flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl px-5 py-3"
                style={{ background: '#fff', border: '1px solid #E2E8F0', fontSize: 13, color: '#6B7280' }}
              >
                {['Free setup', 'Free ingestion help', '$100/aircraft/month', 'Onsite scanning available'].map((item, i) => (
                  <span key={item} className="flex items-center gap-1.5">
                    {i > 0 && <span style={{ color: '#D1D5DB', marginRight: 4 }}>·</span>}
                    <CheckCircle size={13} color="#16A34A" />
                    {item}
                  </span>
                ))}
              </div>
            </div>

            {/* Right — mock card */}
            <div className="flex justify-center lg:justify-end">
              <div className="w-full max-w-sm">
                <AircraftMockCard />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 2. TRUST LOGOS ──────────────────────────────────────────────────── */}
      <section style={{ background: '#F8FAFC', borderTop: '1px solid #E2E8F0', borderBottom: '1px solid #E2E8F0', padding: '56px 0' }}>
        <div className="max-w-6xl mx-auto px-6">
          <p className="text-center mb-10" style={{ color: '#6B7280', fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Trusted by aircraft owners, mechanics, and operators
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
            {['Horizon Flights', 'Aviation Maintenance', 'Fleet Operators', 'Independent A&Ps', 'Aircraft Brokers'].map((label) => (
              <div
                key={label}
                className="flex flex-col items-center justify-center rounded-2xl py-6 px-4"
                style={{ background: '#fff', border: '1px solid #E2E8F0', minHeight: 88 }}
              >
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none" className="mb-2.5">
                  <rect width="32" height="32" rx="8" fill="#EFF6FF" />
                  <circle cx="16" cy="13" r="5" fill="#BFDBFE" />
                  <rect x="8" y="21" width="16" height="3" rx="1.5" fill="#93C5FD" />
                </svg>
                <span style={{ color: '#374151', fontSize: 12, fontWeight: 600, textAlign: 'center', lineHeight: 1.4 }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 3. HOW IT WORKS ─────────────────────────────────────────────────── */}
      <section id="how-it-works" style={{ padding: '96px 0' }}>
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="font-extrabold mb-4" style={{ fontSize: 'clamp(1.75rem, 3vw, 2.75rem)', color: '#0D1117', letterSpacing: '-0.02em' }}>
              From paper records to searchable data
            </h2>
            <p style={{ color: '#6B7280', fontSize: 17, maxWidth: 520, margin: '0 auto' }}>
              Five steps from scattered paper to a fully organized, searchable aircraft record set.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
            {[
              { n: 1, title: 'Scan onsite or upload records', desc: 'We come to you or you upload — whatever fits your situation.' },
              { n: 2, title: 'We organize and ingest', desc: 'Our team structures your documents by aircraft, logbook, and record type.' },
              { n: 3, title: 'AI + structured review makes records searchable', desc: 'Human-reviewed AI tags entries so you can search by date, entry, or topic.' },
              { n: 4, title: 'Aircraft & mechanic dashboards go live', desc: 'Your full record set is accessible in a clean, organized dashboard.' },
              { n: 5, title: 'Share, search, export, and manage', desc: 'Invite your mechanic, run searches, export for prebuy, stay compliant.' },
            ].map(({ n, title, desc }) => (
              <div
                key={n}
                className="rounded-2xl p-6 flex flex-col"
                style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}
              >
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center mb-4 font-bold text-white text-sm flex-shrink-0"
                  style={{ background: '#2563EB' }}
                >
                  {n}
                </div>
                <h3 className="font-semibold mb-2" style={{ color: '#0D1117', fontSize: 15, lineHeight: 1.4 }}>{title}</h3>
                <p style={{ color: '#6B7280', fontSize: 13, lineHeight: 1.6 }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 4. PRODUCT VALUE CARDS ──────────────────────────────────────────── */}
      <section id="product" style={{ background: '#F8FAFC', borderTop: '1px solid #E2E8F0', padding: '96px 0' }}>
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="font-extrabold mb-4" style={{ fontSize: 'clamp(1.75rem, 3vw, 2.75rem)', color: '#0D1117', letterSpacing: '-0.02em' }}>
              Everything your aircraft records need
            </h2>
            <p style={{ color: '#6B7280', fontSize: 17, maxWidth: 480, margin: '0 auto' }}>
              Built specifically for the complexity of aviation maintenance documentation.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: FileText, title: 'Digital Aircraft Record Hub', desc: 'All logbooks, STCs, 337s, and maintenance records in one organized, searchable location.' },
              { icon: Search, title: 'Search Across Logbooks Fast', desc: 'Find any entry, date, part number, or mechanic signature in seconds — across all your records.' },
              { icon: Wrench, title: 'Mechanic-Friendly Workflows', desc: 'Mechanics get their own workspace to manage documents, entries, and collaboration tasks.' },
              { icon: Zap, title: 'Smart Ingestion & Structuring', desc: 'AI-assisted document processing with human accuracy review ensures clean, reliable data.' },
              { icon: Lock, title: 'Secure Sharing', desc: 'Share specific records with mechanics, buyers, or inspectors with granular access controls.' },
              { icon: Download, title: 'Export & Archive Access', desc: 'Export full record sets or individual documents anytime. Your data is always yours.' },
            ].map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="rounded-2xl p-7 flex flex-col gap-4 hover:shadow-lg transition-shadow"
                style={{ background: '#fff', border: '1px solid #E2E8F0' }}
              >
                <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: '#EFF6FF' }}>
                  <Icon size={20} color="#2563EB" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1.5" style={{ color: '#0D1117', fontSize: 16 }}>{title}</h3>
                  <p style={{ color: '#6B7280', fontSize: 14, lineHeight: 1.65 }}>{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 5. SOLUTIONS / PERSONAS ─────────────────────────────────────────── */}
      <section id="solutions" style={{ padding: '96px 0' }}>
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="font-extrabold mb-4" style={{ fontSize: 'clamp(1.75rem, 3vw, 2.75rem)', color: '#0D1117', letterSpacing: '-0.02em' }}>
              Built for every aviation role
            </h2>
            <p style={{ color: '#6B7280', fontSize: 17, maxWidth: 500, margin: '0 auto' }}>
              Whether you own one aircraft or manage a fleet, myaircraft.us is built around your workflow.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: Plane,
                title: 'Aircraft Owners',
                tagline: 'Total visibility into your aircraft\'s complete maintenance history',
                bullets: ['Searchable logbooks from day one', 'Annual and AD compliance at a glance', 'Share securely for prebuy or insurance review'],
              },
              {
                icon: Wrench,
                title: 'Mechanics & A&P Teams',
                tagline: 'Prepare cleaner records faster with organized supporting docs',
                bullets: ['Per-mechanic workspaces and document access', 'Less time hunting for paperwork', 'Structured records that hold up to scrutiny'],
              },
              {
                icon: Building2,
                title: 'Flight Departments',
                tagline: 'Manage multi-aircraft fleets with consistent record standards',
                bullets: ['Fleet-wide record visibility in one dashboard', 'Standardized document organization', 'Audit-ready compliance documentation'],
              },
              {
                icon: TrendingUp,
                title: 'Brokers & Prebuy Teams',
                tagline: 'Surface the records that support value and reduce transaction risk',
                bullets: ['Fast access to full maintenance history', 'Searchable documentation for due diligence', 'Share record sets securely with buyers'],
              },
              {
                icon: ShoppingCart,
                title: 'Buyers & Sellers',
                tagline: 'Understand what you\'re buying or selling with searchable evidence',
                bullets: ['Clear, organized records support asking price', 'Buyers can verify work history independently', 'No more box of papers at closing'],
              },
              {
                icon: ClipboardCheck,
                title: 'Maintenance Managers',
                tagline: 'Keep every aircraft workspace organized and compliance-ready',
                bullets: ['Track maintenance across multiple aircraft', 'Assign and manage document tasks by aircraft', 'Stay ahead of ADs, annuals, and inspections'],
              },
            ].map(({ icon: Icon, title, tagline, bullets }) => (
              <div
                key={title}
                className="rounded-2xl p-7 flex flex-col hover:shadow-lg transition-shadow"
                style={{ background: '#fff', border: '1px solid #E2E8F0' }}
              >
                <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-4" style={{ background: '#EFF6FF' }}>
                  <Icon size={20} color="#2563EB" />
                </div>
                <h3 className="font-bold mb-2" style={{ color: '#0D1117', fontSize: 17 }}>{title}</h3>
                <p className="mb-4" style={{ color: '#6B7280', fontSize: 14, lineHeight: 1.6 }}>{tagline}</p>
                <ul className="flex flex-col gap-2 mb-6 flex-1">
                  {bullets.map((b) => (
                    <li key={b} className="flex items-start gap-2">
                      <CheckCircle size={14} color="#16A34A" style={{ marginTop: 2, flexShrink: 0 }} />
                      <span style={{ color: '#374151', fontSize: 13, lineHeight: 1.5 }}>{b}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/signup"
                  className="mt-auto inline-flex items-center gap-1.5 text-sm font-semibold"
                  style={{ color: '#2563EB' }}
                >
                  Learn More <ArrowRight size={14} />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 6. SCANNING & ONBOARDING ────────────────────────────────────────── */}
      <section style={{ background: '#F8FAFC', borderTop: '1px solid #E2E8F0', padding: '96px 0' }}>
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="font-extrabold mb-4" style={{ fontSize: 'clamp(1.75rem, 3vw, 2.75rem)', color: '#0D1117', letterSpacing: '-0.02em' }}>
              Choose the path that fits your records.
            </h2>
            <p style={{ color: '#6B7280', fontSize: 17, maxWidth: 480, margin: '0 auto' }}>
              Whether your records are still on paper or already scanned, we have a clear onboarding path for you.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Option A */}
            <div className="rounded-2xl p-8 flex flex-col" style={{ background: '#fff', border: '2px solid #2563EB' }}>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: '#EFF6FF' }}>
                  <ScanLine size={22} color="#2563EB" />
                </div>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#2563EB', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Option A</span>
                  <h3 className="font-bold text-xl" style={{ color: '#0D1117' }}>Onsite Scanning</h3>
                </div>
              </div>
              <div className="mb-5 pb-5" style={{ borderBottom: '1px solid #E2E8F0' }}>
                <span className="font-extrabold text-3xl" style={{ color: '#0D1117' }}>$1,000</span>
                <span style={{ color: '#6B7280', fontSize: 15 }}> per aircraft logbooks</span>
              </div>
              <ul className="flex flex-col gap-3 flex-1">
                {[
                  'We scan at your location — no shipping or offsite handling',
                  'Structured onboarding included at no extra charge',
                  'Human accuracy review of all scanned records',
                  'Optional $100/month payment path available',
                  'Free setup and free ingestion assistance',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <CheckCircle size={15} color="#16A34A" style={{ marginTop: 1.5, flexShrink: 0 }} />
                    <span style={{ color: '#374151', fontSize: 14, lineHeight: 1.55 }}>{item}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/signup"
                className="mt-8 w-full py-3.5 rounded-xl font-semibold text-white text-center text-sm block"
                style={{ background: '#2563EB' }}
              >
                Schedule Onsite Scanning →
              </Link>
            </div>

            {/* Option B */}
            <div className="rounded-2xl p-8 flex flex-col" style={{ background: '#fff', border: '1px solid #E2E8F0' }}>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: '#F0FDF4' }}>
                  <Upload size={22} color="#16A34A" />
                </div>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#16A34A', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Option B</span>
                  <h3 className="font-bold text-xl" style={{ color: '#0D1117' }}>Already Have Scans? Upload Directly</h3>
                </div>
              </div>
              <div className="mb-5 pb-5" style={{ borderBottom: '1px solid #E2E8F0' }}>
                <span className="font-extrabold text-3xl" style={{ color: '#0D1117' }}>$0</span>
                <span style={{ color: '#6B7280', fontSize: 15 }}> scanning fee · subscription only</span>
              </div>
              <ul className="flex flex-col gap-3 flex-1">
                {[
                  'No scanning fee — upload PDFs or photos directly',
                  'We help structure and label your record set',
                  'Free ingestion support included for all uploads',
                  'Free accuracy review and organization assistance',
                  'Account goes live within 1–2 business days',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <CheckCircle size={15} color="#16A34A" style={{ marginTop: 1.5, flexShrink: 0 }} />
                    <span style={{ color: '#374151', fontSize: 14, lineHeight: 1.55 }}>{item}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/signup"
                className="mt-8 w-full py-3.5 rounded-xl font-semibold text-center text-sm block"
                style={{ background: '#F8FAFC', color: '#0D1117', border: '1px solid #E2E8F0' }}
              >
                Upload Your Records →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── 7. PRICING ──────────────────────────────────────────────────────── */}
      <section id="pricing" style={{ padding: '96px 0' }}>
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="font-extrabold mb-4" style={{ fontSize: 'clamp(1.75rem, 3vw, 2.75rem)', color: '#0D1117', letterSpacing: '-0.02em' }}>
              Simple, transparent pricing.
            </h2>
            <p style={{ color: '#6B7280', fontSize: 17, maxWidth: 480, margin: '0 auto' }}>
              No surprises. No tiers. No seat minimums. Straightforward pricing built for aviation.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            {/* Aircraft Subscription */}
            <div
              className="rounded-2xl p-8 flex flex-col"
              style={{ background: '#fff', border: '2px solid #2563EB', position: 'relative' }}
            >
              <div
                className="absolute -top-3.5 left-1/2 -translate-x-1/2 text-xs font-bold px-3 py-1 rounded-full"
                style={{ background: '#2563EB', color: '#fff', whiteSpace: 'nowrap' }}
              >
                Most popular
              </div>
              <Plane size={22} color="#2563EB" style={{ marginBottom: 16 }} />
              <h3 className="font-bold text-lg mb-1" style={{ color: '#0D1117' }}>Aircraft Subscription</h3>
              <p style={{ color: '#6B7280', fontSize: 13, marginBottom: 16 }}>Per aircraft, all features included</p>
              <div className="mb-6">
                <span className="font-extrabold" style={{ fontSize: 36, color: '#0D1117' }}>$100</span>
                <span style={{ color: '#6B7280', fontSize: 15 }}>/aircraft/month</span>
              </div>
              <ul className="flex flex-col gap-2.5 flex-1">
                {[
                  'Fully searchable digital records',
                  'Organized aircraft record hub',
                  'Aircraft dashboard & history view',
                  'Sharing and export tools',
                  'Ongoing support included',
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <CheckCircle size={14} color="#16A34A" style={{ marginTop: 2, flexShrink: 0 }} />
                    <span style={{ color: '#374151', fontSize: 13.5 }}>{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/signup"
                className="mt-8 block w-full py-3.5 rounded-xl font-semibold text-white text-center text-sm"
                style={{ background: '#2563EB' }}
              >
                Get Started →
              </Link>
            </div>

            {/* Mechanic Access */}
            <div className="rounded-2xl p-8 flex flex-col" style={{ background: '#fff', border: '1px solid #E2E8F0' }}>
              <Wrench size={22} color="#2563EB" style={{ marginBottom: 16 }} />
              <h3 className="font-bold text-lg mb-1" style={{ color: '#0D1117' }}>Mechanic Access</h3>
              <p style={{ color: '#6B7280', fontSize: 13, marginBottom: 16 }}>Per mechanic, full workflow access</p>
              <div className="mb-6">
                <span className="font-extrabold" style={{ fontSize: 36, color: '#0D1117' }}>$100</span>
                <span style={{ color: '#6B7280', fontSize: 15 }}>/mechanic/month</span>
              </div>
              <ul className="flex flex-col gap-2.5 flex-1">
                {[
                  'Full mechanic workflow access',
                  'Document viewing and handling',
                  'Collaboration with aircraft owners',
                  'Work order and record linking',
                  'Export and annotation tools',
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <CheckCircle size={14} color="#16A34A" style={{ marginTop: 2, flexShrink: 0 }} />
                    <span style={{ color: '#374151', fontSize: 13.5 }}>{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/signup"
                className="mt-8 block w-full py-3.5 rounded-xl font-semibold text-center text-sm"
                style={{ background: '#F8FAFC', color: '#0D1117', border: '1px solid #E2E8F0' }}
              >
                Get Mechanic Access →
              </Link>
            </div>

            {/* Scanning & Onboarding */}
            <div className="rounded-2xl p-8 flex flex-col" style={{ background: '#fff', border: '1px solid #E2E8F0' }}>
              <ScanLine size={22} color="#2563EB" style={{ marginBottom: 16 }} />
              <h3 className="font-bold text-lg mb-1" style={{ color: '#0D1117' }}>Scanning & Onboarding</h3>
              <p style={{ color: '#6B7280', fontSize: 13, marginBottom: 16 }}>One-time fee per aircraft logbook set</p>
              <div className="mb-6">
                <span className="font-extrabold" style={{ fontSize: 36, color: '#0D1117' }}>$1,000</span>
                <span style={{ color: '#6B7280', fontSize: 15 }}>/aircraft logbooks</span>
              </div>
              <ul className="flex flex-col gap-2.5 flex-1">
                {[
                  'Onsite scanning at your location',
                  'Optional $100/month payment path',
                  'Free setup — always included',
                  'Free ingestion assistance',
                  'Free accuracy review of all records',
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <CheckCircle size={14} color="#16A34A" style={{ marginTop: 2, flexShrink: 0 }} />
                    <span style={{ color: '#374151', fontSize: 13.5 }}>{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/signup"
                className="mt-8 block w-full py-3.5 rounded-xl font-semibold text-center text-sm"
                style={{ background: '#F8FAFC', color: '#0D1117', border: '1px solid #E2E8F0' }}
              >
                Schedule Scanning →
              </Link>
            </div>
          </div>

          {/* Mini FAQ strip */}
          <div className="rounded-2xl overflow-hidden grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4" style={{ border: '1px solid #E2E8F0' }}>
            {[
              { q: 'Already scanned?', a: 'Upload directly — no scanning fee applies.' },
              { q: 'Need onsite help?', a: 'We scan at your location for a flat $1,000 fee.' },
              { q: 'Need setup support?', a: 'Included free with every account, always.' },
              { q: 'Want clean ingestion?', a: 'Included free — we organize and structure your records.' },
            ].map(({ q, a }, i) => (
              <div
                key={q}
                className="p-6"
                style={{
                  background: '#F8FAFC',
                  borderRight: i < 3 ? '1px solid #E2E8F0' : 'none',
                  borderTop: '1px solid #E2E8F0',
                }}
              >
                <p className="font-semibold mb-1" style={{ color: '#0D1117', fontSize: 14 }}>{q}</p>
                <p style={{ color: '#6B7280', fontSize: 13, lineHeight: 1.55 }}>{a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 8. ACCURACY / TRUST ─────────────────────────────────────────────── */}
      <section style={{ background: '#0D1117', padding: '96px 0' }}>
        <div className="max-w-6xl mx-auto px-6">
          <div className="max-w-2xl mx-auto text-center mb-14">
            <h2 className="font-extrabold mb-4" style={{ fontSize: 'clamp(1.75rem, 3vw, 2.75rem)', color: '#fff', letterSpacing: '-0.02em' }}>
              Accuracy matters more than automation.
            </h2>
            <p style={{ color: '#94A3B8', fontSize: 17, lineHeight: 1.7 }}>
              Aviation records are legal documents. We combine AI efficiency with human review so your records are organized correctly — not just quickly.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              { title: 'Free account setup', desc: 'Every new account is set up by our team — no DIY configuration required.' },
              { title: 'Free ingestion assistance', desc: 'We help you get records in the right structure from day one.' },
              { title: 'Human-reviewed organization support', desc: 'A real person reviews your record organization for accuracy.' },
              { title: 'Accuracy-first onboarding', desc: 'We prioritize getting it right over getting it fast.' },
              { title: 'Clean aircraft-by-aircraft structuring', desc: 'Every aircraft gets its own organized, labeled record set.' },
              { title: 'Built for real aviation records', desc: 'Designed around how aircraft records actually work — not generic documents.' },
            ].map(({ title, desc }) => (
              <div
                key={title}
                className="rounded-2xl p-6 flex items-start gap-4"
                style={{ background: '#161B22', border: '1px solid #21262D' }}
              >
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: 'rgba(22,163,74,0.15)' }}>
                  <CheckCircle size={16} color="#4ADE80" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1" style={{ color: '#F1F5F9', fontSize: 15 }}>{title}</h3>
                  <p style={{ color: '#64748B', fontSize: 13, lineHeight: 1.6 }}>{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 9. FAQ ──────────────────────────────────────────────────────────── */}
      <section style={{ padding: '96px 0' }}>
        <div className="max-w-3xl mx-auto px-6">
          <div className="text-center mb-14">
            <h2 className="font-extrabold mb-4" style={{ fontSize: 'clamp(1.75rem, 3vw, 2.75rem)', color: '#0D1117', letterSpacing: '-0.02em' }}>
              Frequently asked questions
            </h2>
            <p style={{ color: '#6B7280', fontSize: 17 }}>
              Everything you need to know before getting started.
            </p>
          </div>
          <FAQAccordion />
        </div>
      </section>

      {/* ── 10. FINAL CTA ───────────────────────────────────────────────────── */}
      <section style={{ background: 'linear-gradient(135deg, #1E40AF 0%, #2563EB 50%, #3B82F6 100%)', padding: '96px 0' }}>
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="font-extrabold mb-5" style={{ fontSize: 'clamp(2rem, 4vw, 3rem)', color: '#fff', letterSpacing: '-0.02em' }}>
            Ready to organize your aircraft records?
          </h2>
          <p style={{ color: '#BFDBFE', fontSize: 18, lineHeight: 1.7, maxWidth: 560, margin: '0 auto 40px' }}>
            Join aircraft owners, mechanics, and operators who trust myaircraft.us with their most important aviation documents.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl font-semibold"
              style={{ background: '#fff', color: '#1E40AF', fontSize: 15, boxShadow: '0 4px 24px rgba(0,0,0,0.2)' }}
            >
              Book a Demo <ArrowRight size={16} />
            </Link>
            <a
              href="#pricing"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl font-semibold text-white"
              style={{ background: 'rgba(255,255,255,0.15)', fontSize: 15, border: '1px solid rgba(255,255,255,0.25)' }}
            >
              View Pricing
            </a>
          </div>
        </div>
      </section>

      {/* ── 11. FOOTER ──────────────────────────────────────────────────────── */}
      <footer style={{ background: '#0D1117', paddingTop: 80 }}>
        <div className="max-w-6xl mx-auto px-6">
          {/* Logo + tagline */}
          <div className="mb-14">
            <Link href="/" className="flex items-center gap-2.5 mb-3">
              <div className="w-8 h-8 rounded-[8px] flex items-center justify-center" style={{ background: '#2563EB' }}>
                <Plane size={16} color="white" />
              </div>
              <span className="font-semibold text-[15px] text-white">myaircraft.us</span>
            </Link>
            <p style={{ color: '#64748B', fontSize: 14, maxWidth: 320, lineHeight: 1.6 }}>
              The modern platform for aircraft records, logbooks, and maintenance documentation.
            </p>
          </div>

          {/* Link columns */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-8 pb-14" style={{ borderBottom: '1px solid #21262D' }}>
            {[
              {
                heading: 'Product',
                links: ['Overview', 'AI Search', 'Digital Logbooks', 'Records Hub', 'Mechanic Workflows', 'Sharing & Exports'],
              },
              {
                heading: 'Solutions',
                links: ['Aircraft Owners', 'Mechanics', 'Flight Departments', 'Brokers & Prebuy', 'Buyers & Sellers', 'Maintenance Teams'],
              },
              {
                heading: 'Pricing',
                links: ['Subscription Plans', 'Scanning Service', 'Free Setup'],
              },
              {
                heading: 'Scanning',
                links: ['Onsite Scanning', 'Upload Existing', 'Ingestion & Structuring'],
              },
              {
                heading: 'Security',
                links: ['Data Protection', 'Access Control', 'Audit Trail'],
              },
              {
                heading: 'Resources',
                links: ['FAQs', 'Guides', 'Demo', 'Contact'],
              },
            ].map(({ heading, links }) => (
              <div key={heading}>
                <p style={{ color: '#F1F5F9', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>
                  {heading}
                </p>
                <ul className="flex flex-col gap-2.5">
                  {links.map((link) => (
                    <li key={link}>
                      <Link
                        href="#"
                        className="text-sm hover:text-white transition-colors"
                        style={{ color: '#64748B' }}
                      >
                        {link}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Bottom strip */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 py-6">
            <p style={{ color: '#475569', fontSize: 13 }}>
              © {new Date().getFullYear()} myaircraft.us. All rights reserved.
            </p>
            <div className="flex items-center gap-5">
              <Link href="/privacy" className="hover:text-white transition-colors" style={{ color: '#475569', fontSize: 13 }}>Privacy</Link>
              <Link href="/terms" className="hover:text-white transition-colors" style={{ color: '#475569', fontSize: 13 }}>Terms</Link>
              <Link href="/signin" className="hover:text-white transition-colors" style={{ color: '#475569', fontSize: 13 }}>Login</Link>
              <Link
                href="/signup"
                className="px-4 py-2 rounded-lg font-semibold text-sm"
                style={{ background: '#2563EB', color: '#fff' }}
              >
                Book Demo →
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
