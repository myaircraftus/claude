'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  FileText,
  Plane,
  Plus,
  Send,
  Sparkles,
} from 'lucide-react'
import { useTenantRouter } from '@/components/shared/tenant-link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { formatCurrency } from '@/lib/utils'

type AircraftOption = {
  id: string
  tail_number: string
  make?: string | null
  model?: string | null
  owner_customer_id?: string | null
}

type CustomerOption = {
  id: string
  name: string
  company?: string | null
  email?: string | null
}

type SquawkOption = {
  id: string
  aircraft_id: string
  title: string
  description?: string | null
  severity: string
  status: string
}

type EstimateLine = {
  id: string
  item_type: 'labor' | 'part' | 'outside_service' | 'supply' | 'fee'
  description: string
  quantity: number
  unit_price: number
  source_label: string
  source_type?: string | null
  source_id?: string | null
  inventory_status?: string | null
}

type Props = {
  aircraftOptions: AircraftOption[]
  customers: CustomerOption[]
  squawks: SquawkOption[]
  initialAircraftId?: string | null
  initialSquawkId?: string | null
}

const flow = ['Auto Context', 'Pull Squawks', 'AI Scope', 'Line Items', 'Deposit', 'Owner Approval', 'Convert to WO']

function defaultValidUntil() {
  const d = new Date()
  d.setDate(d.getDate() + 14)
  return d.toISOString().slice(0, 10)
}

export function EstimateCreateWorkspace({
  aircraftOptions,
  customers,
  squawks,
  initialAircraftId,
  initialSquawkId,
}: Props) {
  const router = useTenantRouter()
  const [aircraftId, setAircraftId] = useState(initialAircraftId ?? aircraftOptions[0]?.id ?? '')
  const selectedAircraft = aircraftOptions.find((aircraft) => aircraft.id === aircraftId) ?? null
  const inferredCustomerId = selectedAircraft?.owner_customer_id ?? ''
  const [customerId, setCustomerId] = useState(inferredCustomerId)
  const [estimateType, setEstimateType] = useState('Inspection + Repair')
  const [validUntil, setValidUntil] = useState(defaultValidUntil())
  const [terms, setTerms] = useState('Estimate is valid until the date shown. Final invoice is based on approved work-order actuals and approved changes.')
  const [prompt, setPrompt] = useState('')
  const [selectedSquawks, setSelectedSquawks] = useState<string[]>(initialSquawkId ? [initialSquawkId] : [])
  const [depositRequired, setDepositRequired] = useState(true)
  const [depositAmount, setDepositAmount] = useState('300')
  const [saving, setSaving] = useState(false)
  const [lines, setLines] = useState<EstimateLine[]>([
    { id: 'labor-annual', item_type: 'labor', description: 'Inspection labor', quantity: 8, unit_price: 95, source_label: 'Template', source_type: 'template' },
    { id: 'supply-shop', item_type: 'supply', description: 'Shop supplies', quantity: 1, unit_price: 25, source_label: 'Shop Rule', source_type: 'shop_rule' },
  ])

  const aircraftSquawks = useMemo(
    () => squawks.filter((squawk) => squawk.aircraft_id === aircraftId && !['resolved', 'closed_duplicate', 'archived'].includes(squawk.status)),
    [aircraftId, squawks]
  )

  const customer = customers.find((item) => item.id === (customerId || inferredCustomerId)) ?? null
  const totals = useMemo(() => {
    const labor = lines.filter((line) => line.item_type === 'labor').reduce((sum, line) => sum + line.quantity * line.unit_price, 0)
    const parts = lines.filter((line) => line.item_type === 'part').reduce((sum, line) => sum + line.quantity * line.unit_price, 0)
    const outside = lines.filter((line) => line.item_type === 'outside_service').reduce((sum, line) => sum + line.quantity * line.unit_price, 0)
    const suppliesFees = lines.filter((line) => ['supply', 'fee'].includes(line.item_type)).reduce((sum, line) => sum + line.quantity * line.unit_price, 0)
    const total = labor + parts + outside + suppliesFees
    return { labor, parts, outside, suppliesFees, total, balance: total - (depositRequired ? Number(depositAmount || 0) : 0) }
  }, [depositAmount, depositRequired, lines])

  function toggleSquawk(id: string) {
    setSelectedSquawks((prev) => prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id])
  }

  function handleAircraftChange(value: string) {
    setAircraftId(value)
    setCustomerId(aircraftOptions.find((aircraft) => aircraft.id === value)?.owner_customer_id ?? '')
    setSelectedSquawks([])
  }

  function generateDraft() {
    const selected = aircraftSquawks.filter((squawk) => selectedSquawks.includes(squawk.id))
    const squawkLines = selected.map((squawk) => ({
      id: `sq-${squawk.id}`,
      item_type: 'labor' as const,
      description: `Inspect and troubleshoot: ${squawk.title}`,
      quantity: squawk.severity === 'high' || squawk.severity === 'critical' ? 2 : 1,
      unit_price: 95,
      source_label: 'Squawk',
      source_type: 'squawk',
      source_id: squawk.id,
    }))
    const promptLine = prompt.trim()
      ? [{
          id: `ai-${Date.now()}`,
          item_type: 'labor' as const,
          description: prompt.trim().slice(0, 120),
          quantity: 1,
          unit_price: 95,
          source_label: 'AI Draft',
          source_type: 'ai',
        }]
      : []
    setLines((prev) => [...prev.filter((line) => line.source_type !== 'squawk' && line.source_type !== 'ai'), ...squawkLines, ...promptLine])
    toast.success('Draft line items added for review.')
  }

  function addLine(itemType: EstimateLine['item_type']) {
    setLines((prev) => [
      ...prev,
      {
        id: `${itemType}-${Date.now()}`,
        item_type: itemType,
        description: itemType === 'part' ? 'Part line item' : itemType === 'outside_service' ? 'Outside service' : 'Labor line item',
        quantity: 1,
        unit_price: itemType === 'labor' ? 95 : 0,
        source_label: 'Manual',
        source_type: 'manual',
      },
    ])
  }

  function updateLine(id: string, patch: Partial<EstimateLine>) {
    setLines((prev) => prev.map((line) => line.id === id ? { ...line, ...patch } : line))
  }

  async function createEstimate(sendAfterCreate: boolean) {
    if (!aircraftId) {
      toast.error('Select aircraft before creating an estimate.')
      return
    }
    const resolvedCustomerId = customerId || inferredCustomerId
    if (!resolvedCustomerId) {
      toast.error('Owner/customer is required before owner delivery.')
      return
    }
    setSaving(true)
    try {
      const byType = (type: EstimateLine['item_type']) => lines.filter((line) => line.item_type === type).map((line) => ({
        description: line.description,
        quantity: line.quantity,
        unit_price: line.unit_price,
        item_type: line.item_type,
        source_label: line.source_label,
        source_type: line.source_type,
        source_id: line.source_id,
        inventory_status: line.inventory_status,
        amount: line.quantity * line.unit_price,
      }))
      const res = await fetch('/api/estimates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aircraft_id: aircraftId,
          customer_id: resolvedCustomerId,
          source_type: initialSquawkId ? 'squawk' : 'manual',
          source_id: initialSquawkId ?? null,
          source_context: 'estimate_creation_workflow',
          status: sendAfterCreate ? 'ready_to_send' : 'draft',
          estimate_type: estimateType,
          service_type: estimateType,
          valid_until: validUntil,
          terms,
          customer_notes: prompt,
          internal_notes: selectedSquawks.length ? `Selected squawks: ${selectedSquawks.join(', ')}` : null,
          linked_squawk_ids: selectedSquawks,
          deposit_required: depositRequired,
          deposit_amount: depositRequired ? Number(depositAmount || 0) : 0,
          deposit_due_policy: depositRequired ? 'before_work' : 'none',
          labor_total: totals.labor,
          parts_total: totals.parts,
          outside_services_total: totals.outside,
          total: totals.total,
          labor_lines: byType('labor'),
          parts_lines: byType('part'),
          outside_services: byType('outside_service'),
          supply_lines: byType('supply'),
          fee_lines: byType('fee'),
          ai_draft: {
            prompt,
            selected_squawk_ids: selectedSquawks,
            confidence: selectedSquawks.length > 0 ? 0.74 : 0.58,
            warnings: lines.some((line) => line.item_type === 'part' && line.inventory_status !== 'available')
              ? ['Verify part availability before sending estimate.']
              : [],
          },
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to create estimate')
      if (sendAfterCreate) {
        const sendRes = await fetch(`/api/estimates/${data.id}/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recipient_email: customer?.email }),
        })
        if (!sendRes.ok) {
          toast.warning('Estimate created, but owner send did not complete.')
        }
      }
      toast.success(sendAfterCreate ? 'Estimate created for owner approval.' : 'Estimate draft created.')
      router.push(`/estimates/${data.id}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create estimate')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-full bg-slate-50 p-5">
      <div className="mx-auto flex max-w-[1680px] flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-normal text-slate-950">Estimate Creation - Aircraft Linked</h1>
            <p className="mt-1 text-sm text-slate-600">Commercial plan with aircraft context, squawks, AI draft, deposit request, and owner approval.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push('/estimates')}>Cancel</Button>
            <Button variant="outline" disabled={saving} onClick={() => createEstimate(false)}>Save Draft</Button>
            <Button disabled={saving} onClick={() => createEstimate(true)}><Send className="h-4 w-4" /> Send to Owner</Button>
          </div>
        </div>

        <Card className="rounded-lg border-slate-200 bg-white shadow-none">
          <CardContent className="p-4">
            <div className="grid gap-3 md:grid-cols-7">
              {flow.map((item, index) => (
                <div key={item} className="flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">{index + 1}</span>
                  <p className="text-sm font-semibold text-slate-950">{item}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-5 xl:grid-cols-[0.85fr_1fr_0.8fr]">
          <Card className="rounded-lg border-slate-200 bg-white shadow-none">
            <CardContent className="space-y-4 p-5">
              <PanelTitle icon={Plane} title="Auto-Filled Context" />
              <SelectField label="Aircraft" value={aircraftId} onChange={handleAircraftChange} options={aircraftOptions.map((a) => ({ value: a.id, label: `${a.tail_number} ${a.model ?? ''}` }))} />
              <SelectField label="Owner / Customer" value={customerId || inferredCustomerId} onChange={setCustomerId} options={customers.map((c) => ({ value: c.id, label: c.company ? `${c.name} - ${c.company}` : c.name }))} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Estimate Type" value={estimateType} onChange={setEstimateType} />
                <Field label="Valid Until" value={validUntil} onChange={setValidUntil} type="date" />
              </div>
              <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                AI context includes selected aircraft, owner, open squawks, prior work context, current estimate lines, and taxonomy labels where present.
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-lg border-slate-200 bg-white shadow-none">
            <CardContent className="space-y-4 p-5">
              <PanelTitle icon={AlertTriangle} title="Pull Squawks + AI Scope" />
              <div className="space-y-2">
                {aircraftSquawks.slice(0, 5).map((squawk) => (
                  <button key={squawk.id} onClick={() => toggleSquawk(squawk.id)} className="flex w-full items-center gap-3 rounded-md border border-slate-200 px-3 py-3 text-left hover:bg-slate-50">
                    <Checkbox checked={selectedSquawks.includes(squawk.id)} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-950">{squawk.title}</p>
                      <p className="truncate text-xs text-slate-500">{squawk.description ?? squawk.severity}</p>
                    </div>
                    <Badge className="bg-amber-50 text-amber-700">{squawk.severity}</Badge>
                  </button>
                ))}
                {aircraftSquawks.length === 0 && <p className="rounded-md border border-dashed border-slate-200 px-3 py-4 text-sm text-slate-500">No open squawks for selected aircraft.</p>}
              </div>
              <div className="space-y-2">
                <Label>Dictation / Prompt</Label>
                <Textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Create estimate for annual inspection and inspect oil seep near valve cover. Include labor, gasket if needed, oil/filter, shop supplies, and deposit request." className="min-h-[120px]" />
              </div>
              <Button onClick={generateDraft}><Sparkles className="h-4 w-4" /> Generate AI Estimate</Button>
            </CardContent>
          </Card>

          <Card className="rounded-lg border-slate-200 bg-white shadow-none">
            <CardContent className="space-y-4 p-5">
              <PanelTitle icon={CreditCard} title="Deposit + Owner Preview" />
              <SelectField label="Deposit Required" value={depositRequired ? 'yes' : 'no'} onChange={(value) => setDepositRequired(value === 'yes')} options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} />
              <Field label="Deposit Amount" value={depositAmount} onChange={setDepositAmount} type="number" />
              <div className="rounded-lg border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase text-slate-500">Estimate</p>
                    <p className="text-lg font-bold text-slate-950">{estimateType}</p>
                    <p className="text-sm text-slate-500">{selectedAircraft?.tail_number ?? 'Aircraft'} {customer ? `- ${customer.name}` : ''}</p>
                  </div>
                  <Badge className="bg-amber-50 text-amber-700">Draft</Badge>
                </div>
                <div className="mt-4 space-y-2 text-sm">
                  <AmountLine label="Estimated Total" value={totals.total} strong />
                  <AmountLine label="Deposit Requested" value={depositRequired ? Number(depositAmount || 0) : 0} />
                  <AmountLine label="Balance After Deposit" value={totals.balance} />
                </div>
              </div>
              <Textarea value={terms} onChange={(event) => setTerms(event.target.value)} className="min-h-[90px]" />
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
          <Card className="rounded-lg border-slate-200 bg-white shadow-none">
            <CardContent className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <PanelTitle icon={FileText} title="AI Drafted Line Items + Validation" />
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => addLine('labor')}><Plus className="h-4 w-4" /> Labor</Button>
                  <Button size="sm" variant="outline" onClick={() => addLine('part')}><Plus className="h-4 w-4" /> Part</Button>
                  <Button size="sm" variant="outline" onClick={() => addLine('outside_service')}><Plus className="h-4 w-4" /> Outside</Button>
                </div>
              </div>
              <div className="mt-4 overflow-hidden rounded-md border border-slate-200">
                <div className="grid grid-cols-[0.6fr_1.6fr_0.45fr_0.55fr_0.65fr_0.7fr] bg-slate-50 px-3 py-2 text-xs font-semibold uppercase text-slate-500">
                  <span>Type</span><span>Description</span><span>Qty</span><span>Rate</span><span>Amount</span><span>Source</span>
                </div>
                {lines.map((line) => (
                  <div key={line.id} className="grid grid-cols-[0.6fr_1.6fr_0.45fr_0.55fr_0.65fr_0.7fr] items-center gap-2 border-t border-slate-100 px-3 py-2">
                    <Select value={line.item_type} onValueChange={(value) => updateLine(line.id, { item_type: value as EstimateLine['item_type'] })}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>{['labor', 'part', 'outside_service', 'supply', 'fee'].map((type) => <SelectItem key={type} value={type}>{type.replace(/_/g, ' ')}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input value={line.description} onChange={(event) => updateLine(line.id, { description: event.target.value })} />
                    <Input type="number" value={line.quantity} onChange={(event) => updateLine(line.id, { quantity: Number(event.target.value || 0) })} />
                    <Input type="number" value={line.unit_price} onChange={(event) => updateLine(line.id, { unit_price: Number(event.target.value || 0) })} />
                    <p className="text-sm font-semibold text-slate-950">{formatCurrency(line.quantity * line.unit_price)}</p>
                    <Badge variant="outline">{line.source_label}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-lg border-orange-200 bg-orange-50 shadow-none">
            <CardContent className="p-5">
              <h3 className="flex items-center gap-2 text-lg font-bold text-orange-950"><CheckCircle2 className="h-5 w-5" /> Source-of-Truth Rule</h3>
              <p className="mt-3 text-sm leading-6 text-orange-900">Estimate owns planned commercial scope, approval, and deposit request. Work order owns actual work. Invoice uses approved actuals and applied deposits.</p>
              <div className="mt-4 space-y-2 text-sm text-orange-900">
                <p>Deposit is stored as payment/credit metadata, not as a labor or part line.</p>
                <p>Every line keeps a source label for squawk, template, AI, inventory, shop rule, or manual.</p>
                <p>Owner-facing delivery hides internal notes and draft warnings.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function PanelTitle({ icon: Icon, title }: { icon: any; title: string }) {
  return <h2 className="flex items-center gap-2 text-xl font-bold text-slate-950"><Icon className="h-5 w-5 text-blue-600" /> {title}</h2>
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  )
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (value: string) => void
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue placeholder={label} /></SelectTrigger>
        <SelectContent>{options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  )
}

function AmountLine({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={strong ? 'flex justify-between text-base font-bold text-slate-950' : 'flex justify-between text-slate-600'}>
      <span>{label}</span>
      <span>{formatCurrency(value)}</span>
    </div>
  )
}
