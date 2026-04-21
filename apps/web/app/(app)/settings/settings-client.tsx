'use client'

import React, { useState } from 'react'
import { useTenantRouter } from '@/components/shared/tenant-link'
import {
  Building2, Users, Plug, CreditCard, AlertTriangle, DollarSign,
  Loader2, Check, Trash2, UserPlus, ChevronDown, ExternalLink,
  CheckCircle2, FileUp, Lock, Unlock, Download, FileText,
  RefreshCw, Clock, Plane, AlertCircle, XCircle, Wrench, Send,
  Search, Phone, Mail, User, Link2,
} from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogTrigger, DialogDescription
} from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { createBrowserSupabase } from '@/lib/supabase/browser'
import { PLAN_LABELS, formatBytes, formatDate, cn, DOC_TYPE_LABELS } from '@/lib/utils'
import type {
  UserProfile, Organization, OrgRole, DocType, UploaderRole,
  ManualAccess, ListingStatus, Visibility
} from '@/types'

// My Uploads row type (server pre-selects these columns)
interface MyUploadRow {
  id: string
  title: string
  doc_type: DocType
  file_size_bytes: number | null
  uploaded_at: string
  uploader_role: UploaderRole | null
  allow_download: boolean
  community_listing: boolean
  manual_access: ManualAccess | null
  price_cents: number | null
  listing_status: ListingStatus | null
  download_count: number
  visibility: Visibility
  aircraft: { id: string; tail_number: string; make: string; model: string } | null
}

interface Member {
  id: string
  role: string
  permissions: Record<string, boolean>
  invited_at: string
  accepted_at?: string
  stripe_connect_account_id?: string
  stripe_connect_onboarded?: boolean
  user_profiles: { id: string; email: string; full_name?: string; avatar_url?: string } | null
}

const PERMISSION_LABELS: Record<string, string> = {
  can_create_wo: 'Create work orders',
  can_see_rates: 'View rates & pricing',
  can_invoice: 'Create & send invoices',
  can_approve: 'Approve work orders',
  can_manage_customers: 'Manage customers',
}

interface Integration {
  id: string
  provider: string
  display_name: string
  status: string
  last_sync_at: string | null
  aircraft_count_synced: number | null
  last_sync_status: string | null
  last_sync_error: string | null
  settings: Record<string, unknown>
  created_at: string
}

const PROVIDER_CONFIG: Record<string, {
  name: string
  description: string
  logo: string
  color: string
  fields: { key: string; label: string; placeholder: string; required?: boolean }[]
  comingSoon?: boolean
}> = {
  flight_schedule_pro: {
    name: 'Flight Schedule Pro',
    description: 'Sync aircraft, squawks, and flight hours from FSP. Automatically imports maintenance discrepancies and time tracking.',
    logo: 'FSP',
    color: 'bg-sky-100 text-sky-700',
    fields: [
      { key: 'api_key', label: 'API Key', placeholder: 'Enter your Flight Schedule Pro API key', required: true },
      { key: 'account_id', label: 'Account ID (optional)', placeholder: 'Multi-location account ID' },
    ],
  },
  flight_circle: {
    name: 'Flight Circle',
    description: 'Import aircraft fleet data and flight hours from Flight Circle. Keeps hobbs and tach times in sync.',
    logo: 'FC',
    color: 'bg-emerald-100 text-emerald-700',
    fields: [
      { key: 'api_key', label: 'API Key', placeholder: 'Enter your Flight Circle API key', required: true },
    ],
  },
  myfbo: {
    name: 'MyFBO',
    description: 'Connect your MyFBO account to sync fuel purchases, aircraft scheduling, and customer records.',
    logo: 'MF',
    color: 'bg-orange-100 text-orange-700',
    fields: [],
    comingSoon: true,
  },
  avianis: {
    name: 'Avianis',
    description: 'Integrate with Avianis FBO management for fuel, hangar, and aircraft data synchronization.',
    logo: 'AV',
    color: 'bg-indigo-100 text-indigo-700',
    fields: [],
    comingSoon: true,
  },
  fl3xx: {
    name: 'FL3XX',
    description: 'Sync fleet, trip, and maintenance data from your FL3XX charter management platform.',
    logo: 'FL',
    color: 'bg-violet-100 text-violet-700',
    fields: [],
    comingSoon: true,
  },
  leon: {
    name: 'Leon Software',
    description: 'Connect Leon for crew scheduling, flight planning, and aircraft maintenance tracking.',
    logo: 'LE',
    color: 'bg-rose-100 text-rose-700',
    fields: [],
    comingSoon: true,
  },
  talon: {
    name: 'TalonETA / RMS',
    description: 'Import repair station data, work orders, and parts inventory from TalonETA or RMS.',
    logo: 'TL',
    color: 'bg-amber-100 text-amber-700',
    fields: [],
    comingSoon: true,
  },
}

interface Props {
  profile: UserProfile
  organization: Organization
  role: string
  members: Member[]
  driveConnection: { id: string; google_email?: string; is_active: boolean; created_at: string } | null
  integrations: Integration[]
  myUploads: MyUploadRow[]
  defaultTab: string
  showUpgradeSuccess: boolean
}

const PLAN_FEATURES = {
  starter: { price: '$29/mo', aircraft: 1, storage: '2 GB', queries: 100, ocr: false, drive: false },
  pro: { price: '$99/mo', aircraft: 5, storage: '20 GB', queries: 1000, ocr: true, drive: true },
  fleet: { price: '$299/mo', aircraft: 25, storage: '100 GB', queries: 10000, ocr: true, drive: true },
  enterprise: { price: 'Contact us', aircraft: 'Unlimited', storage: 'Custom', queries: 'Unlimited', ocr: true, drive: true },
}

export function SettingsClient({
  profile, organization, role, members, driveConnection, integrations: initialIntegrations, myUploads, defaultTab, showUpgradeSuccess
}: Props) {
  const router = useTenantRouter()
  const [orgName, setOrgName] = useState(organization.name)
  const [savingOrg, setSavingOrg] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<OrgRole>('viewer')
  const [inviting, setInviting] = useState(false)
  const [inviteSuccess, setInviteSuccess] = useState(false)
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false)
  const [billingLoading, setBillingLoading] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')

  // Mechanic invites state
  const [mechanicInvites, setMechanicInvites] = useState<any[]>([])
  const [mechanicInvitesLoaded, setMechanicInvitesLoaded] = useState(false)
  const [mechanicInviteLoading, setMechanicInviteLoading] = useState(false)
  const [showInviteMechanicDialog, setShowInviteMechanicDialog] = useState(false)
  const [mechanicSearch, setMechanicSearch] = useState('')
  const [mechanicSearchResults, setMechanicSearchResults] = useState<any[]>([])
  const [mechanicSearching, setMechanicSearching] = useState(false)
  const [newMechanicName, setNewMechanicName] = useState('')
  const [newMechanicEmail, setNewMechanicEmail] = useState('')
  const [newMechanicPhone, setNewMechanicPhone] = useState('')
  const [mechanicInviteError, setMechanicInviteError] = useState('')

  // Integration state
  const [integrations, setIntegrations] = useState<Integration[]>(initialIntegrations)
  const [connectDialogOpen, setConnectDialogOpen] = useState<string | null>(null)
  const [connectCredentials, setConnectCredentials] = useState<Record<string, string>>({})
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState<string | null>(null)
  const [syncResult, setSyncResult] = useState<{ provider: string; message: string } | null>(null)

  const isOwner = role === 'owner'
  const isAdmin = role === 'admin' || isOwner

  async function loadMechanicInvites() {
    if (mechanicInvitesLoaded) return
    setMechanicInviteLoading(true)
    const supabase = createBrowserSupabase()
    const { data } = await supabase
      .from('mechanic_invites')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)
    setMechanicInvites(data ?? [])
    setMechanicInvitesLoaded(true)
    setMechanicInviteLoading(false)
  }

  async function searchMechanics(q: string) {
    if (!q.trim()) { setMechanicSearchResults([]); return }
    setMechanicSearching(true)
    const res = await fetch(`/api/mechanics/search?q=${encodeURIComponent(q)}`)
    const json = await res.json()
    setMechanicSearchResults(json.mechanics ?? [])
    setMechanicSearching(false)
  }

  async function sendMechanicInvite() {
    if (!newMechanicName.trim()) { setMechanicInviteError('Name is required'); return }
    if (!newMechanicEmail.trim() && !newMechanicPhone.trim()) {
      setMechanicInviteError('Email or phone is required')
      return
    }
    setMechanicInviteLoading(true)
    setMechanicInviteError('')
    const res = await fetch('/api/mechanics/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mechanic_name: newMechanicName.trim(),
        mechanic_email: newMechanicEmail.trim() || undefined,
        mechanic_phone: newMechanicPhone.trim() || undefined,
      }),
    })
    const json = await res.json()
    setMechanicInviteLoading(false)
    if (!res.ok) {
      setMechanicInviteError(json.error ?? 'Failed to send invite')
      return
    }
    setShowInviteMechanicDialog(false)
    setNewMechanicName('')
    setNewMechanicEmail('')
    setNewMechanicPhone('')
    setMechanicInvitesLoaded(false)
    loadMechanicInvites()
  }

  async function saveOrgName() {
    setSavingOrg(true)
    const supabase = createBrowserSupabase()
    await supabase
      .from('organizations')
      .update({ name: orgName })
      .eq('id', organization.id)
    setSavingOrg(false)
    router.refresh()
  }

  async function handleInvite() {
    setInviting(true)
    const res = await fetch('/api/settings/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
    })
    setInviting(false)
    if (res.ok) {
      setInviteSuccess(true)
      setInviteEmail('')
      setTimeout(() => {
        setInviteSuccess(false)
        setInviteDialogOpen(false)
        router.refresh()
      }, 1500)
    }
  }

  async function removeMember(membershipId: string) {
    const supabase = createBrowserSupabase()
    await supabase.from('organization_memberships').delete().eq('id', membershipId)
    router.refresh()
  }

  async function changeRole(membershipId: string, newRole: OrgRole) {
    const supabase = createBrowserSupabase()
    await supabase
      .from('organization_memberships')
      .update({ role: newRole })
      .eq('id', membershipId)
    router.refresh()
  }

  async function openBillingPortal() {
    setBillingLoading(true)
    const res = await fetch('/api/billing/portal', { method: 'POST' })
    const data = await res.json()
    setBillingLoading(false)
    if (data.url) window.open(data.url, '_blank')
  }

  async function disconnectDrive() {
    const supabase = createBrowserSupabase()
    await supabase
      .from('gdrive_connections')
      .update({ is_active: false })
      .eq('id', driveConnection!.id)
    router.refresh()
  }

  async function connectIntegration(provider: string) {
    setConnecting(true)
    setConnectError(null)
    try {
      const res = await fetch('/api/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, credentials: connectCredentials, settings: {} }),
      })
      const data = await res.json()
      if (!res.ok) {
        setConnectError(data.error ?? 'Failed to connect')
        setConnecting(false)
        return
      }
      // Update local state
      setIntegrations(prev => {
        const idx = prev.findIndex(i => i.provider === provider)
        if (idx >= 0) {
          const updated = [...prev]
          updated[idx] = data.integration
          return updated
        }
        return [...prev, data.integration]
      })
      setConnectDialogOpen(null)
      setConnectCredentials({})
    } catch {
      setConnectError('Network error. Please try again.')
    }
    setConnecting(false)
  }

  async function disconnectIntegration(integrationId: string, _provider: string) {
    const res = await fetch(`/api/integrations?id=${integrationId}`, { method: 'DELETE' })
    if (res.ok) {
      setIntegrations(prev => prev.filter(i => i.id !== integrationId))
    }
  }

  async function syncIntegration(integrationId: string, provider: string) {
    setSyncing(provider)
    setSyncResult(null)
    try {
      const res = await fetch(`/api/integrations/${integrationId}/sync`, { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setSyncResult({ provider, message: `Synced ${data.records_synced ?? 0} records (${data.aircraft_synced ?? 0} aircraft)` })
        // Refresh integrations to get updated last_sync_at
        const listRes = await fetch('/api/integrations')
        if (listRes.ok) {
          const listData = await listRes.json()
          setIntegrations(listData.integrations ?? [])
        }
      } else {
        setSyncResult({ provider, message: data.error ?? 'Sync failed' })
      }
    } catch {
      setSyncResult({ provider, message: 'Network error during sync' })
    }
    setSyncing(null)
  }

  function getIntegration(provider: string): Integration | undefined {
    return integrations.find(i => i.provider === provider && i.status === 'connected')
  }

  function formatRelativeTime(dateStr: string | null): string {
    if (!dateStr) return 'Never'
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHrs = Math.floor(diffMins / 60)
    if (diffHrs < 24) return `${diffHrs}h ago`
    const diffDays = Math.floor(diffHrs / 24)
    return `${diffDays}d ago`
  }

  const storageUsedGB = 0 // TODO: fetch from aggregate query
  const storagePercent = Math.min(100, (storageUsedGB / organization.plan_storage_gb) * 100)
  const queryPercent = Math.min(100, (organization.queries_used_this_month / organization.plan_queries_monthly) * 100)

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto">
        {showUpgradeSuccess && (
          <Alert variant="success" className="mb-4">
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>Plan upgraded successfully! Your new limits are active.</AlertDescription>
          </Alert>
        )}

        <Tabs defaultValue={defaultTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="organization"><Building2 className="h-4 w-4 mr-1.5" />Organization</TabsTrigger>
            <TabsTrigger value="members"><Users className="h-4 w-4 mr-1.5" />Members</TabsTrigger>
            <TabsTrigger value="mechanics"><Wrench className="h-4 w-4 mr-1.5" />Mechanics</TabsTrigger>
            <TabsTrigger value="integrations"><Plug className="h-4 w-4 mr-1.5" />Integrations</TabsTrigger>
            <TabsTrigger value="uploads"><FileUp className="h-4 w-4 mr-1.5" />My Uploads</TabsTrigger>
            <TabsTrigger value="billing"><CreditCard className="h-4 w-4 mr-1.5" />Billing</TabsTrigger>
            {isAdmin && <TabsTrigger value="payments"><DollarSign className="h-4 w-4 mr-1.5" />Payments</TabsTrigger>}
            {isOwner && <TabsTrigger value="danger"><AlertTriangle className="h-4 w-4 mr-1.5" />Danger</TabsTrigger>}
          </TabsList>

          {/* Organization tab */}
          <TabsContent value="organization" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Organization Details</CardTitle>
                <CardDescription>Update your organization name and branding</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Organization name</Label>
                  <div className="flex gap-2">
                    <Input
                      value={orgName}
                      onChange={e => setOrgName(e.target.value)}
                      disabled={!isAdmin}
                    />
                    {isAdmin && (
                      <Button onClick={saveOrgName} disabled={savingOrg || orgName === organization.name}>
                        {savingOrg ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        Save
                      </Button>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Slug</Label>
                  <p className="text-sm text-muted-foreground font-mono">{organization.slug}</p>
                </div>
                <div className="space-y-1">
                  <Label>Plan</Label>
                  <p className="text-sm"><Badge>{PLAN_LABELS[organization.plan]}</Badge></p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Members tab */}
          <TabsContent value="members" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Team Members</CardTitle>
                  <CardDescription>{members.length} member{members.length !== 1 ? 's' : ''}</CardDescription>
                </div>
                {isAdmin && (
                  <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm"><UserPlus className="h-4 w-4" />Invite</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Invite team member</DialogTitle>
                        <DialogDescription>Send an invitation to join your organization</DialogDescription>
                      </DialogHeader>
                      {inviteSuccess ? (
                        <div className="text-center py-6">
                          <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-2" />
                          <p className="text-sm text-muted-foreground">Invitation sent!</p>
                        </div>
                      ) : (
                        <>
                          <div className="space-y-3 py-2">
                            <div className="space-y-1.5">
                              <Label>Email address</Label>
                              <Input
                                type="email"
                                placeholder="pilot@example.com"
                                value={inviteEmail}
                                onChange={e => setInviteEmail(e.target.value)}
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label>Role</Label>
                              <Select value={inviteRole} onValueChange={v => setInviteRole(v as OrgRole)}>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="viewer">Viewer — read-only access</SelectItem>
                                  <SelectItem value="pilot">Pilot — flight ops & logbook</SelectItem>
                                  <SelectItem value="mechanic">Mechanic — can upload & query</SelectItem>
                                  <SelectItem value="admin">Admin — full access</SelectItem>
                                  {isOwner && <SelectItem value="owner">Owner — full control</SelectItem>}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <DialogFooter>
                            <Button variant="outline" onClick={() => setInviteDialogOpen(false)}>Cancel</Button>
                            <Button onClick={handleInvite} disabled={!inviteEmail || inviting}>
                              {inviting && <Loader2 className="h-4 w-4 animate-spin" />}
                              Send invitation
                            </Button>
                          </DialogFooter>
                        </>
                      )}
                    </DialogContent>
                  </Dialog>
                )}
              </CardHeader>
              <CardContent>
                <div className="divide-y divide-border">
                  {members.map(member => {
                    const up = member.user_profiles
                    const initials = up?.full_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
                      ?? up?.email[0]?.toUpperCase() ?? '?'
                    const isPending = !member.accepted_at
                    return (
                      <React.Fragment key={member.id}>
                      <div className="flex items-center gap-3 py-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={up?.avatar_url ?? undefined} />
                          <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{up?.full_name ?? up?.email}</p>
                          <p className="text-xs text-muted-foreground">{up?.email}</p>
                        </div>
                        {isPending && <Badge variant="secondary" className="text-xs">Pending</Badge>}
                        {isAdmin && !isPending ? (
                          <Select
                            value={member.role}
                            onValueChange={v => changeRole(member.id, v as OrgRole)}
                          >
                            <SelectTrigger className="h-8 w-32 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="viewer">Viewer</SelectItem>
                              <SelectItem value="auditor">Auditor</SelectItem>
                              <SelectItem value="pilot">Pilot</SelectItem>
                              <SelectItem value="mechanic">Mechanic</SelectItem>
                              <SelectItem value="admin">Admin</SelectItem>
                              {isOwner && <SelectItem value="owner">Owner</SelectItem>}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge variant="outline" className="text-xs capitalize">{member.role}</Badge>
                        )}
                        {isAdmin && up?.id !== profile.id && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => removeMember(member.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                      {/* Granular permissions (expandable) */}
                      {isAdmin && !isPending && member.role === 'mechanic' && (
                        <div className="pl-11 pb-3 flex flex-wrap gap-3">
                          {Object.entries(PERMISSION_LABELS).map(([key, label]) => {
                            const checked = member.permissions?.[key] ?? (key === 'can_create_wo')
                            return (
                              <label key={key} className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={async () => {
                                    const newPerms = { ...(member.permissions ?? {}), [key]: !checked }
                                    const supabase = createBrowserSupabase()
                                    await supabase
                                      .from('organization_memberships')
                                      .update({ permissions: newPerms })
                                      .eq('id', member.id)
                                    router.refresh()
                                  }}
                                  className="rounded border-border h-3.5 w-3.5"
                                />
                                <span className={cn('text-muted-foreground', checked && 'text-foreground')}>{label}</span>
                              </label>
                            )
                          })}
                        </div>
                      )}
                    </React.Fragment>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Mechanics tab */}
          <TabsContent value="mechanics" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Mechanic Invites</CardTitle>
                  <CardDescription>Invite mechanics to view estimates and work orders. New mechanics get a 30-day free trial.</CardDescription>
                </div>
                {isAdmin && (
                  <Dialog open={showInviteMechanicDialog} onOpenChange={(open) => {
                    setShowInviteMechanicDialog(open)
                    if (open) { setMechanicSearch(''); setMechanicSearchResults([]); setMechanicInviteError('') }
                  }}>
                    <DialogTrigger asChild>
                      <Button size="sm" className="gap-1.5">
                        <UserPlus className="h-4 w-4" />Invite Mechanic
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md">
                      <DialogHeader>
                        <DialogTitle>Invite a Mechanic</DialogTitle>
                        <DialogDescription>Search for an existing mechanic or enter details to send an invite.</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-2">
                        {/* Live search */}
                        <div className="space-y-1.5">
                          <Label>Search existing mechanics</Label>
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              className="pl-9"
                              placeholder="Name, email or phone..."
                              value={mechanicSearch}
                              onChange={e => {
                                setMechanicSearch(e.target.value)
                                searchMechanics(e.target.value)
                              }}
                            />
                          </div>
                          {mechanicSearching && <p className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Searching...</p>}
                          {mechanicSearchResults.length > 0 && (
                            <div className="border rounded-lg divide-y max-h-40 overflow-y-auto">
                              {mechanicSearchResults.map((m: any) => (
                                <button
                                  key={m.user_id}
                                  type="button"
                                  className="w-full flex items-center gap-3 p-2.5 hover:bg-muted/50 text-left"
                                  onClick={() => {
                                    setNewMechanicName(m.name)
                                    setNewMechanicEmail(m.email)
                                    setNewMechanicPhone(m.phone)
                                    setMechanicSearch('')
                                    setMechanicSearchResults([])
                                  }}
                                >
                                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-semibold text-blue-700 shrink-0">
                                    {m.name?.[0]?.toUpperCase() ?? '?'}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">{m.name}</p>
                                    <p className="text-xs text-muted-foreground truncate">{m.email}{m.phone ? ` · ${m.phone}` : ''}</p>
                                  </div>
                                  <Badge variant="outline" className="text-xs capitalize shrink-0">{m.role}</Badge>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="relative">
                          <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                          <div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">Or enter manually</span></div>
                        </div>

                        <div className="space-y-3">
                          <div className="space-y-1">
                            <Label htmlFor="inv-name">Name <span className="text-red-500">*</span></Label>
                            <div className="relative">
                              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                              <Input id="inv-name" className="pl-9" placeholder="Mike Torres" value={newMechanicName} onChange={e => setNewMechanicName(e.target.value)} />
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor="inv-email">Email</Label>
                            <div className="relative">
                              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                              <Input id="inv-email" type="email" className="pl-9" placeholder="mechanic@shop.com" value={newMechanicEmail} onChange={e => setNewMechanicEmail(e.target.value)} />
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor="inv-phone">Phone <span className="text-muted-foreground text-xs">(optional)</span></Label>
                            <div className="relative">
                              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                              <Input id="inv-phone" type="tel" className="pl-9" placeholder="(512) 555-0100" value={newMechanicPhone} onChange={e => setNewMechanicPhone(e.target.value)} />
                            </div>
                          </div>
                        </div>

                        {mechanicInviteError && (
                          <Alert variant="destructive"><AlertDescription>{mechanicInviteError}</AlertDescription></Alert>
                        )}
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setShowInviteMechanicDialog(false)}>Cancel</Button>
                        <Button onClick={sendMechanicInvite} disabled={mechanicInviteLoading} className="gap-1.5">
                          {mechanicInviteLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                          Send Invite
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}
              </CardHeader>
              <CardContent>
                {/* Load on first view */}
                {!mechanicInvitesLoaded && (
                  <Button variant="ghost" size="sm" onClick={loadMechanicInvites} disabled={mechanicInviteLoading} className="gap-1.5">
                    {mechanicInviteLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Load invites
                  </Button>
                )}
                {mechanicInvitesLoaded && mechanicInvites.length === 0 && (
                  <p className="text-sm text-muted-foreground py-2">No mechanic invites yet. Click &quot;Invite Mechanic&quot; to get started.</p>
                )}
                {mechanicInvites.length > 0 && (
                  <div className="divide-y">
                    {mechanicInvites.map((inv: any) => (
                      <div key={inv.id} className="flex items-center gap-3 py-3">
                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                          <Wrench className="h-4 w-4 text-slate-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{inv.mechanic_name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {inv.mechanic_email ?? inv.mechanic_phone ?? '—'}
                            {inv.trial_expires_at && !inv.accepted_at && (
                              <span className="ml-1.5 text-amber-600">· trial expires {formatDate(inv.trial_expires_at)}</span>
                            )}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {inv.existing_user_id && (
                            <Badge variant="outline" className="text-xs gap-1"><Link2 className="h-3 w-3" />Existing</Badge>
                          )}
                          <Badge
                            variant={inv.status === 'accepted' ? 'success' : inv.status === 'pending' ? 'secondary' : 'outline'}
                            className="text-xs capitalize"
                          >
                            {inv.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Integrations tab */}
          <TabsContent value="integrations" className="space-y-4">
            {/* Google Drive card — keep existing */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-700">G</div>
                  Google Drive
                </CardTitle>
                <CardDescription>Import PDF documents directly from your Google Drive</CardDescription>
              </CardHeader>
              <CardContent>
                {driveConnection ? (
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <p className="text-sm font-medium">Connected as {driveConnection.google_email}</p>
                      <p className="text-xs text-muted-foreground">Since {formatDate(driveConnection.created_at)}</p>
                    </div>
                    <Badge variant="success" className="gap-1"><CheckCircle2 className="h-3 w-3" />Active</Badge>
                    <Button variant="outline" size="sm" onClick={disconnectDrive} className="text-destructive">
                      Disconnect
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <p className="text-sm text-muted-foreground">Connect to import PDFs from Google Drive</p>
                    </div>
                    {organization.plan !== 'starter' ? (
                      <Button size="sm" asChild>
                        <a href="/api/gdrive/auth">Connect Google Drive</a>
                      </Button>
                    ) : (
                      <Badge variant="secondary">Pro+ required</Badge>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Aviation provider integrations */}
            <div className="pt-2">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                <Plane className="h-4 w-4" />
                Aviation Scheduling &amp; FBO Providers
              </h3>
            </div>

            {Object.entries(PROVIDER_CONFIG).map(([provider, config]) => {
              const connected = getIntegration(provider)
              const isSyncing = syncing === provider

              if (config.comingSoon) {
                return (
                  <Card key={provider} className="opacity-60">
                    <CardContent className="py-4">
                      <div className="flex items-center gap-3">
                        <div className={cn('w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold', config.color)}>
                          {config.logo}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{config.name}</p>
                          <p className="text-xs text-muted-foreground line-clamp-1">{config.description}</p>
                        </div>
                        <Badge variant="secondary" className="flex-shrink-0">Coming Soon</Badge>
                      </div>
                    </CardContent>
                  </Card>
                )
              }

              return (
                <Card key={provider}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-3">
                      <div className={cn('w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold', config.color)}>
                        {config.logo}
                      </div>
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base">{config.name}</CardTitle>
                        <CardDescription className="text-xs">{config.description}</CardDescription>
                      </div>
                      {connected && (
                        <Badge variant="success" className="gap-1 flex-shrink-0">
                          <CheckCircle2 className="h-3 w-3" />Connected
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {connected ? (
                      <div className="space-y-3">
                        {/* Sync status row */}
                        <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/50 text-sm">
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Clock className="h-3.5 w-3.5" />
                            <span>Last sync:</span>
                            <span className="font-medium text-foreground">
                              {formatRelativeTime(connected.last_sync_at)}
                            </span>
                          </div>
                          {connected.aircraft_count_synced != null && connected.aircraft_count_synced > 0 && (
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <Plane className="h-3.5 w-3.5" />
                              <span>{connected.aircraft_count_synced} aircraft synced</span>
                            </div>
                          )}
                          {connected.last_sync_status === 'failed' && (
                            <div className="flex items-center gap-1.5 text-destructive">
                              <AlertCircle className="h-3.5 w-3.5" />
                              <span className="text-xs">{connected.last_sync_error ?? 'Sync failed'}</span>
                            </div>
                          )}
                        </div>

                        {/* Sync result toast */}
                        {syncResult?.provider === provider && (
                          <Alert variant={syncResult.message.includes('fail') ? 'destructive' : 'default'} className="py-2">
                            <AlertDescription className="text-xs">{syncResult.message}</AlertDescription>
                          </Alert>
                        )}

                        {/* Actions */}
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => syncIntegration(connected.id, provider)}
                            disabled={isSyncing}
                          >
                            {isSyncing ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3.5 w-3.5" />
                            )}
                            {isSyncing ? 'Syncing...' : 'Sync Now'}
                          </Button>
                          {isAdmin && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              onClick={() => disconnectIntegration(connected.id, provider)}
                            >
                              <XCircle className="h-3.5 w-3.5" />
                              Disconnect
                            </Button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <p className="text-sm text-muted-foreground flex-1">Not connected</p>
                        {isAdmin ? (
                          <Dialog
                            open={connectDialogOpen === provider}
                            onOpenChange={(open) => {
                              setConnectDialogOpen(open ? provider : null)
                              if (!open) { setConnectCredentials({}); setConnectError(null) }
                            }}
                          >
                            <DialogTrigger asChild>
                              <Button size="sm">
                                <Plug className="h-3.5 w-3.5" />
                                Connect
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle className="flex items-center gap-2">
                                  <div className={cn('w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold', config.color)}>
                                    {config.logo}
                                  </div>
                                  Connect {config.name}
                                </DialogTitle>
                                <DialogDescription>
                                  Enter your API credentials to connect. Your key is encrypted and stored securely.
                                </DialogDescription>
                              </DialogHeader>
                              <div className="space-y-4 py-2">
                                {config.fields.map(field => (
                                  <div key={field.key} className="space-y-1.5">
                                    <Label>{field.label}</Label>
                                    <Input
                                      type={field.key.includes('key') ? 'password' : 'text'}
                                      placeholder={field.placeholder}
                                      value={connectCredentials[field.key] ?? ''}
                                      onChange={e => setConnectCredentials(prev => ({ ...prev, [field.key]: e.target.value }))}
                                      autoComplete="off"
                                    />
                                  </div>
                                ))}
                                {connectError && (
                                  <Alert variant="destructive" className="py-2">
                                    <AlertCircle className="h-4 w-4" />
                                    <AlertDescription className="text-xs">{connectError}</AlertDescription>
                                  </Alert>
                                )}
                              </div>
                              <DialogFooter>
                                <Button variant="outline" onClick={() => { setConnectDialogOpen(null); setConnectCredentials({}); setConnectError(null) }}>
                                  Cancel
                                </Button>
                                <Button
                                  onClick={() => connectIntegration(provider)}
                                  disabled={connecting || !config.fields.filter(f => f.required).every(f => connectCredentials[f.key]?.trim())}
                                >
                                  {connecting && <Loader2 className="h-4 w-4 animate-spin" />}
                                  {connecting ? 'Testing connection...' : 'Connect'}
                                </Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>
                        ) : (
                          <Badge variant="secondary">Admin required</Badge>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </TabsContent>

          {/* Billing tab */}
          <TabsContent value="billing" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Current Plan</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-bold">{PLAN_LABELS[organization.plan]}</p>
                    <p className="text-muted-foreground text-sm">
                      {(PLAN_FEATURES as any)[organization.plan]?.price ?? 'Custom pricing'}
                    </p>
                  </div>
                  {isAdmin && (
                    <Button onClick={openBillingPortal} disabled={billingLoading} variant="outline">
                      {billingLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                      Manage subscription
                    </Button>
                  )}
                </div>

                {/* Usage bars */}
                <div className="space-y-3 pt-2">
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>Queries this month</span>
                      <span className="text-muted-foreground">{organization.queries_used_this_month} / {organization.plan_queries_monthly}</span>
                    </div>
                    <Progress value={queryPercent} className="h-2" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>Storage</span>
                      <span className="text-muted-foreground">{storageUsedGB.toFixed(2)} GB / {organization.plan_storage_gb} GB</span>
                    </div>
                    <Progress value={storagePercent} className="h-2" />
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Aircraft</span>
                    <span className="text-muted-foreground">— / {organization.plan_aircraft_limit}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Upgrade options */}
            {organization.plan === 'starter' && (
              <Card>
                <CardHeader>
                  <CardTitle>Upgrade Plan</CardTitle>
                  <CardDescription>Unlock more aircraft, storage, and queries</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-3 gap-4">
                  {(['pro', 'fleet', 'enterprise'] as const).map(plan => {
                    const f = PLAN_FEATURES[plan]
                    return (
                      <div key={plan} className="border border-border rounded-lg p-4 space-y-3">
                        <div>
                          <p className="font-semibold capitalize">{plan}</p>
                          <p className="text-muted-foreground text-sm">{f.price}</p>
                        </div>
                        <ul className="text-xs text-muted-foreground space-y-1">
                          <li>✓ {f.aircraft} aircraft</li>
                          <li>✓ {f.storage} storage</li>
                          <li>✓ {f.queries.toLocaleString()} queries/mo</li>
                          {f.ocr && <li>✓ OCR for scanned PDFs</li>}
                          {f.drive && <li>✓ Google Drive import</li>}
                        </ul>
                        {plan === 'enterprise' ? (
                          <Button size="sm" variant="outline" className="w-full" asChild>
                            <a href="mailto:hello@myaircraft.us">Contact sales</a>
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            className="w-full"
                            onClick={async () => {
                              const res = await fetch('/api/billing/checkout', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ plan }),
                              })
                              const data = await res.json()
                              if (data.url) window.location.href = data.url
                            }}
                          >
                            Upgrade to {plan}
                          </Button>
                        )}
                      </div>
                    )
                  })}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Payments tab — Stripe Connect + labor rates + markup settings */}
          {isAdmin && (
            <TabsContent value="payments" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Stripe Connect — Accept Payments</CardTitle>
                  <CardDescription>
                    Connect your Stripe account to accept credit card payments on invoices.
                    Each mechanic/admin can connect their own Stripe account.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-4 p-4 rounded-lg border border-border">
                    <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center text-violet-700 font-bold text-sm flex-shrink-0">S</div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">Your Stripe Account</p>
                      <p className="text-xs text-muted-foreground">
                        Connect to receive payments directly to your bank account when customers pay invoices.
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={async () => {
                        const res = await fetch('/api/stripe/connect/onboard', { method: 'POST' })
                        const data = await res.json()
                        if (data.url) window.location.href = data.url
                      }}
                    >
                      Connect Stripe
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Stripe handles all payment processing securely. We never store credit card information.
                    When you send an invoice with a &quot;Pay Now&quot; button, the payment goes directly to your connected Stripe account.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Default Labor Rate</CardTitle>
                  <CardDescription>Set your default hourly rate for labor line items on work orders and invoices.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3">
                    <Label className="text-sm flex-shrink-0">Rate ($/hr):</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue="125.00"
                      className="w-32"
                      onBlur={async (e) => {
                        const rate = parseFloat(e.target.value) || 0
                        await fetch('/api/labor-rates', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ name: 'Default', default_hourly_rate: rate, is_default: true }),
                        })
                      }}
                    />
                    <span className="text-sm text-muted-foreground">per hour</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Default Parts Markup</CardTitle>
                  <CardDescription>Applied automatically when adding parts to invoices from the parts library.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3">
                    <Label className="text-sm flex-shrink-0">Markup:</Label>
                    <Input type="number" min="0" max="200" step="1" defaultValue="20" className="w-24" />
                    <span className="text-sm text-muted-foreground">%</span>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {/* Danger zone */}
          {isOwner && (
            <TabsContent value="danger" className="space-y-4">
              <Card className="border-destructive/50">
                <CardHeader>
                  <CardTitle className="text-destructive">Danger Zone</CardTitle>
                  <CardDescription>These actions are permanent and cannot be undone</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="p-4 border border-destructive/30 rounded-lg space-y-3">
                    <div>
                      <p className="font-medium">Delete organization</p>
                      <p className="text-sm text-muted-foreground">
                        Permanently delete this organization, all aircraft, documents, and embeddings.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm">
                        Type <span className="font-mono font-bold">{organization.name}</span> to confirm
                      </Label>
                      <Input
                        value={deleteConfirm}
                        onChange={e => setDeleteConfirm(e.target.value)}
                        placeholder={organization.name}
                      />
                    </div>
                    <Button
                      variant="destructive"
                      disabled={deleteConfirm !== organization.name}
                      className="w-full"
                    >
                      Delete organization permanently
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {/* My Uploads tab */}
          <TabsContent value="uploads" className="space-y-4">
            <MyUploadsSection initialRows={myUploads} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

// ─── My Uploads Section ────────────────────────────────────────────────────

function MyUploadsSection({ initialRows }: { initialRows: MyUploadRow[] }) {
  const [rows, setRows] = useState(initialRows)
  const [editing, setEditing] = useState<MyUploadRow | null>(null)

  async function toggleAllowDownload(row: MyUploadRow) {
    const next = !row.allow_download
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, allow_download: next } : r)))
    const supabase = createBrowserSupabase()
    const { error } = await (supabase as any)
      .from('documents')
      .update({ allow_download: next })
      .eq('id', row.id)
    if (error) {
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, allow_download: !next } : r)))
    }
  }

  async function delistFromCommunity(row: MyUploadRow) {
    if (!confirm(`Remove "${row.title}" from the community marketplace? The document stays in your library.`)) return
    setRows((prev) =>
      prev.map((r) =>
        r.id === row.id ? { ...r, community_listing: false, listing_status: null } : r
      )
    )
    const supabase = createBrowserSupabase()
    await (supabase as any)
      .from('documents')
      .update({ community_listing: false, listing_status: null })
      .eq('id', row.id)
  }

  async function deleteDoc(row: MyUploadRow) {
    if (row.community_listing) return
    if (!confirm(`Permanently delete "${row.title}"? This cannot be undone.`)) return
    setRows((prev) => prev.filter((r) => r.id !== row.id))
    const supabase = createBrowserSupabase()
    await (supabase as any).from('documents').delete().eq('id', row.id)
  }

  const stats = {
    total: rows.length,
    community: rows.filter((r) => r.community_listing).length,
    downloads: rows.reduce((sum, r) => sum + (r.download_count ?? 0), 0),
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>My Uploads</CardTitle>
          <CardDescription>
            Documents you&apos;ve uploaded to this organization. You control access and community listing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="p-3 rounded-lg border border-border">
              <p className="text-xs text-muted-foreground">Total uploads</p>
              <p className="text-lg font-semibold">{stats.total}</p>
            </div>
            <div className="p-3 rounded-lg border border-border">
              <p className="text-xs text-muted-foreground">On marketplace</p>
              <p className="text-lg font-semibold">{stats.community}</p>
            </div>
            <div className="p-3 rounded-lg border border-border">
              <p className="text-xs text-muted-foreground">Total downloads</p>
              <p className="text-lg font-semibold">{stats.downloads}</p>
            </div>
          </div>

          {rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center mb-2">
                <FileText className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">No uploads yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Documents you upload will appear here.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 border-b border-border">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Title</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Type</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Aircraft</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Access</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Community</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">Downloads</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Date</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((row) => (
                    <tr key={row.id} className="hover:bg-muted/20">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="font-medium truncate max-w-[200px]">{row.title}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className="text-[10px] whitespace-nowrap">
                          {DOC_TYPE_LABELS[row.doc_type] ?? row.doc_type}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {row.aircraft ? (
                          <span className="font-mono">{row.aircraft.tail_number}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => toggleAllowDownload(row)}
                          className="flex items-center gap-1 text-xs hover:text-foreground transition-colors"
                          title={row.allow_download ? 'Click to lock downloads' : 'Click to allow downloads'}
                        >
                          {row.allow_download ? (
                            <>
                              <Unlock className="h-3.5 w-3.5 text-green-600" />
                              <span className="text-green-700">Unlocked</span>
                            </>
                          ) : (
                            <>
                              <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-muted-foreground">Locked</span>
                            </>
                          )}
                        </button>
                      </td>
                      <td className="px-3 py-2">
                        {row.community_listing ? (
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[10px]',
                              row.listing_status === 'published' && 'bg-green-50 text-green-700 border-green-200',
                              row.listing_status === 'pending_review' && 'bg-amber-50 text-amber-700 border-amber-200',
                              row.listing_status === 'rejected' && 'bg-red-50 text-red-700 border-red-200',
                              row.listing_status === 'draft' && 'bg-slate-100 text-slate-700 border-slate-200'
                            )}
                          >
                            {row.manual_access === 'paid' && row.price_cents != null
                              ? `$${(row.price_cents / 100).toFixed(2)}`
                              : 'Free'}
                            {' · '}
                            {(row.listing_status ?? 'draft').replace('_', ' ')}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right text-xs tabular-nums">
                        <span className="flex items-center justify-end gap-1">
                          <Download className="h-3 w-3 text-muted-foreground" />
                          {row.download_count}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                        {formatDate(row.uploaded_at)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center gap-1 justify-end">
                          {row.community_listing && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => delistFromCommunity(row)}
                            >
                              Delist
                            </Button>
                          )}
                          {!row.community_listing && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-destructive hover:text-destructive"
                              onClick={() => deleteDoc(row)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}
