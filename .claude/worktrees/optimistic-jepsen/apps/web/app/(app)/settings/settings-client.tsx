'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Building2, Users, Plug, CreditCard, AlertTriangle,
  Loader2, Check, Trash2, UserPlus, ChevronDown, ExternalLink,
  CheckCircle2
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
import { PLAN_LABELS, formatBytes } from '@/lib/utils'
import type { UserProfile, Organization, OrgRole } from '@/types'

interface Member {
  id: string
  role: string
  invited_at: string
  accepted_at?: string
  user_profiles: { id: string; email: string; full_name?: string; avatar_url?: string } | null
}

interface Props {
  profile: UserProfile
  organization: Organization
  role: string
  members: Member[]
  driveConnection: { id: string; google_email?: string; is_active: boolean; created_at: string } | null
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
  profile, organization, role, members, driveConnection, defaultTab, showUpgradeSuccess
}: Props) {
  const router = useRouter()
  const [orgName, setOrgName] = useState(organization.name)
  const [savingOrg, setSavingOrg] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<OrgRole>('viewer')
  const [inviting, setInviting] = useState(false)
  const [inviteSuccess, setInviteSuccess] = useState(false)
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const [orgSaveError, setOrgSaveError] = useState('')
  const [billingLoading, setBillingLoading] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [memberError, setMemberError] = useState('')
  const isOwner = role === 'owner'
  const isAdmin = role === 'admin' || isOwner

  async function saveOrgName() {
    setSavingOrg(true)
    setOrgSaveError('')
    try {
      const supabase = createBrowserSupabase()
      const { error } = await supabase
        .from('organizations')
        .update({ name: orgName })
        .eq('id', organization.id)
      if (error) throw new Error(error.message)
      router.refresh()
    } catch (err: any) {
      setOrgSaveError(err.message ?? 'Failed to save. Please try again.')
    } finally {
      setSavingOrg(false)
    }
  }

  async function handleInvite() {
    setInviting(true)
    setInviteError('')
    try {
      const res = await fetch('/api/settings/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setInviteSuccess(true)
        setInviteEmail('')
        setTimeout(() => {
          setInviteSuccess(false)
          setInviteDialogOpen(false)
          router.refresh()
        }, 1500)
      } else {
        setInviteError(data.error ?? 'Failed to send invite. Please try again.')
      }
    } catch {
      setInviteError('Network error. Please check your connection.')
    } finally {
      setInviting(false)
    }
  }

  async function removeMember(membershipId: string) {
    setMemberError('')
    try {
      const supabase = createBrowserSupabase()
      const { error } = await supabase
        .from('organization_memberships')
        .delete()
        .eq('id', membershipId)
      if (error) throw new Error(error.message)
      router.refresh()
    } catch (err: any) {
      setMemberError(err.message ?? 'Failed to remove member. Please try again.')
    }
  }

  async function changeRole(membershipId: string, newRole: OrgRole) {
    setMemberError('')
    try {
      const supabase = createBrowserSupabase()
      const { error } = await supabase
        .from('organization_memberships')
        .update({ role: newRole })
        .eq('id', membershipId)
      if (error) throw new Error(error.message)
      router.refresh()
    } catch (err: any) {
      setMemberError(err.message ?? 'Failed to update role. Please try again.')
    }
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
                  {orgSaveError && (
                    <p className="text-xs text-destructive mt-1">{orgSaveError}</p>
                  )}
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
                          {inviteError && (
                            <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
                              {inviteError}
                            </p>
                          )}
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
                {memberError && (
                  <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2 mb-3">
                    {memberError}
                  </p>
                )}
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
