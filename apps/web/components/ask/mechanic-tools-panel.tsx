'use client'

import { useState } from 'react'
import { useTenantRouter } from '@/components/shared/tenant-link'
import { Sparkles, ClipboardList, Package, X, Loader2, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { OrgRole } from '@/types'

interface AircraftOption {
  id: string
  tail_number: string
  make: string
  model: string
}

interface Props {
  userRole: OrgRole | null | undefined
  aircraft: AircraftOption[]
}

const MECHANIC_ROLES: readonly OrgRole[] = ['owner', 'admin', 'mechanic']

// ── Generate Logbook dialog ───────────────────────────────────────────────────

function GenerateLogbookDialog({
  open,
  onClose,
  aircraft,
}: {
  open: boolean
  onClose: () => void
  aircraft: AircraftOption[]
}) {
  const router = useTenantRouter()
  const [aircraftId, setAircraftId] = useState(aircraft[0]?.id ?? '')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)

  async function handleGenerate() {
    if (!description.trim() || !aircraftId) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/ai/generate-logbook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aircraft_id: aircraftId,
          squawk_description: description.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Generation failed')
      setResult(data.description ?? JSON.stringify(data, null, 2))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  function handleUse() {
    const params = new URLSearchParams()
    if (aircraftId) params.set('aircraft_id', aircraftId)
    // Pass description as a seed via the URL isn't supported, so navigate to
    // /maintenance/new and let the user paste — OR open with pre-fill via state.
    // For now navigate to new entry page so the user can continue there.
    router.push(`/maintenance/new?aircraft_id=${aircraftId}`)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Generate Logbook Entry
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {aircraft.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
                Aircraft
              </label>
              <select
                value={aircraftId}
                onChange={e => setAircraftId(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {aircraft.map(ac => (
                  <option key={ac.id} value={ac.id}>
                    {ac.tail_number} — {ac.make} {ac.model}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
              Describe the work / squawk
            </label>
            <Textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="e.g. Replaced left magneto, checked timing, all systems airworthy."
              className="min-h-[100px] text-sm resize-none"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {result && (
            <div className="rounded-md bg-muted/60 border border-border p-3">
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Generated entry:</p>
              <pre className="text-sm font-mono whitespace-pre-wrap leading-relaxed text-foreground">
                {result}
              </pre>
            </div>
          )}

          <div className="flex items-center gap-2 justify-end pt-1">
            <Button variant="outline" size="sm" onClick={onClose}>
              <X className="h-3.5 w-3.5 mr-1" /> Cancel
            </Button>
            {!result && (
              <Button size="sm" onClick={handleGenerate} disabled={loading || !description.trim() || !aircraftId}>
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Sparkles className="h-3.5 w-3.5 mr-1" />}
                Generate
              </Button>
            )}
            {result && (
              <Button size="sm" onClick={handleUse}>
                <Check className="h-3.5 w-3.5 mr-1" />
                Use This — Open Entry Form
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Generate Checklist dialog ─────────────────────────────────────────────────

type ChecklistScope = 'annual' | '100hr' | 'AD' | 'SB' | 'custom'

interface ChecklistItem {
  title: string
  description: string
  required: boolean
  reference?: string
}

function GenerateChecklistDialog({
  open,
  onClose,
  aircraft,
}: {
  open: boolean
  onClose: () => void
  aircraft: AircraftOption[]
}) {
  const [aircraftId, setAircraftId] = useState(aircraft[0]?.id ?? '')
  const [scope, setScope] = useState<ChecklistScope>('annual')
  const [reference, setReference] = useState('')
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<ChecklistItem[] | null>(null)

  async function handleGenerate() {
    if (!aircraftId) return
    setLoading(true)
    setError(null)
    setItems(null)
    try {
      const res = await fetch('/api/ai/generate-checklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aircraft_id: aircraftId,
          scope,
          reference: reference.trim() || undefined,
          prompt: prompt.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Generation failed')
      setItems(data.items ?? [])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" />
            Generate Checklist
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {aircraft.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Aircraft</label>
              <select
                value={aircraftId}
                onChange={e => setAircraftId(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {aircraft.map(ac => (
                  <option key={ac.id} value={ac.id}>
                    {ac.tail_number} — {ac.make} {ac.model}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Scope</label>
            <select
              value={scope}
              onChange={e => setScope(e.target.value as ChecklistScope)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="annual">Annual Inspection</option>
              <option value="100hr">100-Hour Inspection</option>
              <option value="AD">AD Compliance</option>
              <option value="SB">SB Compliance</option>
              <option value="custom">Custom</option>
            </select>
          </div>

          {(scope === 'AD' || scope === 'SB') && (
            <div>
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
                {scope} Reference
              </label>
              <Input
                value={reference}
                onChange={e => setReference(e.target.value)}
                placeholder={scope === 'AD' ? 'e.g. AD 2019-12-03' : 'e.g. SB-123-45'}
              />
            </div>
          )}

          {scope === 'custom' && (
            <div>
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Describe the check</label>
              <Textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder="e.g. Pre-flight inspection after landing gear replacement"
                className="min-h-[80px] text-sm resize-none"
              />
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          {items && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {items.length} items generated
              </p>
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {items.map((item, i) => (
                  <div key={i} className="rounded-md border border-border bg-muted/40 p-3">
                    <div className="flex items-start gap-2">
                      {item.required ? (
                        <span className="mt-0.5 h-2 w-2 rounded-full bg-destructive flex-shrink-0" />
                      ) : (
                        <span className="mt-0.5 h-2 w-2 rounded-full bg-muted-foreground/40 flex-shrink-0" />
                      )}
                      <div>
                        <p className="text-sm font-medium text-foreground">{item.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                        {item.reference && (
                          <p className="text-xs font-mono text-primary mt-0.5">{item.reference}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 justify-end pt-1">
            <Button variant="outline" size="sm" onClick={onClose}>
              <X className="h-3.5 w-3.5 mr-1" /> Close
            </Button>
            <Button size="sm" onClick={handleGenerate} disabled={loading || !aircraftId}>
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <ClipboardList className="h-3.5 w-3.5 mr-1" />}
              {items ? 'Regenerate' : 'Generate'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Find Parts dialog (mock) ──────────────────────────────────────────────────

function FindPartsDialog({
  open,
  onClose,
  aircraft,
}: {
  open: boolean
  onClose: () => void
  aircraft: AircraftOption[]
}) {
  const router = useTenantRouter()
  const [aircraftId, setAircraftId] = useState(aircraft[0]?.id ?? '')
  const [query, setQuery] = useState('')

  function handleSearch() {
    const params = new URLSearchParams()
    if (query.trim()) params.set('q', query.trim())
    if (aircraftId) params.set('aircraft_id', aircraftId)
    router.push(`/parts/library?${params.toString()}`)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-4 w-4 text-primary" />
            Find Parts
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {aircraft.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Aircraft</label>
              <select
                value={aircraftId}
                onChange={e => setAircraftId(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {aircraft.map(ac => (
                  <option key={ac.id} value={ac.id}>
                    {ac.tail_number} — {ac.make} {ac.model}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
              Part description or number
            </label>
            <Input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSearch() }}
              placeholder="e.g. magneto, Champion CH48110-1, oil filter"
            />
          </div>

          <div className="flex items-center gap-2 justify-end pt-1">
            <Button variant="outline" size="sm" onClick={onClose}>
              <X className="h-3.5 w-3.5 mr-1" /> Cancel
            </Button>
            <Button size="sm" onClick={handleSearch}>
              <Package className="h-3.5 w-3.5 mr-1" />
              Search Parts Library
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function MechanicToolsPanel({ userRole, aircraft }: Props) {
  const [logbookOpen, setLogbookOpen] = useState(false)
  const [checklistOpen, setChecklistOpen] = useState(false)
  const [partsOpen, setPartsOpen] = useState(false)

  if (!userRole || !MECHANIC_ROLES.includes(userRole)) return null

  return (
    <>
      <div className="border border-border rounded-xl bg-white p-4">
        <p className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Mechanic Quick Tools
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setLogbookOpen(true)}
            className="text-xs"
          >
            <Sparkles className="h-3.5 w-3.5 mr-1 text-primary" />
            Generate Logbook Entry
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setChecklistOpen(true)}
            className="text-xs"
          >
            <ClipboardList className="h-3.5 w-3.5 mr-1 text-primary" />
            Generate Checklist
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPartsOpen(true)}
            className="text-xs"
          >
            <Package className="h-3.5 w-3.5 mr-1 text-primary" />
            Find Parts
          </Button>
        </div>
      </div>

      <GenerateLogbookDialog
        open={logbookOpen}
        onClose={() => setLogbookOpen(false)}
        aircraft={aircraft}
      />
      <GenerateChecklistDialog
        open={checklistOpen}
        onClose={() => setChecklistOpen(false)}
        aircraft={aircraft}
      />
      <FindPartsDialog
        open={partsOpen}
        onClose={() => setPartsOpen(false)}
        aircraft={aircraft}
      />
    </>
  )
}
