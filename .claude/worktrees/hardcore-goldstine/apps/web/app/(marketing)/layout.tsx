import { MarketingNav } from '@/components/marketing/MarketingNav'
import Link from 'next/link'

function Footer() {
  return (
    <footer className="bg-[#F8F9FB] border-t border-[#E2E8F0]">
      <div className="max-w-6xl mx-auto px-6 py-14 grid md:grid-cols-4 gap-8">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-[7px] bg-[#2563EB] flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3L20 8v2l-4 2v6l2 1v2l-6-2-6 2v-2l2-1v-6L4 10V8l8-5z"/>
              </svg>
            </div>
            <span className="font-semibold text-[14px] text-[#0D1117]">myaircraft.us</span>
          </div>
          <p className="text-[13px] text-[#9CA3AF] leading-relaxed">Ask your aircraft anything.</p>
        </div>
        {[
          { heading: 'Product', links: [
            { label: 'Product', href: '/product' },
            { label: 'Pricing', href: '/pricing' },
            { label: 'Scanning', href: '/scanning' },
            { label: 'Security', href: '/security' },
          ]},
          { heading: 'Solutions', links: [
            { label: 'Aircraft Owners', href: '/solutions' },
            { label: 'A&P Mechanics', href: '/solutions' },
            { label: 'Fleet Managers', href: '/solutions' },
            { label: 'Inspectors', href: '/solutions' },
          ]},
          { heading: 'Company', links: [
            { label: 'Resources', href: '/resources' },
            { label: 'Security', href: '/security' },
            { label: 'Log In', href: '/signin' },
            { label: 'Sign Up', href: '/signup' },
          ]},
        ].map(col => (
          <div key={col.heading}>
            <h4 className="font-semibold text-[13px] text-[#0D1117] mb-3 uppercase tracking-wide">{col.heading}</h4>
            <ul className="space-y-2">
              {col.links.map(link => (
                <li key={link.label}>
                  <Link href={link.href} className="text-[13px] text-[#6B7280] hover:text-[#0D1117] transition-colors">{link.label}</Link>
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

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-[#F8F9FB]">
      <MarketingNav />
      <main>{children}</main>
      <Footer />
    </div>
  )
}
