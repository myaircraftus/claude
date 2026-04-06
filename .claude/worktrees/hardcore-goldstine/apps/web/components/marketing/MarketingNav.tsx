'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

const NAV_LINKS = [
  { label: 'Product',    href: '/product' },
  { label: 'Solutions',  href: '/solutions' },
  { label: 'Pricing',    href: '/pricing' },
  { label: 'Scanning',   href: '/scanning' },
  { label: 'Security',   href: '/security' },
  { label: 'Resources',  href: '/resources' },
  { label: 'Contact',    href: '/contact' },
]

export function MarketingNav() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 80)
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])

  return (
    <div className="fixed top-0 left-0 right-0 z-50">
      {/* Announcement Bar */}
      <div className="text-white text-center text-xs py-2" style={{ background: '#0c2d6b' }}>
        Free setup and ingestion assistance included — start with upload or onsite scanning
      </div>

      {/* Nav */}
      <nav
        className="transition-all duration-200"
        style={{
          background: scrolled ? 'rgba(255,255,255,0.95)' : 'transparent',
          backdropFilter: scrolled ? 'blur(12px)' : 'none',
          borderBottom: scrolled ? '1px solid rgba(15,23,42,0.08)' : '1px solid transparent',
          boxShadow: scrolled ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
        }}
      >
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#0c2d6b' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12l-2-2L12 3l9 7-2 2M5 12l7 7 7-7M5 12l2-2"/>
              </svg>
            </div>
            <span className="font-semibold text-[15px] text-[#0f172a] tracking-tight">myaircraft</span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map(item => (
              <Link
                key={item.label}
                href={item.href}
                className="px-3.5 py-2 text-[13px] text-[#64748b] hover:text-[#0f172a] rounded-lg hover:bg-[#f1f3f8] transition-all duration-150 font-medium"
              >
                {item.label}
              </Link>
            ))}
          </div>

          {/* Desktop CTA */}
          <div className="hidden md:flex items-center gap-2">
            <Link
              href="/signin"
              className="px-4 py-2 text-[13px] font-medium text-[#64748b] hover:text-[#0f172a] rounded-lg hover:bg-[#f1f3f8] transition-all duration-150"
            >
              Log In
            </Link>
            <Link
              href="/signup"
              className="px-4 py-2 text-[13px] font-semibold text-white rounded-lg transition-all duration-150"
              style={{ background: '#0c2d6b', boxShadow: '0 2px 8px rgba(12,45,107,0.25)' }}
            >
              Get Started →
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
            {NAV_LINKS.map(item => (
              <Link
                key={item.label}
                href={item.href}
                className="py-2.5 text-[15px] font-medium text-[#374151] border-b border-[#F1F3F7]"
                onClick={() => setMobileOpen(false)}
              >
                {item.label}
              </Link>
            ))}
            <div className="flex flex-col gap-2 pt-2">
              <Link href="/signin" className="w-full py-3 text-center text-[14px] font-medium text-[#374151] rounded-lg" style={{ border: '1px solid rgba(15,23,42,0.08)' }}>
                Log In
              </Link>
              <Link href="/signup" className="w-full py-3 text-center text-[14px] font-semibold text-white rounded-lg" style={{ background: '#0c2d6b' }}>
                Get Started →
              </Link>
            </div>
          </div>
        )}
      </nav>
    </div>
  )
}
