'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Plane,
  LayoutDashboard,
  MessageSquare,
  FileText,
  Wrench,
  Settings,
  Search,
  Bell,
  ChevronDown,
  LogOut,
  User,
  Sparkles,
  Shield,
  ClipboardCheck,
} from 'lucide-react'
import type { Aircraft, Organization } from '@/types'

interface SidebarProps {
  organization: Organization
  aircraft: Aircraft[]
  selectedAircraftId?: string
  reminderCount?: number
  reviewQueueCount?: number
}

const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
  { icon: Sparkles, label: 'Workspace', href: '/workspace' },
  { icon: Plane, label: 'Aircraft', href: '/aircraft' },
  { icon: MessageSquare, label: 'Ask', href: '/ask' },
  { icon: FileText, label: 'Documents', href: '/documents' },
  { icon: Wrench, label: 'Maintenance', href: '/maintenance' },
  { icon: Settings, label: 'Settings', href: '/settings' },
]

export function Sidebar({
  organization,
  aircraft,
  selectedAircraftId,
  reminderCount,
  reviewQueueCount,
}: SidebarProps) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  // Find selected aircraft for display
  const selectedAircraft = aircraft.find(a => a.id === selectedAircraftId) ?? aircraft[0]

  return (
    <aside
      className="flex flex-col shrink-0 transition-all duration-200"
      style={{
        width: collapsed ? 68 : 240,
        background: '#0c2d6b',
      }}
    >
      {/* Logo */}
      <div
        className="h-16 flex items-center px-4 gap-2.5 shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}
      >
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 hover:bg-white/10 transition-colors"
          style={{ background: 'rgba(255,255,255,0.1)' }}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <Plane className="w-5 h-5 text-white" />
        </button>
        {!collapsed && (
          <span className="text-white text-[15px] tracking-tight font-semibold">myaircraft</span>
        )}
      </div>

      {/* Aircraft selector */}
      {!collapsed && (
        <div className="mx-3 mt-4 mb-2">
          <Link
            href="/aircraft"
            className="block p-2.5 rounded-lg cursor-pointer transition-colors"
            style={{ background: '#163a7a' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
            onMouseLeave={e => (e.currentTarget.style.background = '#163a7a')}
          >
            <div className="flex items-center justify-between">
              <div>
                <div
                  className="text-[11px] uppercase tracking-wider font-semibold mb-0.5"
                  style={{ color: 'rgba(255,255,255,0.5)' }}
                >
                  Aircraft
                </div>
                <div className="text-white text-[13px] font-medium">
                  {selectedAircraft ? selectedAircraft.tail_number : 'Select aircraft'}
                </div>
              </div>
              <ChevronDown className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.4)' }} />
            </div>
          </Link>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== '/dashboard' && pathname.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] transition-colors"
              style={{
                background: active ? '#163a7a' : 'transparent',
                color: active ? '#ffffff' : 'rgba(255,255,255,0.7)',
                fontWeight: active ? 500 : 400,
              }}
              onMouseEnter={e => {
                if (!active) {
                  e.currentTarget.style.background = 'rgba(22,58,122,0.5)'
                  e.currentTarget.style.color = '#ffffff'
                }
              }}
              onMouseLeave={e => {
                if (!active) {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = 'rgba(255,255,255,0.7)'
                }
              }}
            >
              <item.icon className="w-[18px] h-[18px] shrink-0" />
              {!collapsed && item.label}
            </Link>
          )
        })}

        {/* Reminder badge */}
        {!collapsed && reminderCount !== undefined && reminderCount > 0 && (
          <Link
            href="/reminders"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] transition-colors"
            style={{
              background: pathname.startsWith('/reminders') ? '#163a7a' : 'transparent',
              color: pathname.startsWith('/reminders') ? '#ffffff' : 'rgba(255,255,255,0.7)',
            }}
            onMouseEnter={e => {
              if (!pathname.startsWith('/reminders')) {
                e.currentTarget.style.background = 'rgba(22,58,122,0.5)'
                e.currentTarget.style.color = '#ffffff'
              }
            }}
            onMouseLeave={e => {
              if (!pathname.startsWith('/reminders')) {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = 'rgba(255,255,255,0.7)'
              }
            }}
          >
            <Bell className="w-[18px] h-[18px] shrink-0" />
            <span className="flex-1">Reminders</span>
            <span className="ml-auto bg-amber-500 text-white text-[10px] font-semibold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
              {reminderCount > 99 ? '99+' : reminderCount}
            </span>
          </Link>
        )}

        {/* Review queue badge */}
        {!collapsed && reviewQueueCount !== undefined && reviewQueueCount > 0 && (
          <Link
            href="/documents/review"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] transition-colors"
            style={{
              background: pathname === '/documents/review' ? '#163a7a' : 'transparent',
              color: pathname === '/documents/review' ? '#ffffff' : 'rgba(255,255,255,0.7)',
            }}
            onMouseEnter={e => {
              if (pathname !== '/documents/review') {
                e.currentTarget.style.background = 'rgba(22,58,122,0.5)'
                e.currentTarget.style.color = '#ffffff'
              }
            }}
            onMouseLeave={e => {
              if (pathname !== '/documents/review') {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = 'rgba(255,255,255,0.7)'
              }
            }}
          >
            <ClipboardCheck className="w-[18px] h-[18px] shrink-0" />
            <span className="flex-1">Review Queue</span>
            <span className="ml-auto bg-blue-500 text-white text-[10px] font-semibold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
              {reviewQueueCount > 99 ? '99+' : reviewQueueCount}
            </span>
          </Link>
        )}

        {/* Admin link */}
        <Link
          href="/admin"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] transition-colors"
          style={{
            background: pathname.startsWith('/admin') ? '#163a7a' : 'transparent',
            color: pathname.startsWith('/admin') ? '#ffffff' : 'rgba(255,255,255,0.7)',
          }}
          onMouseEnter={e => {
            if (!pathname.startsWith('/admin')) {
              e.currentTarget.style.background = 'rgba(22,58,122,0.5)'
              e.currentTarget.style.color = '#ffffff'
            }
          }}
          onMouseLeave={e => {
            if (!pathname.startsWith('/admin')) {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = 'rgba(255,255,255,0.7)'
            }
          }}
        >
          <Shield className="w-[18px] h-[18px] shrink-0" />
          {!collapsed && 'Admin'}
        </Link>
      </nav>

      {/* User footer */}
      <div className="p-3 shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
        <div className="flex items-center gap-2.5 px-2">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
            style={{ background: '#163a7a' }}
          >
            <User className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.7)' }} />
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <div className="text-white text-[13px] font-medium truncate">
                {organization.name}
              </div>
              <div className="text-[11px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
                Owner
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
