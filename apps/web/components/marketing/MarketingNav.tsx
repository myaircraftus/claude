'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

export function MarketingNav() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 80)
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 transition-all duration-200"
      style={{
        background: scrolled ? 'rgba(255,255,255,0.92)' : 'transparent',
        backdropFilter: scrolled ? 'blur(12px)' : 'none',
        borderBottom: scrolled ? '1px solid #E2E8F0' : '1px solid transparent',
        boxShadow: scrolled ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
      }}
    >
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-[8px] bg-[#2563EB] flex items-center justify-center shadow-[0_2px_8px_rgba(37,99,235,0.3)]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3L20 8v2l-4 2v6l2 1v2l-6-2-6 2v-2l2-1v-6L4 10V8l8-5z"/>
            </svg>
          </div>
          <span className="font-semibold text-[15px] text-[#0D1117] tracking-tight">myaircraft.us</span>
        </Link>

        {/* Desktop Nav */}
        <div className="hidden md:flex items-center gap-1">
          {['Product', 'How It Works', 'Solutions', 'Security', 'Pricing'].map(item => (
            <Link
              key={item}
              href={`#${item.toLowerCase().replace(/\s+/g, '-')}`}
              className="px-3.5 py-2 text-[14px] text-[#4B5563] hover:text-[#0D1117] rounded-[8px] hover:bg-[#F1F3F7] transition-all duration-150 font-medium"
            >
              {item}
            </Link>
          ))}
        </div>

        {/* Desktop CTA */}
        <div className="hidden md:flex items-center gap-2">
          <Link
            href="/signin"
            className="px-4 py-2 text-[14px] font-medium text-[#4B5563] hover:text-[#0D1117] rounded-[8px] hover:bg-[#F1F3F7] transition-all duration-150"
          >
            Log in
          </Link>
          <Link
            href="/demo"
            className="px-4 py-2 text-[14px] font-semibold text-[#2563EB] border border-[#2563EB] hover:bg-[#EFF6FF] rounded-[10px] transition-all duration-150"
          >
            Live Demo →
          </Link>
          <Link
            href="/signup"
            className="px-4 py-2 text-[14px] font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-[10px] transition-all duration-150 shadow-[0_2px_8px_rgba(37,99,235,0.25)] hover:shadow-[0_4px_16px_rgba(37,99,235,0.35)]"
          >
            Book Demo →
          </Link>
        </div>

        {/* Mobile menu button */}
        <button
          className="md:hidden p-2 rounded-[8px] hover:bg-[#F1F3F7]"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="1.5" strokeLinecap="round">
            {mobileOpen ? (
              <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>
            ) : (
              <><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></>
            )}
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden bg-white border-t border-[#E2E8F0] px-6 py-4 flex flex-col gap-2">
          {['Product', 'How It Works', 'Solutions', 'Security', 'Pricing'].map(item => (
            <Link
              key={item}
              href={`#${item.toLowerCase().replace(/\s+/g, '-')}`}
              className="py-2.5 text-[15px] font-medium text-[#374151] border-b border-[#F1F3F7]"
              onClick={() => setMobileOpen(false)}
            >
              {item}
            </Link>
          ))}
          <div className="flex flex-col gap-2 pt-2">
            <Link href="/signin" className="w-full py-3 text-center text-[15px] font-medium text-[#374151] border border-[#E2E8F0] rounded-[10px]">
              Log in
            </Link>
            <Link href="/demo" className="w-full py-3 text-center text-[15px] font-semibold text-[#2563EB] border border-[#2563EB] rounded-[10px]">
              Live Demo →
            </Link>
            <Link href="/signup" className="w-full py-3 text-center text-[15px] font-semibold text-white bg-[#2563EB] rounded-[10px]">
              Book Demo →
            </Link>
          </div>
        </div>
      )}
    </nav>
  )
}
