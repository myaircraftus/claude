'use client'

/**
 * Org switcher UI — clean grid of "org cards" with the current one highlighted.
 * Click → POST /api/me/active-org → hard reload to /dashboard so server
 * components re-render against the new active_organization_id cookie.
 */

import { useState } from 'react'
import { toast } from 'sonner'
import {
  Building2, Plane, Wrench, GraduationCap, ShoppingBag, Briefcase,
  CheckCircle2, ArrowRight, Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import type { Organization, OrganizationMembership, OrgType } from '@/types'

const TYPE_ICON: Record<OrgType, any> = {
  owner:           Plane,
  shop:            Wrench,
  'flight-school': GraduationCap,
  fbo:             ShoppingBag,
  operator:        Briefcase,
}

const ROLE_PILL: Record<string, string> = {
  owner:    'bg-blue-50 text-blue-700 border-blue-200',
  admin:    'bg-violet-50 text-violet-700 border-violet-200',
  mechanic: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  pilot:    'bg-amber-50 text-amber-700 border-amber-200',
  viewer:   'bg-slate-100 text-slate-600 border-slate-200',
  auditor:  'bg-slate-100 text-slate-600 border-slate-200',
}

interface OrgRow {
  membership: OrganizationMembership
  organization: Pick<Organization, 'id' | 'name' | 'slug' | 'org_type' | 'home_base'>
}

export function OrgSwitchView({
  activeOrgId,
  memberships,
}: {
  activeOrgId: string
  memberships: OrgRow[]
}) {
  const [switchingTo, setSwitchingTo] = useState<string | null>(null)

  async function handleSwitch(orgId: string) {
    if (orgId === activeOrgId) return
    setSwitchingTo(orgId)
    try {
      const res = await fetch('/api/me/active-org', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organization_id: orgId }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        toast.error(j?.error || 'Switch failed')
        return
      }
      // Hard reload — server reads the new cookie + re-renders against the new org.
      window.location.assign('/dashboard')
    } catch {
      toast.error('Switch failed')
      setSwitchingTo(null)
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-[22px] tracking-tight text-foreground" style={{ fontWeight: 700 }}>
          Switch Organization
        </h1>
        <p className="text-[13px] text-muted-foreground mt-1">
          You belong to {memberships.length} organizations. Pick which one you want to view — the rest of the app re-scopes to that org's aircraft, work orders, invoices, and locations.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {memberships.map(({ membership, organization }) => {
          const isActive = organization.id === activeOrgId
          const Icon = TYPE_ICON[(organization.org_type ?? 'owner') as OrgType] ?? Building2
          const switching = switchingTo === organization.id
          return (
            <button
              key={organization.id}
              onClick={() => handleSwitch(organization.id)}
              disabled={isActive || switching}
              className={cn(
                'group text-left bg-white rounded-2xl border p-4 transition-all',
                isActive
                  ? 'border-primary ring-2 ring-primary/20 cursor-default'
                  : 'border-border hover:border-primary/40 hover:shadow-md cursor-pointer',
              )}
            >
              <div className="flex items-start gap-3">
                <div className={cn(
                  'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                  isActive ? 'bg-primary/10' : 'bg-muted',
                )}>
                  <Icon className={cn('h-5 w-5', isActive ? 'text-primary' : 'text-muted-foreground')} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[14px] text-foreground" style={{ fontWeight: 700 }}>
                      {organization.name}
                    </span>
                    {isActive && (
                      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded-full" style={{ fontWeight: 700 }}>
                        <CheckCircle2 className="h-2.5 w-2.5" /> Active
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className={cn(
                      'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] border capitalize',
                      ROLE_PILL[membership.role] ?? ROLE_PILL.viewer,
                    )} style={{ fontWeight: 600 }}>
                      {membership.role}
                    </span>
                    {organization.org_type && (
                      <span className="text-[11px] text-muted-foreground capitalize">
                        {organization.org_type.replace('-', ' ')}
                      </span>
                    )}
                    {organization.home_base && (
                      <span className="text-[11px] text-muted-foreground font-mono">
                        · {organization.home_base}
                      </span>
                    )}
                  </div>
                </div>
                {!isActive && !switching && (
                  <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1" />
                )}
                {switching && (
                  <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0 mt-1" />
                )}
              </div>
            </button>
          )
        })}
      </div>

      <div className="text-[11px] text-muted-foreground border-t border-border pt-3">
        <Building2 className="h-3 w-3 inline -mt-0.5 mr-1" />
        Belong to another organization? Ask their owner / admin to invite you. Once they accept your invite, the org appears here automatically.
      </div>
    </div>
  )
}
