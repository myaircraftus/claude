'use client'
import { useState } from 'react'
import Link from 'next/link'
import { MarketingNav } from './MarketingNav'
import { AppMockup } from './AppMockup'

function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center pt-16 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0" style={{
        background: 'radial-gradient(ellipse 80% 60% at 50% 0%, #EFF6FF 0%, #F8F9FB 60%, #F8F9FB 100%)'
      }}/>
      {/* Faint grid */}
      <div className="absolute inset-0 opacity-[0.03]"
        style={{ backgroundImage: 'linear-gradient(#2563EB 1px, transparent 1px), linear-gradient(90deg, #2563EB 1px, transparent 1px)', backgroundSize: '60px 60px' }}
      />
      <div className="relative max-w-6xl mx-auto px-6 py-24 w-full">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left */}
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#EFF6FF] border border-[#BFDBFE] text-[#2563EB] text-[13px] font-medium mb-6">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="#2563EB"><path d="M12 2l2.4 7.2H22l-6.2 4.5 2.4 7.2L12 17l-6.2 3.9 2.4-7.2L2 9.2h7.6L12 2z"/></svg>
              Aviation Document Intelligence
            </div>
            <h1 className="text-[52px] lg:text-[64px] font-extrabold text-[#0D1117] leading-[1.1] tracking-tight mb-6">
              Ask Your Aircraft{' '}
              <span className="text-[#2563EB]">Anything.</span>
            </h1>
            <p className="text-[18px] text-[#4B5563] leading-relaxed mb-8 max-w-lg">
              Upload logbooks, POH, manuals, and maintenance records. Ask questions in plain English. Get exact answers with page-level citations — from your documents, not the internet.
            </p>
            <div className="flex flex-wrap gap-3 mb-10">
              <Link href="/signup"
                className="inline-flex items-center gap-2 px-6 py-3.5 text-[15px] font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-[12px] transition-all shadow-[0_4px_20px_rgba(37,99,235,0.3)] hover:shadow-[0_8px_32px_rgba(37,99,235,0.4)]"
              >
                Book Demo
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
              </Link>
              <a href="#how-it-works"
                className="inline-flex items-center gap-2 px-6 py-3.5 text-[15px] font-medium text-[#374151] bg-white border border-[#E2E8F0] hover:bg-[#F8F9FB] hover:border-[#CBD5E1] rounded-[12px] transition-all shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
              >
                See How It Works
              </a>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {[
                'Citation-backed answers',
                'Aircraft-by-aircraft organization',
                'Private or shared library',
                'Secure team access',
              ].map(t => (
                <span key={t} className="flex items-center gap-1.5 text-[13px] text-[#4B5563]">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  {t}
                </span>
              ))}
            </div>
          </div>
          {/* Right — mockup */}
          <div className="flex justify-center lg:justify-end">
            <AppMockup />
          </div>
        </div>
      </div>
    </section>
  )
}

function TrustBar() {
  return (
    <section className="border-y border-[#E2E8F0] bg-[#F8F9FB]">
      <div className="max-w-6xl mx-auto px-6 py-6">
        <p className="text-center text-[13px] text-[#9CA3AF] font-medium mb-5">Trusted by aircraft owners, mechanics, flight schools, and operators</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: 'shield', label: 'Citation-backed answers' },
            { icon: 'workspace', label: 'Aircraft-specific workspaces' },
            { icon: 'lock', label: 'Secure multi-tenant access' },
            { icon: 'cloud', label: 'Google Drive + PDF ingestion' },
          ].map(({ icon, label }) => (
            <div key={label} className="flex items-center gap-2.5 justify-center">
              <div className="w-8 h-8 rounded-[8px] bg-[#EFF6FF] flex items-center justify-center flex-shrink-0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  {icon === 'shield' && <><path d="M12 2l8 3.5v5.5c0 4.5-3.5 8-8 9.5C7.5 19 4 15.5 4 11V5.5L12 2z"/><polyline points="9 12 11 14 15 10"/></>}
                  {icon === 'workspace' && <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>}
                  {icon === 'lock' && <><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></>}
                  {icon === 'cloud' && <><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></>}
                </svg>
              </div>
              <span className="text-[14px] font-medium text-[#374151]">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function WhyNowSection() {
  const problems = [
    { icon: 'alert', title: 'Records are scattered', body: 'Logs in binders, PDFs on drives, manuals on shelves — all disconnected.' },
    { icon: 'search', title: 'Searching PDFs wastes hours', body: "Ctrl+F doesn't work on scanned docs or across 40 files at once." },
    { icon: 'spark', title: 'Generic AI hallucinates', body: "ChatGPT doesn't know your aircraft's records — and will make things up." },
    { icon: 'citation', title: 'Aviation needs traceability', body: 'Every answer must link to a document page and source. No exceptions.' },
  ]
  return (
    <section className="py-24 bg-white">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-14">
          <h2 className="text-[38px] font-extrabold text-[#0D1117] tracking-tight mb-4">Aviation records are broken.<br/>We fixed that.</h2>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {problems.map(p => (
            <div key={p.title} className="bg-[#F8F9FB] rounded-[16px] p-6 border border-[#E2E8F0] hover:border-[#2563EB]/30 hover:shadow-[0_8px_24px_rgba(37,99,235,0.06)] transition-all duration-200">
              <div className="w-10 h-10 rounded-[10px] bg-white border border-[#E2E8F0] shadow-sm flex items-center justify-center mb-4">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  {p.icon === 'alert' && <><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>}
                  {p.icon === 'search' && <><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>}
                  {p.icon === 'spark' && <path d="M12 2l2.4 7.2H22l-6.2 4.5 2.4 7.2L12 17l-6.2 3.9 2.4-7.2L2 9.2h7.6L12 2z" fill="#2563EB" stroke="none"/>}
                  {p.icon === 'citation' && <><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/></>}
                </svg>
              </div>
              <h3 className="font-semibold text-[16px] text-[#0D1117] mb-2">{p.title}</h3>
              <p className="text-[14px] text-[#6B7280] leading-relaxed">{p.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function HowItWorksSection() {
  const steps = [
    { num: '01', icon: 'upload', title: 'Upload / Import', body: 'Drag-drop PDFs or connect Google Drive. Logbooks, POH, AFM, manuals, ADs, work orders.' },
    { num: '02', icon: 'folder', title: 'Organize by Aircraft', body: 'Every document is tagged to a specific aircraft and classified by type automatically.' },
    { num: '03', icon: 'chat', title: 'Ask in Plain English', body: "Type any question about your aircraft's history, specs, maintenance, or compliance." },
    { num: '04', icon: 'citation', title: 'Get Answers with Citations', body: 'Every answer shows the source document, section, page number, and a highlighted snippet.' },
  ]
  return (
    <section id="how-it-works" className="py-24 bg-[#F8F9FB]">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#EFF6FF] border border-[#BFDBFE] text-[#2563EB] text-[12px] font-semibold uppercase tracking-wide mb-4">How It Works</div>
          <h2 className="text-[38px] font-extrabold text-[#0D1117] tracking-tight">From upload to answer<br/>in minutes.</h2>
        </div>
        <div className="relative">
          {/* Connector line */}
          <div className="hidden lg:block absolute top-10 left-[12.5%] right-[12.5%] h-px border-t-2 border-dashed border-[#CBD5E1]" style={{ top: '2.5rem' }}/>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {steps.map((s, i) => (
              <div key={s.num} className="relative flex flex-col items-center text-center">
                <div className="relative z-10 w-20 h-20 rounded-full bg-white border-2 border-[#E2E8F0] shadow-[0_4px_12px_rgba(0,0,0,0.08)] flex items-center justify-center mb-5 group hover:border-[#2563EB] hover:shadow-[0_4px_20px_rgba(37,99,235,0.2)] transition-all duration-200">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    {s.icon === 'upload' && <><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></>}
                    {s.icon === 'folder' && <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>}
                    {s.icon === 'chat' && <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>}
                    {s.icon === 'citation' && <><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/></>}
                  </svg>
                  <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-[#2563EB] text-white text-[11px] font-bold flex items-center justify-center">{i + 1}</span>
                </div>
                <h3 className="font-semibold text-[16px] text-[#0D1117] mb-2">{s.title}</h3>
                <p className="text-[14px] text-[#6B7280] leading-relaxed max-w-[200px]">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function FeaturesSection() {
  const features = [
    { icon: 'workspace', name: 'Aircraft Workspace', desc: 'One dedicated knowledge base per aircraft. All documents, history, and answers — organized by N-number.' },
    { icon: 'folder', name: 'Document Library', desc: 'Upload PDFs, scanned logs, Google Drive files. Auto-classified by type: logbook, POH, AFM, IPC, AD...' },
    { icon: 'chat', name: 'Ask AI with Citations', desc: 'Natural language queries answered from your documents only. Never from the internet. Always with page-level citations.' },
    { icon: 'lock', name: 'Private Library Option', desc: 'Keep documents private to your account or share with your team. You control who sees what.' },
    { icon: 'users', name: 'Team Roles + Access', desc: 'Add mechanics, pilots, admins, and guests. Role-based access with full audit trail.' },
    { icon: 'cloud', name: 'Google Drive Import', desc: 'Connect Drive folders and auto-sync. No manual re-uploading when documents change.' },
    { icon: 'scan', name: 'OCR for Scanned Docs', desc: 'Handwritten logs and scanned maintenance records processed with aviation-optimized OCR. (Pro+)' },
    { icon: 'history', name: 'Query History', desc: 'Every question and answer saved. Bookmark important answers for quick reference.' },
  ]
  const iconPaths: Record<string, React.ReactNode> = {
    workspace: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    folder: <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>,
    chat: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>,
    lock: <><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></>,
    users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
    cloud: <><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></>,
    scan: <><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/></>,
    history: <><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-5.1"/></>,
  }
  return (
    <section id="product" className="py-24 bg-white">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#EFF6FF] border border-[#BFDBFE] text-[#2563EB] text-[12px] font-semibold uppercase tracking-wide mb-4">Features</div>
          <h2 className="text-[38px] font-extrabold text-[#0D1117] tracking-tight">Everything your aircraft records need.</h2>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
          {features.map(f => (
            <div key={f.name} className="p-5 rounded-[14px] border border-[#E2E8F0] bg-[#F8F9FB] hover:bg-white hover:border-[#2563EB]/30 hover:shadow-[0_8px_24px_rgba(37,99,235,0.06)] transition-all duration-200 group">
              <div className="w-9 h-9 rounded-[9px] bg-white border border-[#E2E8F0] shadow-sm flex items-center justify-center mb-3 group-hover:border-[#2563EB]/30 group-hover:shadow-[0_2px_8px_rgba(37,99,235,0.12)] transition-all">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  {iconPaths[f.icon]}
                </svg>
              </div>
              <h3 className="font-semibold text-[14px] text-[#0D1117] mb-1.5">{f.name}</h3>
              <p className="text-[13px] text-[#6B7280] leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function WhoIsItForSection() {
  const roles = [
    { emoji: '✈', title: 'Aircraft Owners', pain: 'Maintenance history buried in binders and PDFs.', benefit: 'Ask about any inspection, AD, or repair — instantly.' },
    { emoji: '🔧', title: 'Mechanics / IAs', pain: 'Cross-referencing manuals and logbooks eats hours.', benefit: 'Find torque specs, procedures, and SB status in seconds.' },
    { emoji: '🏫', title: 'Flight Schools', pain: 'Fleet records scattered across staff and drives.', benefit: 'Centralized aircraft workspaces for every aircraft in the fleet.' },
    { emoji: '🔩', title: 'Repair Stations', pain: 'Locating applicable ADs and service bulletins takes time.', benefit: 'Compliance research grounded in your own documents.' },
    { emoji: '🛫', title: 'Part 135 Operators', pain: 'Compliance docs spread across crew, ops, and maintenance.', benefit: 'One searchable workspace per aircraft, with team access controls.' },
    { emoji: '📋', title: 'Prebuy Inspectors', pain: 'Reviewing aircraft records for a prebuy takes days.', benefit: 'Upload the logs, ask the hard questions, get cited answers.' },
  ]
  return (
    <section id="solutions" className="py-24 bg-[#F8F9FB]">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-14">
          <h2 className="text-[38px] font-extrabold text-[#0D1117] tracking-tight">Built for every role in aviation.</h2>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {roles.map(r => (
            <div key={r.title} className="p-6 rounded-[16px] bg-white border border-[#E2E8F0] shadow-[0_1px_3px_rgba(0,0,0,0.06)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] hover:-translate-y-0.5 transition-all duration-200">
              <div className="text-3xl mb-4">{r.emoji}</div>
              <h3 className="font-bold text-[17px] text-[#0D1117] mb-2">{r.title}</h3>
              <p className="text-[13px] text-[#6B7280] mb-2 leading-relaxed">{r.pain}</p>
              <p className="text-[13px] text-[#2563EB] font-medium leading-relaxed flex items-start gap-1.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 flex-shrink-0"><polyline points="20 6 9 17 4 12"/></svg>
                {r.benefit}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function SecuritySection() {
  return (
    <section id="security" className="py-24 bg-white">
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#ECFDF5] border border-[#A7F3D0] text-[#065F46] text-[12px] font-semibold uppercase tracking-wide mb-6">Evidence-first. Always.</div>
            <h2 className="text-[38px] font-extrabold text-[#0D1117] tracking-tight leading-tight mb-6">
              myaircraft.us never guesses.
            </h2>
            <p className="text-[18px] text-[#4B5563] leading-relaxed">
              Every answer is grounded in your uploaded documents, or it tells you there's insufficient evidence. No hallucinations. No guesses. Just citations.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[
              { icon: 'shield', title: 'Tenant Isolation', body: 'Your documents are never shared with other accounts.' },
              { icon: 'lock', title: 'Role-Based Access', body: 'Control who can view, query, and manage each aircraft.' },
              { icon: 'citation', title: 'Citations Required', body: 'No answer is returned without a traceable source document.' },
              { icon: 'history', title: 'Audit Logs', body: 'Full history of queries, uploads, and access. (Fleet+)' },
            ].map(item => (
              <div key={item.title} className="p-4 rounded-[12px] bg-[#F8F9FB] border border-[#E2E8F0]">
                <div className="w-8 h-8 rounded-[8px] bg-white border border-[#E2E8F0] shadow-sm flex items-center justify-center mb-3">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    {item.icon === 'shield' && <><path d="M12 2l8 3.5v5.5c0 4.5-3.5 8-8 9.5C7.5 19 4 15.5 4 11V5.5L12 2z"/><polyline points="9 12 11 14 15 10"/></>}
                    {item.icon === 'lock' && <><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></>}
                    {item.icon === 'citation' && <><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/></>}
                    {item.icon === 'history' && <><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-5.1"/></>}
                  </svg>
                </div>
                <h3 className="font-semibold text-[14px] text-[#0D1117] mb-1">{item.title}</h3>
                <p className="text-[13px] text-[#6B7280] leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function ComparisonSection() {
  const rows = [
    { feature: 'Aircraft organization', drive: false, ai: false, ma: true },
    { feature: 'Citation-backed answers', drive: false, ai: false, ma: true },
    { feature: 'Page-level source traceability', drive: false, ai: false, ma: true },
    { feature: 'Aviation document types', drive: false, ai: false, ma: true },
    { feature: 'Refuses to hallucinate', drive: null, ai: false, ma: true },
    { feature: 'Team access controls', drive: 'basic', ai: false, ma: true },
    { feature: 'Audit trail', drive: false, ai: false, ma: 'fleet+' },
    { feature: 'OCR for scanned logs', drive: false, ai: false, ma: 'pro+' },
  ]
  const Cell = ({ v }: { v: boolean | string | null }) => {
    if (v === true) return <span className="text-[#10B981]"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>
    if (v === false) return <span className="text-[#CBD5E1]"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></span>
    if (v === null) return <span className="text-[13px] text-[#9CA3AF]">N/A</span>
    return <span className="text-[12px] font-semibold text-[#2563EB] bg-[#EFF6FF] px-2 py-0.5 rounded-full">{v}</span>
  }
  return (
    <section className="py-24 bg-[#F8F9FB]">
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-12">
          <h2 className="text-[32px] font-extrabold text-[#0D1117] tracking-tight">Not just storage. Not just AI.<br/>Aviation records intelligence.</h2>
        </div>
        <div className="bg-white rounded-[16px] border border-[#E2E8F0] shadow-[0_4px_12px_rgba(0,0,0,0.06)] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#E2E8F0]">
                <th className="text-left p-4 text-[13px] font-semibold text-[#374151] w-[40%]">Feature</th>
                <th className="p-4 text-center text-[13px] font-semibold text-[#9CA3AF]">Google Drive</th>
                <th className="p-4 text-center text-[13px] font-semibold text-[#9CA3AF]">Generic AI</th>
                <th className="p-4 text-center text-[13px] font-semibold text-[#2563EB] bg-[#F5F9FF]">myaircraft.us</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.feature} className={`border-b border-[#F1F3F7] ${i % 2 === 0 ? '' : 'bg-[#FAFBFC]'}`}>
                  <td className="p-4 text-[14px] text-[#374151] font-medium">{r.feature}</td>
                  <td className="p-4 text-center"><div className="flex justify-center"><Cell v={r.drive}/></div></td>
                  <td className="p-4 text-center"><div className="flex justify-center"><Cell v={r.ai}/></div></td>
                  <td className="p-4 text-center bg-[#F5F9FF]"><div className="flex justify-center"><Cell v={r.ma}/></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

function TestimonialsSection() {
  const testimonials = [
    { name: 'Michael Torres', role: 'Cessna 182 Owner · 1,200 hrs TT', initials: 'MT', quote: "I spent 3 hours searching my logbooks before a prebuy inspection. Now I just ask. The citations make me confident I'm not missing anything." },
    { name: 'Rachel Kim', role: 'Director of Maintenance · SkyBridge Flight Academy', initials: 'RK', quote: 'Managing records for 12 aircraft used to require 3 people. myaircraft.us cut our records research time by 70%.' },
    { name: 'Dave Okonkwo', role: 'A&P/IA · Independent Mechanic', initials: 'DO', quote: 'I can cross-reference an AD against a maintenance manual and get the relevant section in 20 seconds. That used to take an hour.' },
  ]
  return (
    <section className="py-24 bg-white">
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-14">
          <h2 className="text-[32px] font-extrabold text-[#0D1117] tracking-tight">Trusted by aviation professionals.</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {testimonials.map(t => (
            <div key={t.name} className="p-6 rounded-[16px] bg-[#F8F9FB] border border-[#E2E8F0]">
              <div className="text-[#2563EB] mb-4">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="#2563EB" opacity="0.15"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/></svg>
              </div>
              <p className="text-[15px] text-[#374151] leading-relaxed mb-5 italic">"{t.quote}"</p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#2563EB] flex items-center justify-center text-white text-[13px] font-bold flex-shrink-0">{t.initials}</div>
                <div>
                  <p className="font-semibold text-[14px] text-[#0D1117]">{t.name}</p>
                  <p className="text-[12px] text-[#9CA3AF]">{t.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function FAQSection() {
  const [open, setOpen] = useState<number | null>(null)
  const faqs = [
    { q: 'What types of documents can I upload?', a: 'PDFs, scanned documents (JPEG, PNG), and Google Drive files. Supported types include aircraft logbooks, POH, AFM and supplements, maintenance manuals, service manuals, parts catalogs (IPC), work orders, inspection reports, 337 forms, 8130 forms, service bulletins, and airworthiness directives.' },
    { q: 'Can I keep my documents private?', a: 'Yes. Every document is private by default. You choose what to share with team members. Documents are never accessible to other organizations or used to train AI models.' },
    { q: 'Do answers always show citations?', a: "Yes, always. If the system cannot find sufficient evidence in your uploaded documents, it returns an 'Insufficient Evidence' response rather than guessing." },
    { q: 'Can my team access the same aircraft workspace?', a: 'Yes. Invite mechanics, pilots, admins, and guests. Each role has configurable permissions for viewing documents, running queries, and managing aircraft.' },
    { q: 'Is this a replacement for maintenance tracking software?', a: 'No. myaircraft.us is a document intelligence and search layer. It works alongside your existing maintenance tracking tools. Think of it as making all your existing records searchable and queryable.' },
    { q: 'How do you handle scanned or handwritten pages?', a: 'Scanned documents and handwritten logs are processed with OCR as part of the Pro and Fleet plans. Accuracy varies by scan quality. We surface confidence levels on every answer.' },
    { q: 'Can I import from Google Drive?', a: 'Yes. Connect a Google Drive folder and documents are automatically imported and indexed. Changes sync on a scheduled basis.' },
    { q: 'How do we get started?', a: "Book a demo and we'll walk you through setting up your organization and first aircraft workspace. Most teams are up and running in under 30 minutes." },
  ]
  return (
    <section className="py-24 bg-[#F8F9FB]">
      <div className="max-w-3xl mx-auto px-6">
        <div className="text-center mb-12">
          <h2 className="text-[32px] font-extrabold text-[#0D1117] tracking-tight">Frequently asked questions.</h2>
        </div>
        <div className="space-y-2">
          {faqs.map((faq, i) => (
            <div key={i} className="bg-white rounded-[12px] border border-[#E2E8F0] overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-5 py-4 text-left gap-4 hover:bg-[#F8F9FB] transition-colors"
                onClick={() => setOpen(open === i ? null : i)}
              >
                <span className="font-medium text-[15px] text-[#0D1117]">{faq.q}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  style={{ flexShrink: 0, transform: open === i ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 200ms ease' }}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>
              {open === i && (
                <div className="px-5 pb-4">
                  <p className="text-[14px] text-[#6B7280] leading-relaxed">{faq.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function FinalCTASection() {
  return (
    <section className="py-28" style={{ background: '#0D1117' }}>
      <div className="max-w-3xl mx-auto px-6 text-center">
        <h2 className="text-[42px] font-extrabold text-white tracking-tight leading-tight mb-4">
          Turn aircraft records into<br/>searchable intelligence.
        </h2>
        <p className="text-[18px] text-[#9CA3AF] mb-10">Set up your aircraft workspace in minutes.</p>
        <div className="flex flex-wrap justify-center gap-4 mb-8">
          <Link href="/signup"
            className="inline-flex items-center gap-2 px-8 py-4 text-[15px] font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-[12px] transition-all shadow-[0_4px_20px_rgba(37,99,235,0.4)] hover:shadow-[0_8px_32px_rgba(37,99,235,0.5)]"
          >
            Book Demo →
          </Link>
          <Link href="/signup"
            className="inline-flex items-center gap-2 px-8 py-4 text-[15px] font-medium text-white border border-[#2A3347] hover:border-[#4B5563] hover:bg-[#161B25] rounded-[12px] transition-all"
          >
            Get Started Free
          </Link>
        </div>
        <p className="text-[13px] text-[#6B7280]">No credit card required · 14-day free trial · Setup in under 30 minutes</p>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="bg-[#F8F9FB] border-t border-[#E2E8F0]">
      <div className="max-w-6xl mx-auto px-6 py-14 grid md:grid-cols-4 gap-8">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-[7px] bg-[#2563EB] flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3L20 8v2l-4 2v6l2 1v2l-6-2-6 2v-2l2-1v-6L4 10V8l8-5z"/></svg>
            </div>
            <span className="font-semibold text-[14px] text-[#0D1117]">myaircraft.us</span>
          </div>
          <p className="text-[13px] text-[#9CA3AF] leading-relaxed">Ask your aircraft anything.</p>
        </div>
        {[
          { heading: 'Product', links: ['Document Library', 'AI Search', 'Aircraft Workspaces', 'Team Access', 'Pricing'] },
          { heading: 'Solutions', links: ['Aircraft Owners', 'Flight Schools', 'Mechanics', 'Repair Stations', 'Part 135 Operators'] },
          { heading: 'Company', links: ['About', 'Security', 'Blog', 'Docs', 'Contact', 'Log in'] },
        ].map(col => (
          <div key={col.heading}>
            <h4 className="font-semibold text-[13px] text-[#0D1117] mb-3 uppercase tracking-wide">{col.heading}</h4>
            <ul className="space-y-2">
              {col.links.map(link => (
                <li key={link}>
                  <Link href="#" className="text-[13px] text-[#6B7280] hover:text-[#0D1117] transition-colors">{link}</Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-[#E2E8F0] px-6 py-4 max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] text-[#9CA3AF]">© 2025 myaircraft.us</p>
        <div className="flex gap-4">
          <Link href="#" className="text-[12px] text-[#9CA3AF] hover:text-[#374151]">Privacy Policy</Link>
          <Link href="#" className="text-[12px] text-[#9CA3AF] hover:text-[#374151]">Terms of Service</Link>
        </div>
      </div>
    </footer>
  )
}

export function MarketingHomePage() {
  return (
    <div className="min-h-screen bg-[#F8F9FB]">
      <MarketingNav />
      <HeroSection />
      <TrustBar />
      <WhyNowSection />
      <HowItWorksSection />
      <FeaturesSection />
      <WhoIsItForSection />
      <SecuritySection />
      <ComparisonSection />
      <TestimonialsSection />
      <FAQSection />
      <FinalCTASection />
      <Footer />
    </div>
  )
}
