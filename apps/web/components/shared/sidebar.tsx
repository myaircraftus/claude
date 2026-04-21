'use client'

import Link from '@/components/shared/tenant-link'
import { usePathname, useSearchParams } from 'next/navigation'
import {
  LayoutDashboard,
  Plane,
  FileText,
  MessageSquare,
  History,
  Settings,
  Shield,
  ChevronDown,
  Wrench,
  Bell,
  ClipboardCheck,
  Plug2,
  ShoppingBag,
  ClipboardList,
  Package,
  ScanLine,
  Users,
  Receipt,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { Aircraft, Organization } from '@/types'

interface SidebarProps {
  organization: Organization
  aircraft: Aircraft[]
  selectedAircraftId?: string
  reminderCount?: number
  reviewQueueCount?: number
  isPlatformAdmin?: boolean
}

interface NavItem {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  badge?: number
}

interface NavSection {
  items: NavItem[]
}

export function Sidebar({
  organization,
  aircraft,
  selectedAircraftId,
  reminderCount,
  reviewQueueCount,
  isPlatformAdmin,
}: SidebarProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const currentTab = searchParams.get('tab')

  const navSections: NavSection[] = [
    {
      items: [
        { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
        { label: 'Ops Console', href: '/dashboard/ops', icon: Shield },
        { label: 'Aircraft', href: '/aircraft', icon: Plane },
        { label: 'Documents', href: '/documents', icon: FileText },
      ],
    },
    {
      items: [
        { label: 'Maintenance', href: '/maintenance', icon: Wrench },
        { label: 'Work Orders', href: '/maintenance?tab=work-orders', icon: ClipboardList },
        { label: 'Parts', href: '/maintenance?tab=parts', icon: Package },
        { label: 'Customers', href: '/customers', icon: Users },
        { label: 'Invoices', href: '/invoices', icon: Receipt },
        { label: 'Scanner', href: '/scanner', icon: ScanLine },
        { label: 'Reminders', href: '/reminders', icon: Bell, badge: reminderCount },
        { label: 'Review Queue', href: '/documents/review', icon: ClipboardCheck, badge: reviewQueueCount },
      ],
    },
    {
      items: [
        { label: 'Ask', href: '/ask', icon: MessageSquare },
        { label: 'History', href: '/history', icon: History },
      ],
    },
    {
      items: [
        { label: 'Integrations', href: '/integrations', icon: Plug2 },
        { label: 'Marketplace', href: '/marketplace', icon: ShoppingBag },
      ],
    },
  ]

  return (
    <aside className="w-60 flex-shrink-0 flex flex-col border-r border-border bg-card">
      {/* Logo + Org */}
      <div className="p-4 border-b border-border">
        <Link href="/dashboard" className="flex items-center gap-2 mb-3">
          <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
            <path d="M28 16L4 8L10 16L4 24L28 16Z" fill="#3b82f6" stroke="#60a5fa" strokeWidth="1.5" strokeLinejoin="round"/>
          </svg>
          <span className="font-bold text-foreground text-sm">myaircraft.us</span>
        </Link>
        <button className="w-full flex items-center gap-2 p-2 rounded-md hover:bg-accent text-left text-sm">
          <div className="w-6 h-6 rounded bg-brand-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {organization.name[0]?.toUpperCase()}
          </div>
          <span className="truncate font-medium text-foreground">{organization.name}</span>
          <ChevronDown className="h-3.5 w-3.5 ml-auto text-muted-foreground flex-shrink-0" />
        </button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-1">
          {/* Quick aircraft select */}
          {aircraft.length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-2 mb-1">
                Aircraft
              </p>
              {aircraft.slice(0, 5).map(ac => (
                <Link
                  key={ac.id}
                  href={`/aircraft/${ac.id}`}
                  className={cn(
                    'flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors',
                    selectedAircraftId === ac.id
                      ? 'bg-brand-50 text-brand-700 font-medium'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  )}
                >
                  <Plane className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="font-mono text-xs">{ac.tail_number}</span>
                  <span className="truncate text-xs">{ac.make} {ac.model}</span>
                </Link>
              ))}
              {aircraft.length > 5 && (
                <Link
                  href="/aircraft"
                  className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  +{aircraft.length - 5} more
                </Link>
              )}
            </div>
          )}

          {/* Main nav sections */}
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-2 mb-1">
            Navigation
          </p>
          {navSections.map((section, sectionIdx) => (
            <div key={sectionIdx}>
              {sectionIdx > 0 && (
                <div className="my-2 border-t border-border" />
              )}
              {section.items.map(({ label, href, icon: Icon, badge }) => {
                // Handle query-param-based routes (e.g. /maintenance?tab=work-orders)
                const [hrefPath, hrefQuery] = href.split('?')
                const hrefTab = hrefQuery ? new URLSearchParams(hrefQuery).get('tab') : null

                let isActive: boolean
                if (hrefTab) {
                  // Query-param route: active when path matches AND tab param matches
                  isActive = pathname === hrefPath && currentTab === hrefTab
                } else if (href === '/documents/review') {
                  isActive = pathname === href || pathname.startsWith(href + '/')
                } else if (href === '/documents') {
                  isActive = pathname === href || (pathname.startsWith(href + '/') && !pathname.startsWith('/documents/review'))
                } else if (href === '/maintenance') {
                  // Maintenance hub: active when on /maintenance with no tab or tab=entries
                  isActive = pathname === href && (!currentTab || currentTab === 'entries')
                } else {
                  isActive = pathname === href || pathname.startsWith(href + '/')
                }

                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                      isActive
                        ? 'bg-brand-50 text-brand-700 font-medium'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                    )}
                  >
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    <span className="flex-1">{label}</span>
                    {badge !== undefined && badge > 0 && (
                      <span className={cn(
                        'flex items-center justify-center rounded-full text-xs font-semibold min-w-[18px] h-[18px] px-1',
                        isActive
                          ? 'bg-brand-200 text-brand-800'
                          : 'bg-muted text-muted-foreground'
                      )}>
                        {badge > 99 ? '99+' : badge}
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Footer nav */}
      <div className="p-3 border-t border-border space-y-1">
        <Link
          href="/settings"
          className={cn(
            'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
            pathname.startsWith('/settings')
              ? 'bg-brand-50 text-brand-700 font-medium'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground'
          )}
        >
          <Settings className="h-4 w-4" />
          Settings
        </Link>
        {isPlatformAdmin && (
          <>
            <Link
              href="/admin"
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                pathname === '/admin' || (pathname.startsWith('/admin') && !pathname.startsWith('/admin/content'))
                  ? 'bg-brand-50 text-brand-700 font-medium'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              <Shield className="h-4 w-4" />
              Admin
            </Link>
            <Link
              href="/admin/content"
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                pathname.startsWith('/admin/content')
                  ? 'bg-brand-50 text-brand-700 font-medium'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              <FileText className="h-4 w-4" />
              Marketing CMS
            </Link>
          </>
        )}
      </div>
    </aside>
  )
}
