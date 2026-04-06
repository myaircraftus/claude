'use client'

import { useState, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
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
  Users,
  Plane,
  Shield,
  Plus,
  Upload,
  Search,
  Pencil,
  Trash2,
  Loader2,
  X,
} from 'lucide-react'

interface AircraftAssignment {
  id: string
  aircraft_id: string
  relationship: string
  is_primary: boolean
  aircraft: { id: string; tail_number: string } | null
}

interface Customer {
  id: string
  name: string
  company: string | null
  email: string | null
  phone: string | null
  tags: string[] | null
  portal_access: boolean
  created_at: string
  aircraft_customer_assignments: AircraftAssignment[]
}

interface Stats {
  total: number
  withAircraft: number
  withPortal: number
}

export function CustomersList({
  customers: initialCustomers,
  stats,
}: {
  customers: Customer[]
  stats: Stats
}) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{
    imported: number
    skipped: number
    errors: string[]
  } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Add form state
  const [formName, setFormName] = useState('')
  const [formCompany, setFormCompany] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [formNotes, setFormNotes] = useState('')

  // Filter customers client-side
  const filtered = useMemo(() => {
    if (!search.trim()) return initialCustomers
    const q = search.toLowerCase()
    return initialCustomers.filter(
      c =>
        c.name.toLowerCase().includes(q) ||
        (c.email && c.email.toLowerCase().includes(q)) ||
        (c.company && c.company.toLowerCase().includes(q))
    )
  }, [initialCustomers, search])

  async function handleAddCustomer(e: React.FormEvent) {
    e.preventDefault()
    if (!formName.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName.trim(),
          company: formCompany.trim() || null,
          email: formEmail.trim() || null,
          phone: formPhone.trim() || null,
          notes: formNotes.trim() || null,
        }),
      })
      if (res.ok) {
        setAddOpen(false)
        setFormName('')
        setFormCompany('')
        setFormEmail('')
        setFormPhone('')
        setFormNotes('')
        router.refresh()
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleImportCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setImportResult(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/customers/import', {
        method: 'POST',
        body: formData,
      })
      const result = await res.json()
      setImportResult(result)
      if (result.imported > 0) {
        router.refresh()
      }
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete customer "${name}"? This cannot be undone.`)) return
    const res = await fetch(`/api/customers/${id}`, { method: 'DELETE' })
    if (res.ok) {
      router.refresh()
    } else {
      const data = await res.json()
      alert(data.error || 'Failed to delete customer')
    }
  }

  return (
    <>
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Customers</h1>
        <p className="text-muted-foreground text-sm">
          Manage your customers, assign aircraft, and track relationships
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: 'Total Customers', value: stats.total, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'With Aircraft', value: stats.withAircraft, icon: Plane, color: 'text-indigo-600', bg: 'bg-indigo-50' },
          { label: 'Portal Access', value: stats.withPortal, icon: Shield, color: 'text-emerald-600', bg: 'bg-emerald-50' },
        ].map(stat => (
          <div key={stat.label} className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${stat.bg}`}>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </div>
            <div>
              <p className="text-xl font-bold text-foreground leading-none">{stat.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Search + actions */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, or company..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleImportCSV}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
          >
            {importing ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Upload className="h-4 w-4 mr-1.5" />}
            Import CSV
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Add Customer
          </Button>
        </div>
      </div>

      {/* Import result toast */}
      {importResult && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-border bg-card">
          <div className="flex-1 text-sm">
            <p className="font-medium text-foreground">
              Import complete: {importResult.imported} imported, {importResult.skipped} skipped
            </p>
            {importResult.errors.length > 0 && (
              <ul className="mt-1 text-xs text-muted-foreground space-y-0.5">
                {importResult.errors.slice(0, 5).map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
                {importResult.errors.length > 5 && (
                  <li>...and {importResult.errors.length - 5} more errors</li>
                )}
              </ul>
            )}
          </div>
          <button onClick={() => setImportResult(null)} className="p-1 rounded hover:bg-muted">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      )}

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 rounded-xl border border-dashed border-border text-center">
          <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mb-3">
            <Users className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground">
            {search ? 'No customers match your search' : 'No customers yet'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {search ? 'Try a different search term.' : 'Add a customer or import from CSV to get started.'}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b border-border">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Company</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Phone</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Aircraft</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Tags</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {filtered.map(customer => {
                  const tails = (customer.aircraft_customer_assignments ?? [])
                    .map(a => a.aircraft?.tail_number)
                    .filter(Boolean)

                  return (
                    <tr
                      key={customer.id}
                      className="hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => router.push(`/customers/${customer.id}`)}
                    >
                      <td className="px-4 py-3">
                        <span className="font-medium text-foreground">{customer.name}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {customer.company || '\u2014'}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {customer.email || '\u2014'}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {customer.phone || '\u2014'}
                      </td>
                      <td className="px-4 py-3">
                        {tails.length > 0 ? (
                          <span className="flex items-center gap-1 text-xs font-mono">
                            <Plane className="h-3 w-3 text-muted-foreground" />
                            {tails.join(', ')}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">\u2014</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {(customer.tags ?? []).map(tag => (
                            <Badge key={tag} variant="secondary" className="text-xs px-1.5 py-0">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => router.push(`/customers/${customer.id}`)}
                            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            title="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(customer.id, customer.name)}
                            className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 border-t border-border bg-muted/20">
            <span className="text-xs text-muted-foreground">
              {filtered.length.toLocaleString()} customer{filtered.length !== 1 ? 's' : ''}
              {search && ` matching "${search}"`}
            </span>
          </div>
        </div>
      )}

      {/* Add Customer Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Customer</DialogTitle>
            <DialogDescription>
              Create a new customer record for your organization.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddCustomer} className="space-y-4">
            <div>
              <Label htmlFor="cust-name">Name *</Label>
              <Input
                id="cust-name"
                value={formName}
                onChange={e => setFormName(e.target.value)}
                placeholder="Customer name"
                className="mt-1"
                required
              />
            </div>
            <div>
              <Label htmlFor="cust-company">Company</Label>
              <Input
                id="cust-company"
                value={formCompany}
                onChange={e => setFormCompany(e.target.value)}
                placeholder="Company name"
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="cust-email">Email</Label>
                <Input
                  id="cust-email"
                  type="email"
                  value={formEmail}
                  onChange={e => setFormEmail(e.target.value)}
                  placeholder="email@example.com"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="cust-phone">Phone</Label>
                <Input
                  id="cust-phone"
                  value={formPhone}
                  onChange={e => setFormPhone(e.target.value)}
                  placeholder="(555) 123-4567"
                  className="mt-1"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="cust-notes">Notes</Label>
              <textarea
                id="cust-notes"
                value={formNotes}
                onChange={e => setFormNotes(e.target.value)}
                placeholder="Optional notes..."
                rows={3}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving || !formName.trim()}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create Customer'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
