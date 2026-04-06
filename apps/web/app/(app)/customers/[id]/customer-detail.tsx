'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  User,
  Building2,
  Mail,
  Phone,
  Plane,
  ClipboardList,
  Receipt,
  Save,
  Plus,
  Trash2,
  Loader2,
} from 'lucide-react'

interface Aircraft {
  id: string
  tail_number: string
  make: string
  model: string
}

interface AircraftAssignment {
  id: string
  aircraft_id: string
  relationship: string
  is_primary: boolean
  aircraft: Aircraft | null
}

interface WorkOrder {
  id: string
  work_order_number: string
  status: string
  complaint: string | null
  total_amount: number | null
  opened_at: string | null
  created_at: string
  aircraft: { id: string; tail_number: string } | null
}

interface CustomerData {
  id: string
  name: string
  company: string | null
  email: string | null
  phone: string | null
  secondary_email: string | null
  secondary_phone: string | null
  billing_address: Record<string, string> | null
  notes: string | null
  preferred_communication: string
  tags: string[] | null
  portal_access: boolean
  imported_at: string | null
  import_source: string | null
  created_at: string
  updated_at: string
  aircraft_customer_assignments: AircraftAssignment[]
}

const RELATIONSHIP_COLORS: Record<string, string> = {
  owner: 'bg-blue-50 text-blue-700 border-blue-200',
  operator: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  lessee: 'bg-amber-50 text-amber-700 border-amber-200',
  manager: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  fractional: 'bg-violet-50 text-violet-700 border-violet-200',
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  open: 'bg-blue-50 text-blue-700',
  in_progress: 'bg-indigo-50 text-indigo-700',
  closed: 'bg-green-50 text-green-700',
  invoiced: 'bg-violet-50 text-violet-700',
  paid: 'bg-green-100 text-green-800',
}

export function CustomerDetail({
  customer,
  workOrders,
  invoiceCount,
  invoiceTotal,
  orgAircraft,
}: {
  customer: CustomerData
  workOrders: WorkOrder[]
  invoiceCount: number
  invoiceTotal: number
  orgAircraft: Aircraft[]
}) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [assignSaving, setAssignSaving] = useState(false)

  // Editable fields
  const [name, setName] = useState(customer.name)
  const [company, setCompany] = useState(customer.company ?? '')
  const [email, setEmail] = useState(customer.email ?? '')
  const [phone, setPhone] = useState(customer.phone ?? '')
  const [secondaryEmail, setSecondaryEmail] = useState(customer.secondary_email ?? '')
  const [secondaryPhone, setSecondaryPhone] = useState(customer.secondary_phone ?? '')
  const [notes, setNotes] = useState(customer.notes ?? '')

  // Assign aircraft form
  const [assignAircraftId, setAssignAircraftId] = useState('')
  const [assignRelationship, setAssignRelationship] = useState('owner')
  const [assignPrimary, setAssignPrimary] = useState(false)

  const assignedAircraftIds = new Set(
    customer.aircraft_customer_assignments.map(a => a.aircraft_id)
  )
  const availableAircraft = orgAircraft.filter(a => !assignedAircraftIds.has(a.id))

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch(`/api/customers/${customer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          company: company.trim() || null,
          email: email.trim() || null,
          phone: phone.trim() || null,
          secondary_email: secondaryEmail.trim() || null,
          secondary_phone: secondaryPhone.trim() || null,
          notes: notes.trim() || null,
        }),
      })
      if (res.ok) {
        router.refresh()
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleAssignAircraft(e: React.FormEvent) {
    e.preventDefault()
    if (!assignAircraftId) return
    setAssignSaving(true)
    try {
      const res = await fetch(`/api/customers/${customer.id}/aircraft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aircraft_id: assignAircraftId,
          relationship: assignRelationship,
          is_primary: assignPrimary,
        }),
      })
      if (res.ok) {
        setAssignOpen(false)
        setAssignAircraftId('')
        setAssignRelationship('owner')
        setAssignPrimary(false)
        router.refresh()
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to assign aircraft')
      }
    } finally {
      setAssignSaving(false)
    }
  }

  async function handleRemoveAircraft(aircraftId: string) {
    if (!confirm('Remove this aircraft assignment?')) return
    const res = await fetch(`/api/customers/${customer.id}/aircraft`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aircraft_id: aircraftId }),
    })
    if (res.ok) {
      router.refresh()
    }
  }

  return (
    <>
      {/* Customer Info Card */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{customer.name}</h1>
            {customer.company && (
              <p className="text-muted-foreground text-sm flex items-center gap-1.5 mt-1">
                <Building2 className="h-3.5 w-3.5" />
                {customer.company}
              </p>
            )}
          </div>
          <Button onClick={handleSave} disabled={saving} size="sm">
            {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
            Save Changes
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="det-name">Name</Label>
            <Input
              id="det-name"
              value={name}
              onChange={e => setName(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="det-company">Company</Label>
            <Input
              id="det-company"
              value={company}
              onChange={e => setCompany(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="det-email">
              <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> Email</span>
            </Label>
            <Input
              id="det-email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="det-phone">
              <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> Phone</span>
            </Label>
            <Input
              id="det-phone"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="det-email2">Secondary Email</Label>
            <Input
              id="det-email2"
              type="email"
              value={secondaryEmail}
              onChange={e => setSecondaryEmail(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="det-phone2">Secondary Phone</Label>
            <Input
              id="det-phone2"
              value={secondaryPhone}
              onChange={e => setSecondaryPhone(e.target.value)}
              className="mt-1"
            />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="det-notes">Notes</Label>
            <textarea
              id="det-notes"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            />
          </div>
        </div>

        {/* Tags + metadata */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {(customer.tags ?? []).map(tag => (
            <Badge key={tag} variant="secondary" className="text-xs">
              {tag}
            </Badge>
          ))}
          {customer.portal_access && (
            <Badge variant="outline" className="text-xs text-emerald-700 border-emerald-200 bg-emerald-50">
              Portal Access
            </Badge>
          )}
          {customer.import_source && (
            <Badge variant="outline" className="text-xs text-muted-foreground">
              Imported via {customer.import_source}
            </Badge>
          )}
        </div>
      </div>

      {/* Assigned Aircraft */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Plane className="h-5 w-5 text-muted-foreground" />
            Assigned Aircraft
          </h2>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setAssignOpen(true)}
            disabled={availableAircraft.length === 0}
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Assign Aircraft
          </Button>
        </div>

        {customer.aircraft_customer_assignments.length === 0 ? (
          <div className="py-8 text-center rounded-lg border border-dashed border-border">
            <Plane className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No aircraft assigned to this customer</p>
          </div>
        ) : (
          <div className="space-y-2">
            {customer.aircraft_customer_assignments.map(assignment => (
              <div
                key={assignment.id}
                className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
                    <Plane className="h-4 w-4 text-indigo-600" />
                  </div>
                  <div>
                    <p className="font-mono text-sm font-semibold text-foreground">
                      {assignment.aircraft?.tail_number ?? 'Unknown'}
                    </p>
                    {assignment.aircraft && (
                      <p className="text-xs text-muted-foreground">
                        {assignment.aircraft.make} {assignment.aircraft.model}
                      </p>
                    )}
                  </div>
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border ${RELATIONSHIP_COLORS[assignment.relationship] ?? 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                    {assignment.relationship}
                  </span>
                  {assignment.is_primary && (
                    <Badge variant="secondary" className="text-xs">Primary</Badge>
                  )}
                </div>
                <button
                  onClick={() => handleRemoveAircraft(assignment.aircraft_id)}
                  className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                  title="Remove assignment"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Work Orders */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-4">
          <ClipboardList className="h-5 w-5 text-muted-foreground" />
          Work Orders
        </h2>

        {workOrders.length === 0 ? (
          <div className="py-8 text-center rounded-lg border border-dashed border-border">
            <ClipboardList className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No work orders for this customer</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b border-border">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">WO #</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Aircraft</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Complaint</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {workOrders.map(wo => (
                  <tr key={wo.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/work-orders/${wo.id}`}
                        className="font-mono text-xs font-semibold text-brand-600 hover:text-brand-700 hover:underline"
                      >
                        {wo.work_order_number}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      {wo.aircraft ? (
                        <span className="flex items-center gap-1 font-mono">
                          <Plane className="h-3 w-3 text-muted-foreground" />
                          {wo.aircraft.tail_number}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">{'\u2014'}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[wo.status] ?? 'bg-slate-100 text-slate-600'}`}>
                        {wo.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-foreground max-w-xs truncate">
                      {wo.complaint || <span className="text-muted-foreground italic">No complaint</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs font-semibold tabular-nums">
                      ${(wo.total_amount ?? 0).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Invoices */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-4">
          <Receipt className="h-5 w-5 text-muted-foreground" />
          Invoices
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 rounded-lg bg-muted/30 border border-border">
            <p className="text-2xl font-bold text-foreground">{invoiceCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Total Invoices</p>
          </div>
          <div className="p-4 rounded-lg bg-muted/30 border border-border">
            <p className="text-2xl font-bold text-foreground">${invoiceTotal.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Total Amount</p>
          </div>
        </div>
      </div>

      {/* Assign Aircraft Dialog */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Aircraft</DialogTitle>
            <DialogDescription>
              Link an aircraft to this customer with a relationship type.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAssignAircraft} className="space-y-4">
            <div>
              <Label htmlFor="assign-aircraft">Aircraft</Label>
              <select
                id="assign-aircraft"
                value={assignAircraftId}
                onChange={e => setAssignAircraftId(e.target.value)}
                className="w-full mt-1 h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                required
              >
                <option value="">Select aircraft...</option>
                {availableAircraft.map(ac => (
                  <option key={ac.id} value={ac.id}>
                    {ac.tail_number} - {ac.make} {ac.model}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="assign-relationship">Relationship</Label>
              <select
                id="assign-relationship"
                value={assignRelationship}
                onChange={e => setAssignRelationship(e.target.value)}
                className="w-full mt-1 h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="owner">Owner</option>
                <option value="operator">Operator</option>
                <option value="lessee">Lessee</option>
                <option value="manager">Manager</option>
                <option value="fractional">Fractional</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="assign-primary"
                type="checkbox"
                checked={assignPrimary}
                onChange={e => setAssignPrimary(e.target.checked)}
                className="rounded border-input"
              />
              <Label htmlFor="assign-primary" className="text-sm font-normal cursor-pointer">
                Primary relationship
              </Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAssignOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={assignSaving || !assignAircraftId}>
                {assignSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Assign'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
