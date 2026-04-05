'use client'

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Plane, ClipboardCheck, Wrench, Bell, FileText, ShoppingBag,
  Clock, TrendingUp, CheckCircle2, AlertCircle, Users, Fuel
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { OrgRole } from '@/types'

interface RoleWidgetsProps {
  role: OrgRole
  stats: {
    aircraftCount: number
    documentsIndexed: number
    overdueReminders: number
    dueSoonReminders: number
    totalSpend?: number
    pendingWorkOrders?: number
    lastFlightDate?: string | null
  }
}

export function RoleWidgets({ role, stats }: RoleWidgetsProps) {
  const widgets = getWidgetsForRole(role, stats)
  if (widgets.length === 0) return null

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <RoleIcon role={role} />
          <CardTitle className="text-base">
            {ROLE_TITLES[role] ?? 'Your dashboard'}
          </CardTitle>
          <Badge variant="outline" className="text-[10px] ml-auto">
            {role}
          </Badge>
        </div>
        <CardDescription className="text-xs">
          {ROLE_DESCRIPTIONS[role]}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {widgets.map((w, i) => (
            <Link
              key={i}
              href={w.href}
              className={cn(
                'group flex items-start gap-3 p-3 rounded-lg border border-border hover:border-brand-300 hover:bg-muted/30 transition-colors'
              )}
            >
              <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0', w.iconBg)}>
                <w.icon className={cn('h-4.5 w-4.5', w.iconColor)} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{w.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{w.subtitle}</p>
              </div>
              {w.badge && (
                <Badge variant="outline" className={cn('text-[10px] shrink-0', w.badgeClass)}>
                  {w.badge}
                </Badge>
              )}
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

const ROLE_TITLES: Record<string, string> = {
  owner: 'Owner view',
  admin: 'Admin view',
  mechanic: 'Mechanic view',
  pilot: 'Pilot view',
  viewer: 'Viewer view',
  auditor: 'Auditor view',
}

const ROLE_DESCRIPTIONS: Record<string, string> = {
  owner: 'Fleet overview, value, and maintenance liability.',
  admin: 'Team, permissions, billing, and system health.',
  mechanic: 'Open work, AD compliance, and documentation gaps.',
  pilot: 'Flight-ready status, logbook, and currency.',
  viewer: 'Read-only access to documents and queries.',
  auditor: 'Compliance, audit logs, and records integrity.',
}

function RoleIcon({ role }: { role: OrgRole }) {
  const map: Record<string, JSX.Element> = {
    owner: <TrendingUp className="h-4 w-4 text-amber-600" />,
    admin: <Users className="h-4 w-4 text-slate-600" />,
    mechanic: <Wrench className="h-4 w-4 text-blue-600" />,
    pilot: <Plane className="h-4 w-4 text-sky-600" />,
    viewer: <FileText className="h-4 w-4 text-muted-foreground" />,
    auditor: <ClipboardCheck className="h-4 w-4 text-violet-600" />,
  }
  return map[role] ?? map.viewer
}

interface Widget {
  title: string
  subtitle: string
  href: string
  icon: any
  iconBg: string
  iconColor: string
  badge?: string
  badgeClass?: string
}

function getWidgetsForRole(role: OrgRole, stats: RoleWidgetsProps['stats']): Widget[] {
  const overdueBadge = stats.overdueReminders > 0
    ? {
        badge: `${stats.overdueReminders} overdue`,
        badgeClass: 'bg-red-50 text-red-700 border-red-200',
      }
    : stats.dueSoonReminders > 0
      ? {
          badge: `${stats.dueSoonReminders} soon`,
          badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
        }
      : undefined

  switch (role) {
    case 'pilot':
      return [
        {
          title: 'Flight-ready aircraft',
          subtitle: `${stats.aircraftCount} in fleet`,
          href: '/aircraft',
          icon: Plane,
          iconBg: 'bg-sky-50',
          iconColor: 'text-sky-600',
        },
        {
          title: 'Logbook & currency',
          subtitle: stats.lastFlightDate ? `Last flight ${stats.lastFlightDate}` : 'No logbook entries yet',
          href: '/documents?doc_type=logbook',
          icon: Clock,
          iconBg: 'bg-indigo-50',
          iconColor: 'text-indigo-600',
        },
        {
          title: 'Upcoming inspections',
          subtitle: 'Annual / 100hr / VOR checks',
          href: '/reminders',
          icon: Bell,
          iconBg: 'bg-orange-50',
          iconColor: 'text-orange-600',
          ...overdueBadge,
        },
        {
          title: 'POH & Flight manuals',
          subtitle: 'Reference docs for your ride',
          href: '/documents?doc_type=poh',
          icon: FileText,
          iconBg: 'bg-brand-50',
          iconColor: 'text-brand-600',
        },
        {
          title: 'Ask a question',
          subtitle: 'V-speeds, procedures, limitations',
          href: '/ask',
          icon: Fuel,
          iconBg: 'bg-emerald-50',
          iconColor: 'text-emerald-600',
        },
      ]

    case 'mechanic':
      return [
        {
          title: 'AD compliance',
          subtitle: 'Applicable Airworthiness Directives',
          href: '/aircraft',
          icon: AlertCircle,
          iconBg: 'bg-yellow-50',
          iconColor: 'text-yellow-600',
        },
        {
          title: 'Maintenance tasks',
          subtitle: 'Active work and sign-offs',
          href: '/maintenance',
          icon: Wrench,
          iconBg: 'bg-blue-50',
          iconColor: 'text-blue-600',
        },
        {
          title: 'Reminders & due items',
          subtitle: 'Inspections & intervals',
          href: '/reminders',
          icon: Bell,
          iconBg: 'bg-orange-50',
          iconColor: 'text-orange-600',
          ...overdueBadge,
        },
        {
          title: 'Review queue',
          subtitle: 'OCR pages needing verification',
          href: '/documents/review',
          icon: ClipboardCheck,
          iconBg: 'bg-violet-50',
          iconColor: 'text-violet-600',
        },
        {
          title: 'Service manuals',
          subtitle: 'Community library & your own',
          href: '/marketplace',
          icon: ShoppingBag,
          iconBg: 'bg-emerald-50',
          iconColor: 'text-emerald-600',
        },
      ]

    case 'owner':
      return [
        {
          title: 'Fleet snapshot',
          subtitle: `${stats.aircraftCount} aircraft · ${stats.documentsIndexed} docs indexed`,
          href: '/aircraft',
          icon: Plane,
          iconBg: 'bg-amber-50',
          iconColor: 'text-amber-600',
        },
        {
          title: 'Maintenance liability',
          subtitle: 'Overdue + pending work',
          href: '/reminders',
          icon: AlertCircle,
          iconBg: 'bg-red-50',
          iconColor: 'text-red-600',
          ...overdueBadge,
        },
        {
          title: 'Records integrity',
          subtitle: 'Logbook gaps & AD status',
          href: '/documents',
          icon: CheckCircle2,
          iconBg: 'bg-emerald-50',
          iconColor: 'text-emerald-600',
        },
        {
          title: 'Team & permissions',
          subtitle: 'Who has access',
          href: '/settings?tab=members',
          icon: Users,
          iconBg: 'bg-slate-50',
          iconColor: 'text-slate-600',
        },
        {
          title: 'Marketplace',
          subtitle: 'Sell manuals, buy others',
          href: '/marketplace',
          icon: ShoppingBag,
          iconBg: 'bg-brand-50',
          iconColor: 'text-brand-600',
        },
      ]

    case 'admin':
      return [
        {
          title: 'Team members',
          subtitle: 'Invites, roles, access',
          href: '/settings?tab=members',
          icon: Users,
          iconBg: 'bg-slate-50',
          iconColor: 'text-slate-600',
        },
        {
          title: 'Billing & plan',
          subtitle: 'Subscription and usage',
          href: '/settings?tab=billing',
          icon: TrendingUp,
          iconBg: 'bg-emerald-50',
          iconColor: 'text-emerald-600',
        },
        {
          title: 'Integrations',
          subtitle: 'Google Drive, APIs, webhooks',
          href: '/settings?tab=integrations',
          icon: FileText,
          iconBg: 'bg-brand-50',
          iconColor: 'text-brand-600',
        },
      ]

    case 'auditor':
      return [
        {
          title: 'Audit logs',
          subtitle: 'Document and user actions',
          href: '/settings?tab=integrations',
          icon: ClipboardCheck,
          iconBg: 'bg-violet-50',
          iconColor: 'text-violet-600',
        },
        {
          title: 'Records integrity',
          subtitle: 'Verify logbook completeness',
          href: '/documents',
          icon: FileText,
          iconBg: 'bg-emerald-50',
          iconColor: 'text-emerald-600',
        },
      ]

    default: // viewer
      return [
        {
          title: 'Documents',
          subtitle: 'Read-only library',
          href: '/documents',
          icon: FileText,
          iconBg: 'bg-brand-50',
          iconColor: 'text-brand-600',
        },
        {
          title: 'Ask',
          subtitle: 'Query with citations',
          href: '/ask',
          icon: FileText,
          iconBg: 'bg-emerald-50',
          iconColor: 'text-emerald-600',
        },
      ]
  }
}
