'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Building2, Users, Plug, CreditCard, AlertTriangle,
  Loader2, Check, Trash2, UserPlus, ChevronDown, ExternalLink,
  CheckCircle2, Upload, Globe, Lock, X, FileText,
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
import { PLAN_LABELS, formatBytes, formatDate, DOC_TYPE_LABELS, cn } from '@/lib/utils'
import type { UserProfile, Organization, OrgRole, DocType } from '@/types'

interface Member {
  id: string
  role: string
  invited_at: string
  accepted_at?: string
  user_profiles: { id: string; email: string; full_name?: string; avatar_url?: string } | null
}

interface UploadedDoc {
  id: string
  title: string
  doc_type: DocType
  uploaded_at: string
  manual_access?: 'private' | 'free' | 'paid'
  allow_download?: boolean
  community_listing?: boolean
  price?: number
  uploader_role?: 'owner' | 'mechanic' | 'admin'
  aircraft?: { id: string; tail_number: string } | null
}

interface Props {
  profile: UserProfile
  organization: Organization
  role: string
  members: Member[]
  driveConnection: { id: string; google_email?: string; is_active: boolean; created_at: string } | null
  defaultTab: string
  showUpgradeSuccess: boolean
  uploadedDocs?: UploadedDoc[]
}

const PLAN_FEATURES = {
  starter: { price: '$29/mo', aircraft: 1, storage: '2 GB', queries: 100, ocr: false, drive: false },
  pro: { price: '$99/mo', aircraft: 5, storage: '20 GB', queries: 1000, ocr: true, drive: true },
  fleet: { price: '$299/mo', aircraft: 25, storage: '100 GB', queries: 10000, ocr: true, drive: true },
  enterprise: { price: 'Contact us', aircraft: 'Unlimited', storage: 'Custom', queries: 'Unlimited', ocr: true, drive: true },
}

export function SettingsClient({
  profile, organization, role, members, driveConnection, defaultTab, showUpgradeSuccess, uploadedDocs = []
}: Props) {
  const router = useRouter()
  const [orgName, setOrgName] = useState(organization.name)
  const [savingOrg, setSavingOrg] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<OrgRole>('viewer')
  const [inviting, setInviting] = useState(false)
  const [inviteSuccess, setInviteSuccess] = useState(false)
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false)
  const [billingLoading, setBillingLoading] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const isOwner = role === 'owner'
  const isAdmin = role === 'admin' || isOwner

  // My Uploads state
  const [localDocs, setLocalDocs] = useState<UploadedDoc[]>(uploadedDocs)
  const [editingDoc, setEditingDoc] = useState<UploadedDoc | null>(null)
  const [editAccessLevel, setEditAccessLevel] = useState<'private' | 'free' | 'paid'>('private')
  const [editPrice, setEditPrice] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  function openEditAccess(doc: UploadedDoc) {
    setEditingDoc(doc)
    setEditAccessLevel(doc.manual_access ?? 'private')
    setEditPrice(doc.price ? String(doc.price) : '')
  }

  async function handleEditAccess() {
    if (!editingDoc) return
    setEditSaving(true)
    try {
      await fetch(`/api/documents/${editingDoc.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manual_access: editAccessLevel, price: editPrice || null }),
      })
      setLocalDocs(prev => prev.map(d =>
        d.id === editingDoc.id
          ? { ...d, manual_access: editAccessLevel, price: editPrice ? parseFloat(editPrice) : undefined }
          : d
      ))
    } finally {
      setEditSaving(false)
      setEditingDoc(null)
    }
  }

  async function handleRemoveFromCommunity(docId: string) {
    await fetch(`/api/documents/${docId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ community_listing: false }),
    })
    setLocalDocs(prev => prev.map(d => d.id === docId ? { ...d, community_listing: false } : d))
  }

  async function handleDeleteDoc(doc: UploadedDoc) {
    if (doc.community_listing) return
    if (!confirm(`Delete "${doc.title}"? This cannot be undone.`)) return
    await fetch(`/api/documents/${doc.id}`, { method: 'DELETE' })
    setLocalDocs(prev => prev.filter(d => d.id !== doc.id))
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
            <TabsTrigger value="integrations"><Plug className="h-4 w-4 mr-1.5" />Integrations</TabsTrigger>
            <TabsTrigger value="billing"><CreditCard className="h-4 w-4 mr-1.5" />Billing</TabsTrigger>
            <TabsTrigger value="uploads"><Upload className="h-4 w-4 mr-1.5" />My Uploads</TabsTrigger>
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
                      <div key={member.id} className="flex items-center gap-3 py-3">
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
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Integrations tab */}
          <TabsContent value="integrations" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Google Drive</CardTitle>
                <CardDescription>Import PDF documents directly from your Google Drive</CardDescription>
              </CardHeader>
              <CardContent>
                {driveConnection ? (
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-sm">G</div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">Connected</p>
                      <p className="text-xs text-muted-foreground">{driveConnection.google_email}</p>
                    </div>
                    <Badge variant="success">Active</Badge>
                    <Button variant="outline" size="sm" onClick={disconnectDrive} className="text-destructive">
                      Disconnect
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm text-muted-foreground">G</div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">Not connected</p>
                      <p className="text-xs text-muted-foreground">Connect to import PDFs from Google Drive</p>
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

          {/* My Uploads tab */}
          <TabsContent value="uploads" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>My Uploads</CardTitle>
                <CardDescription>
                  Documents you have uploaded — manage access levels and community listings.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {localDocs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mb-3">
                      <FileText className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium">No uploads yet</p>
                    <p className="text-xs text-muted-foreground mt-1">Documents you upload will appear here.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40 border-b border-border">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Title</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Type</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Aircraft</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Access</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">Downloads</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">In Marketplace</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Date</th>
                          <th className="px-4 py-3" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {localDocs.map(doc => {
                          const roleBadgeEl = doc.uploader_role === 'owner'
                            ? <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">Owner</span>
                            : doc.uploader_role === 'mechanic'
                            ? <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">Mechanic</span>
                            : doc.uploader_role === 'admin'
                            ? <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">Admin</span>
                            : null

                          return (
                            <tr key={doc.id} className="hover:bg-muted/20 transition-colors">
                              <td className="px-4 py-3 max-w-[200px]">
                                <div className="flex items-center gap-2">
                                  <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                  <span className="truncate font-medium text-foreground text-xs">{doc.title}</span>
                                </div>
                                {roleBadgeEl && <div className="mt-1 pl-5">{roleBadgeEl}</div>}
                              </td>
                              <td className="px-4 py-3">
                                <Badge variant="outline" className="text-xs whitespace-nowrap">
                                  {DOC_TYPE_LABELS[doc.doc_type] ?? doc.doc_type}
                                </Badge>
                              </td>
                              <td className="px-4 py-3 text-xs text-muted-foreground">
                                {doc.aircraft?.tail_number ?? '—'}
                              </td>
                              <td className="px-4 py-3">
                                <span className={cn(
                                  'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium border',
                                  doc.manual_access === 'paid'
                                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                                    : doc.manual_access === 'free'
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : 'bg-slate-50 text-slate-600 border-slate-200'
                                )}>
                                  {doc.manual_access === 'paid' ? `$${doc.price ?? '—'}` : doc.manual_access === 'free' ? 'Free' : 'Private'}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right text-xs text-muted-foreground">—</td>
                              <td className="px-4 py-3">
                                {doc.community_listing ? (
                                  <span className="inline-flex items-center gap-1 text-xs text-violet-700">
                                    <Globe className="h-3 w-3" />Listed
                                  </span>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                                {formatDate(doc.uploaded_at)}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-1 justify-end">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-xs"
                                    onClick={() => openEditAccess(doc)}
                                  >
                                    Edit Access
                                  </Button>
                                  {doc.community_listing && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 px-2 text-xs text-amber-600 hover:text-amber-700"
                                      onClick={() => handleRemoveFromCommunity(doc.id)}
                                    >
                                      Delist
                                    </Button>
                                  )}
                                  {!doc.community_listing && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                      onClick={() => handleDeleteDoc(doc)}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Edit Access Modal */}
          {editingDoc && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="bg-background rounded-xl shadow-xl w-full max-w-sm">
                <div className="flex items-center justify-between p-5 border-b border-border">
                  <h2 className="text-base font-semibold">Edit Access Level</h2>
                  <button onClick={() => setEditingDoc(null)} className="p-1 rounded hover:bg-muted">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="p-5 space-y-4">
                  <div>
                    <Label className="text-xs mb-1.5 block">Access Level</Label>
                    <div className="flex rounded-md overflow-hidden border border-input">
                      {(['private', 'free', 'paid'] as const).map(level => (
                        <button
                          key={level}
                          type="button"
                          onClick={() => setEditAccessLevel(level)}
                          className={cn(
                            'flex-1 py-2 text-xs font-medium transition-colors capitalize',
                            editAccessLevel === level
                              ? 'bg-blue-600 text-white'
                              : 'bg-background text-muted-foreground hover:bg-muted'
                          )}
                        >
                          {level === 'private' ? 'Private' : level === 'free' ? 'Free' : 'Paid'}
                        </button>
                      ))}
                    </div>
                  </div>
                  {editAccessLevel === 'paid' && (
                    <div>
                      <Label htmlFor="edit-price">Price (USD)</Label>
                      <div className="relative mt-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                        <Input
                          id="edit-price"
                          type="number"
                          min="1"
                          max="500"
                          value={editPrice}
                          onChange={e => setEditPrice(e.target.value)}
                          placeholder="29"
                          className="pl-6"
                        />
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex gap-3 p-5 pt-0">
                  <Button variant="outline" className="flex-1" onClick={() => setEditingDoc(null)}>Cancel</Button>
                  <Button className="flex-1" onClick={handleEditAccess} disabled={editSaving}>
                    {editSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                  </Button>
                </div>
              </div>
            </div>
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
        </Tabs>
      </div>
    </div>
  )
}
