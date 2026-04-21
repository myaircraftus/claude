'use client'

import { useState, useCallback, useMemo } from 'react'
import {
  Plug,
  Plane,
  Zap,
  Globe,
  Link2,
  RefreshCw,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  X,
  ExternalLink,
  AlertCircle,
  Bell,
  Loader2,
  Database,
  Activity,
  Wrench,
  Search,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import type { Integration, IntegrationProvider } from '@/types'

// ─── Provider definitions ────────────────────────────────────────────────────

type ProviderStatus = 'available' | 'coming_soon'
type ProviderCategory = 'Flight Schools' | 'Charter/135' | 'Business Aviation' | 'Maintenance'

interface ProviderDef {
  id: IntegrationProvider
  name: string
  tagline: string
  description: string
  category: ProviderCategory
  status: ProviderStatus
  priority: number
  icon: React.ComponentType<{ className?: string }>
  iconBg: string
  iconColor: string
  websiteUrl: string
  docsUrl?: string
  credentialFields: Array<{
    key: string
    label: string
    placeholder: string
    type?: string
    helpText?: string
  }>
  syncItems: Array<{ label: string; available: boolean }>
}

const PROVIDERS: ProviderDef[] = [
  {
    id: 'flight_schedule_pro',
    name: 'Flight Schedule Pro',
    tagline: 'Flight school management & scheduling',
    description:
      'Sync your FSP fleet directly into myaircraft.us. Aircraft tach/Hobbs times update automatically on flight completion, keeping your hours-based reminders accurate without manual entry.',
    category: 'Flight Schools',
    status: 'available',
    priority: 1,
    icon: Plane,
    iconBg: 'bg-blue-50',
    iconColor: 'text-blue-600',
    websiteUrl: 'https://www.flightschedulepro.com',
    docsUrl: 'https://help.flightschedulepro.com/api',
    credentialFields: [
      {
        key: 'api_key',
        label: 'API Key',
        placeholder: 'fsp_live_••••••••••••••••',
        type: 'password',
        helpText: 'Found in FSP → Settings → Integrations → API Keys',
      },
      {
        key: 'account_id',
        label: 'Account / Organization ID',
        placeholder: 'org_123456',
        helpText: 'Your FSP organization ID, visible in the URL when logged in',
      },
    ],
    syncItems: [
      { label: 'Aircraft list (from fleet)', available: true },
      { label: 'Tachometer / Hobbs times', available: true },
      { label: 'Flight activity (hours-based reminders)', available: true },
      { label: 'Maintenance items', available: false },
    ],
  },
  {
    id: 'flight_circle',
    name: 'Flight Circle',
    tagline: 'Flight school scheduling & usage tracking',
    description:
      'Connect Flight Circle to pull aircraft utilization data and keep tach times current. Ideal for clubs and small flight schools.',
    category: 'Flight Schools',
    status: 'available',
    priority: 2,
    icon: Activity,
    iconBg: 'bg-sky-50',
    iconColor: 'text-sky-600',
    websiteUrl: 'https://flightcircle.com',
    credentialFields: [
      {
        key: 'api_key',
        label: 'API Key',
        placeholder: 'fc_••••••••••••••••',
        type: 'password',
        helpText: 'Found in Flight Circle → Account → Developer / API',
      },
      {
        key: 'club_id',
        label: 'Club ID',
        placeholder: 'club_789',
        helpText: 'Your Flight Circle club identifier',
      },
    ],
    syncItems: [
      { label: 'Aircraft list', available: true },
      { label: 'Hobbs / tach times', available: true },
      { label: 'Usage logs', available: true },
      { label: 'Squawks / maintenance items', available: false },
    ],
  },
  {
    id: 'myfbo',
    name: 'MyFBO',
    tagline: 'FBO and fleet management',
    description:
      'Integrate with MyFBO to synchronize fleet data, fuel tracking, and scheduled maintenance for your FBO operations.',
    category: 'Flight Schools',
    status: 'coming_soon',
    priority: 3,
    icon: Database,
    iconBg: 'bg-violet-50',
    iconColor: 'text-violet-600',
    websiteUrl: 'https://myfbo.com',
    credentialFields: [],
    syncItems: [
      { label: 'Fleet aircraft', available: true },
      { label: 'Fuel & expense tracking', available: true },
      { label: 'Scheduled maintenance', available: true },
    ],
  },
  {
    id: 'talon',
    name: 'TalonETA / TalonRMS',
    tagline: 'Maintenance tracking integration',
    description:
      'Pull maintenance records and squawk data from Talon directly into myaircraft.us to keep your compliance timeline complete.',
    category: 'Maintenance',
    status: 'coming_soon',
    priority: 4,
    icon: Wrench,
    iconBg: 'bg-amber-50',
    iconColor: 'text-amber-600',
    websiteUrl: 'https://talonrms.com',
    credentialFields: [],
    syncItems: [
      { label: 'Maintenance records', available: true },
      { label: 'Squawks & discrepancies', available: true },
      { label: 'Component times / cycles', available: true },
    ],
  },
  {
    id: 'avianis',
    name: 'Avianis',
    tagline: 'Part 135 charter operations',
    description:
      'Connect Avianis to keep your 135 fleet maintenance data and flight hours in perfect sync for AOG prevention and audit readiness.',
    category: 'Charter/135',
    status: 'coming_soon',
    priority: 5,
    icon: Zap,
    iconBg: 'bg-emerald-50',
    iconColor: 'text-emerald-600',
    websiteUrl: 'https://avianis.com',
    credentialFields: [],
    syncItems: [
      { label: 'Fleet data', available: true },
      { label: 'Flight hours & cycles', available: true },
      { label: 'Maintenance scheduling', available: true },
    ],
  },
  {
    id: 'fl3xx',
    name: 'FL3XX',
    tagline: 'Business aviation operations',
    description:
      'Sync your FL3XX fleet to auto-update aircraft times and pre-populate maintenance reminders based on actual utilization.',
    category: 'Business Aviation',
    status: 'coming_soon',
    priority: 6,
    icon: Globe,
    iconBg: 'bg-indigo-50',
    iconColor: 'text-indigo-600',
    websiteUrl: 'https://fl3xx.com',
    credentialFields: [],
    syncItems: [
      { label: 'Aircraft registry', available: true },
      { label: 'Trip / flight logs', available: true },
      { label: 'Hours & cycles', available: true },
    ],
  },
  {
    id: 'leon',
    name: 'Leon Software',
    tagline: 'Charter and business aviation scheduling',
    description:
      'Integrate Leon to bring trip-based hours accumulation into your maintenance tracking and keep reminder due dates current automatically.',
    category: 'Business Aviation',
    status: 'coming_soon',
    priority: 7,
    icon: Link2,
    iconBg: 'bg-rose-50',
    iconColor: 'text-rose-600',
    websiteUrl: 'https://leonsoftware.com',
    credentialFields: [],
    syncItems: [
      { label: 'Fleet aircraft', available: true },
      { label: 'Flight times / FDPs', available: true },
      { label: 'Maintenance requests', available: false },
    ],
  },
]

const CATEGORY_COLOR: Record<ProviderCategory, string> = {
  'Flight Schools': 'info',
  'Charter/135': 'warning',
  'Business Aviation': 'secondary',
  'Maintenance': 'outline',
}

// ─── Connect modal ────────────────────────────────────────────────────────────

interface ConnectModalProps {
  provider: ProviderDef
  orgId: string
  onSuccess: (integration: any) => void
  onClose: () => void
}

function ConnectModal({ provider, orgId, onSuccess, onClose }: ConnectModalProps) {
  const [credentials, setCredentials] = useState<Record<string, string>>({})
  const [phase, setPhase] = useState<'idle' | 'testing' | 'saving' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [testOk, setTestOk] = useState(false)

  function setField(key: string, value: string) {
    setCredentials(prev => ({ ...prev, [key]: value }))
    setTestOk(false)
    setError(null)
  }

  async function handleTest() {
    setPhase('testing')
    setError(null)
    setTestOk(false)
    try {
      const res = await fetch('/api/integrations/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: provider.id, credentials }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Connection test failed')
      setTestOk(true)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setPhase('idle')
    }
  }

  async function handleSave() {
    setPhase('saving')
    setError(null)
    try {
      const res = await fetch('/api/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: provider.id, credentials, settings: {} }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to save integration')
      setPhase('done')
      onSuccess(json.integration)
    } catch (err: any) {
      setError(err.message)
      setPhase('idle')
    }
  }

  const allFilled = provider.credentialFields.every(f => (credentials[f.key] ?? '').trim().length > 0)

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', provider.iconBg)}>
              <provider.icon className={cn('h-5 w-5', provider.iconColor)} />
            </div>
            <div>
              <DialogTitle className="text-base">Connect {provider.name}</DialogTitle>
              <DialogDescription className="text-xs">{provider.tagline}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Credential fields */}
          {provider.credentialFields.map(field => (
            <div key={field.key} className="space-y-1.5">
              <Label htmlFor={field.key} className="text-sm font-medium">
                {field.label}
              </Label>
              <Input
                id={field.key}
                type={field.type ?? 'text'}
                placeholder={field.placeholder}
                value={credentials[field.key] ?? ''}
                onChange={e => setField(field.key, e.target.value)}
                className="font-mono text-sm"
              />
              {field.helpText && (
                <p className="text-xs text-muted-foreground">{field.helpText}</p>
              )}
            </div>
          ))}

          {provider.docsUrl && (
            <a
              href={provider.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-700"
            >
              <ExternalLink className="h-3 w-3" />
              Find your API key in {provider.name} docs
            </a>
          )}

          <Separator />

          {/* What will sync */}
          <div>
            <p className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2">
              Data that will sync
            </p>
            <ul className="space-y-1.5">
              {provider.syncItems.map(item => (
                <li key={item.label} className="flex items-center gap-2 text-sm">
                  {item.available ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                  ) : (
                    <span className="h-3.5 w-3.5 flex-shrink-0 text-center text-muted-foreground text-xs leading-none">~</span>
                  )}
                  <span className={item.available ? 'text-foreground' : 'text-muted-foreground'}>
                    {item.label}
                    {!item.available && ' (if available in platform)'}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 rounded-md bg-red-50 border border-red-200 p-3">
              <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {testOk && (
            <div className="flex items-center gap-2 rounded-md bg-emerald-50 border border-emerald-200 p-3">
              <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
              <p className="text-sm text-emerald-700">Connection verified successfully.</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            <Button
              variant="outline"
              className="flex-1"
              disabled={!allFilled || phase !== 'idle'}
              onClick={handleTest}
            >
              {phase === 'testing' ? (
                <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Testing…</>
              ) : (
                'Test Connection'
              )}
            </Button>
            <Button
              className="flex-1"
              disabled={!allFilled || phase !== 'idle'}
              onClick={handleSave}
            >
              {phase === 'saving' ? (
                <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Saving…</>
              ) : (
                'Save & Connect'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Integration card ─────────────────────────────────────────────────────────

interface IntegrationCardProps {
  provider: ProviderDef
  integration?: Integration
  canManage: boolean
  onConnect: (provider: ProviderDef) => void
  onDisconnect: (id: string) => void
  onSync: (id: string) => void
  syncingId: string | null
}

function formatRelative(dateStr?: string) {
  if (!dateStr) return null
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.round(diff / 60000)
  if (mins < 2) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}

function IntegrationCard({
  provider,
  integration,
  canManage,
  onConnect,
  onDisconnect,
  onSync,
  syncingId,
}: IntegrationCardProps) {
  const isConnected = integration?.status === 'connected'
  const isSyncing = syncingId === integration?.id
  const lastSync = formatRelative(integration?.last_sync_at)

  return (
    <Card className={cn(
      'relative transition-shadow hover:shadow-md',
      provider.status === 'coming_soon' && 'opacity-60',
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', provider.iconBg)}>
              <provider.icon className={cn('h-5 w-5', provider.iconColor)} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-sm text-foreground">{provider.name}</h3>
                <Badge variant={CATEGORY_COLOR[provider.category] as any} className="text-[10px] py-0">
                  {provider.category}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{provider.tagline}</p>
            </div>
          </div>

          {/* Status chip */}
          <div className="flex-shrink-0">
            {provider.status === 'coming_soon' ? (
              <Badge variant="outline" className="text-[10px] py-0 text-muted-foreground">
                Coming Soon
              </Badge>
            ) : isConnected ? (
              <Badge variant="success" className="text-[10px] py-0 gap-1">
                <CheckCircle2 className="h-2.5 w-2.5" />
                Connected
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] py-0 text-muted-foreground">
                Available
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground leading-relaxed">
          {provider.description}
        </p>

        {/* Connected details */}
        {isConnected && integration && (
          <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2.5 space-y-1">
            {integration.aircraft_count_synced > 0 && (
              <div className="flex items-center gap-2 text-xs text-emerald-700">
                <Plane className="h-3 w-3" />
                {integration.aircraft_count_synced} aircraft synced
              </div>
            )}
            {lastSync && (
              <div className="flex items-center gap-2 text-xs text-emerald-700">
                <Clock className="h-3 w-3" />
                Last sync: {lastSync}
              </div>
            )}
            {integration.last_sync_status === 'error' && (
              <div className="flex items-center gap-2 text-xs text-red-600">
                <AlertCircle className="h-3 w-3" />
                Last sync had errors
              </div>
            )}
          </div>
        )}

        {/* Sync items preview */}
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {provider.syncItems.map(item => (
            <span key={item.label} className="flex items-center gap-1 text-xs text-muted-foreground">
              {item.available ? (
                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
              ) : (
                <span className="text-muted-foreground">~</span>
              )}
              {item.label}
            </span>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          {provider.status === 'coming_soon' ? (
            <Button variant="outline" size="sm" className="w-full text-xs" disabled={!canManage}>
              <Bell className="h-3.5 w-3.5 mr-1.5" />
              Notify me when available
            </Button>
          ) : isConnected ? (
            <>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 text-xs"
                disabled={isSyncing || !canManage}
                onClick={() => integration && onSync(integration.id)}
              >
                {isSyncing ? (
                  <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Syncing…</>
                ) : (
                  <><RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Sync Now</>
                )}
              </Button>
              {canManage && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => integration && onDisconnect(integration.id)}
                >
                  <X className="h-3.5 w-3.5 mr-1" />
                  Disconnect
                </Button>
              )}
            </>
          ) : (
            <Button
              size="sm"
              className="w-full text-xs"
              disabled={!canManage}
              onClick={() => onConnect(provider)}
            >
              <Plug className="h-3.5 w-3.5 mr-1.5" />
              Connect
            </Button>
          )}
        </div>

        {!canManage && provider.status !== 'coming_soon' && (
          <p className="text-[10px] text-muted-foreground text-center">
            Admin or Owner role required to manage integrations
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Webhook section ──────────────────────────────────────────────────────────

const WEBHOOK_BASE = 'https://myaircraft-claude.vercel.app/api/webhooks'

function WebhooksSection({ connectedProviders }: { connectedProviders: string[] }) {
  const [open, setOpen] = useState(false)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  async function copyToClipboard(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(key)
      setTimeout(() => setCopiedKey(null), 2000)
    } catch {}
  }

  // Static demo secret — in production this would come from the DB
  const webhookSecret = 'whsec_demo_replace_with_real_secret'

  return (
    <div className="rounded-lg border border-border bg-card">
      <button
        className="w-full flex items-center justify-between px-5 py-4 text-left"
        onClick={() => setOpen(v => !v)}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
            <Zap className="h-4 w-4 text-slate-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Webhook Endpoints</p>
            <p className="text-xs text-muted-foreground">
              Configure inbound webhooks from your scheduling software
            </p>
          </div>
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        )}
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-5 border-t border-border pt-5">
          {/* Secret key */}
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 block">
              Webhook Secret
            </Label>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs font-mono bg-muted rounded-md px-3 py-2 text-foreground truncate">
                {webhookSecret}
              </code>
              <Button
                variant="outline"
                size="sm"
                className="flex-shrink-0"
                onClick={() => copyToClipboard(webhookSecret, 'secret')}
              >
                {copiedKey === 'secret' ? (
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              Use this secret to verify that webhook payloads come from your connected providers.
            </p>
          </div>

          {/* Per-provider URLs */}
          <div className="space-y-3">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">
              Endpoint URLs
            </Label>
            {PROVIDERS.filter(p => p.status === 'available').map(p => {
              const url = `${WEBHOOK_BASE}/${p.id}`
              const isActive = connectedProviders.includes(p.id)
              return (
                <div key={p.id} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-foreground w-36 truncate">{p.name}</span>
                    {isActive ? (
                      <Badge variant="success" className="text-[10px] py-0">Active</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] py-0 text-muted-foreground">Not connected</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs font-mono bg-muted rounded px-2.5 py-1.5 text-muted-foreground truncate">
                      {url}
                    </code>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-shrink-0 h-7 w-7 p-0"
                      onClick={() => copyToClipboard(url, p.id)}
                    >
                      {copiedKey === p.id ? (
                        <Check className="h-3 w-3 text-emerald-600" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="rounded-md bg-amber-50 border border-amber-100 p-3">
            <p className="text-xs text-amber-700">
              <strong>Setup tip:</strong> After connecting an integration above, go to your provider&apos;s
              webhook settings and paste the endpoint URL. Select the &quot;flight completed&quot; or
              &quot;tach updated&quot; event types for best results.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main client component ────────────────────────────────────────────────────

interface IntegrationsClientProps {
  integrations: any[]
  orgId: string
  canManage: boolean
  userRole: string
}

export default function IntegrationsClient({
  integrations: initialIntegrations,
  orgId,
  canManage,
  userRole,
}: IntegrationsClientProps) {
  const [integrations, setIntegrations] = useState<any[]>(initialIntegrations)
  const [connectingProvider, setConnectingProvider] = useState<ProviderDef | null>(null)
  const [syncingId, setSyncingId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  const getIntegration = useCallback(
    (providerId: string) => integrations.find(i => i.provider === providerId),
    [integrations]
  )

  function handleConnectSuccess(integration: any) {
    setIntegrations(prev => {
      const exists = prev.findIndex(i => i.id === integration.id)
      if (exists >= 0) {
        const next = [...prev]
        next[exists] = integration
        return next
      }
      return [...prev, integration]
    })
    setConnectingProvider(null)
  }

  async function handleDisconnect(integrationId: string) {
    try {
      const res = await fetch(`/api/integrations?id=${integrationId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to disconnect')
      setIntegrations(prev =>
        prev.map(i => i.id === integrationId ? { ...i, status: 'disconnected' } : i)
      )
    } catch (err) {
      console.error(err)
    }
  }

  async function handleSync(integrationId: string) {
    setSyncingId(integrationId)
    try {
      await fetch(`/api/integrations/${integrationId}/sync`, { method: 'POST' })
      // Refresh integration data
      const res = await fetch('/api/integrations')
      if (res.ok) {
        const json = await res.json()
        setIntegrations(json.integrations ?? [])
      }
    } catch (err) {
      console.error(err)
    } finally {
      setSyncingId(null)
    }
  }

  const connectedProviders = integrations
    .filter(i => i.status === 'connected')
    .map(i => i.provider as string)

  const connectedCount = connectedProviders.length

  // Filter + group providers by category
  const filteredProviders = useMemo(() => {
    if (!searchTerm.trim()) return PROVIDERS
    const q = searchTerm.toLowerCase()
    return PROVIDERS.filter(p => p.name.toLowerCase().includes(q) || p.tagline.toLowerCase().includes(q))
  }, [searchTerm])

  const byCategory = filteredProviders.reduce<Record<ProviderCategory, ProviderDef[]>>((acc, p) => {
    if (!acc[p.category]) acc[p.category] = []
    acc[p.category].push(p)
    return acc
  }, {} as any)

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold text-foreground">Integrations Hub</h1>
              <Badge variant="info" className="text-xs">Pro Feature</Badge>
            </div>
            <p className="text-muted-foreground text-sm max-w-xl">
              Connect your scheduling and operations software to sync aircraft data and
              auto-generate reminders based on actual flight activity.
            </p>
          </div>

          {connectedCount > 0 && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-50 border border-emerald-100">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span className="text-sm font-medium text-emerald-700">
                {connectedCount} integration{connectedCount > 1 ? 's' : ''} active
              </span>
            </div>
          )}
        </div>

        {/* How it works strip */}
        <div className="rounded-xl border border-border bg-gradient-to-r from-blue-50 via-background to-background p-5">
          <div className="flex flex-wrap gap-6">
            {[
              { icon: Plug, label: 'Connect', desc: 'Enter your API key from your scheduling software' },
              { icon: RefreshCw, label: 'Auto-Sync', desc: 'Aircraft times update automatically on flight completion' },
              { icon: Zap, label: 'Reminders', desc: 'Maintenance reminders stay accurate without manual entry' },
            ].map(({ icon: Icon, label, desc }) => (
              <div key={label} className="flex items-start gap-3 flex-1 min-w-40">
                <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Icon className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{label}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search integrations…"
            className="pl-9"
          />
        </div>

        {filteredProviders.length === 0 && (
          <div className="rounded-xl border border-border bg-card px-6 py-10 text-center text-sm text-muted-foreground">
            No integrations match &ldquo;{searchTerm}&rdquo;
          </div>
        )}

        {/* Integration cards by category */}
        {(Object.entries(byCategory) as [ProviderCategory, ProviderDef[]][]).map(([category, providers]) => (
          <div key={category}>
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-sm font-semibold text-foreground">{category}</h2>
              <div className="flex-1 h-px bg-border" />
              <Badge variant={CATEGORY_COLOR[category] as any} className="text-[10px] py-0">
                {providers.filter(p => p.status === 'available').length} available
              </Badge>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {providers.map(provider => (
                <IntegrationCard
                  key={provider.id}
                  provider={provider}
                  integration={getIntegration(provider.id)}
                  canManage={canManage}
                  onConnect={setConnectingProvider}
                  onDisconnect={handleDisconnect}
                  onSync={handleSync}
                  syncingId={syncingId}
                />
              ))}
            </div>
          </div>
        ))}

        {/* Webhooks */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-sm font-semibold text-foreground">Inbound Webhooks</h2>
            <div className="flex-1 h-px bg-border" />
          </div>
          <WebhooksSection connectedProviders={connectedProviders} />
        </div>

        {/* Role note */}
        {!canManage && (
          <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
            <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-800">View-only access</p>
              <p className="text-xs text-amber-700 mt-0.5">
                You have the <strong>{userRole}</strong> role. Contact an Owner or Admin to connect
                or modify integrations.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Connect modal */}
      {connectingProvider && (
        <ConnectModal
          provider={connectingProvider}
          orgId={orgId}
          onSuccess={handleConnectSuccess}
          onClose={() => setConnectingProvider(null)}
        />
      )}
    </div>
  )
}
