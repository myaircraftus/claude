'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Bell, LogOut, User, ChevronRight, Search } from 'lucide-react'
import { createBrowserSupabase } from '@/lib/supabase/browser'
import type { UserProfile } from '@/types'

interface BreadcrumbItem {
  label: string
  href?: string
}

interface TopbarProps {
  profile: UserProfile
  breadcrumbs?: BreadcrumbItem[]
  actions?: React.ReactNode
}

export function Topbar({ profile, breadcrumbs = [], actions }: TopbarProps) {
  const router = useRouter()
  const [search, setSearch] = useState('')

  async function handleSignOut() {
    const supabase = createBrowserSupabase()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const initials = profile.full_name
    ?.split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) ?? profile.email[0]?.toUpperCase() ?? '?'

  return (
    <header
      className="h-16 flex items-center justify-between px-6 shrink-0 bg-white"
      style={{ borderBottom: '1px solid rgba(15,23,42,0.08)' }}
    >
      {/* Left: breadcrumbs or search */}
      <div className="flex items-center gap-4 flex-1 max-w-lg">
        {breadcrumbs.length > 0 && (
          <nav className="flex items-center gap-1 text-sm mr-4">
            {breadcrumbs.map((item, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-[#64748b]" />}
                {item.href ? (
                  <Link href={item.href} className="text-[#64748b] hover:text-[#0f172a] transition-colors text-[13px]">
                    {item.label}
                  </Link>
                ) : (
                  <span className={`text-[13px] ${i === breadcrumbs.length - 1 ? 'text-[#0f172a] font-medium' : 'text-[#64748b]'}`}>
                    {item.label}
                  </span>
                )}
              </span>
            ))}
          </nav>
        )}

        <div
          className="flex-1 flex items-center gap-2 rounded-lg px-3 py-2"
          style={{ background: '#f1f3f8' }}
        >
          <Search className="w-4 h-4 text-[#64748b] shrink-0" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search or ask your aircraft..."
            className="bg-transparent text-[13px] outline-none flex-1 placeholder:text-[#64748b]/60 text-[#0f172a]"
          />
          <kbd
            className="text-[10px] text-[#64748b] bg-white px-1.5 py-0.5 rounded shrink-0"
            style={{ border: '1px solid rgba(15,23,42,0.08)' }}
          >
            /
          </kbd>
        </div>
      </div>

      {/* Right: actions + notification + user */}
      <div className="flex items-center gap-2 ml-4">
        {actions}

        <button
          className="p-2 rounded-lg transition-colors hover:bg-[#f1f3f8]"
          title="Notifications"
        >
          <Bell className="w-[18px] h-[18px] text-[#64748b]" />
        </button>

        <button
          onClick={handleSignOut}
          className="p-2 rounded-lg transition-colors hover:bg-[#f1f3f8]"
          title="Sign out"
        >
          <LogOut className="w-[18px] h-[18px] text-[#64748b]" />
        </button>

        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-semibold text-white ml-1 shrink-0"
          style={{ background: '#0c2d6b' }}
          title={profile.full_name ?? profile.email}
        >
          {initials}
        </div>
      </div>
    </header>
  )
}
