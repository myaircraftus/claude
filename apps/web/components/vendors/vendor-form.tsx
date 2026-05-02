'use client'

/**
 * VendorForm (Spec 2.2) — create/edit a vendor.
 *
 * Inline form on VendorsView. Edit mode pre-loads via `initial`.
 */

import { useState } from 'react'
import { Loader2, Building2, X, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type { Vendor, VendorType } from '@/types'

const VENDOR_TYPES: { value: VendorType; label: string }[] = [
  { value: 'parts',   label: 'Parts' },
  { value: 'osr',     label: 'OSR (outside service)' },
  { value: 'service', label: 'Service' },
  { value: 'freight', label: 'Freight' },
  { value: 'other',   label: 'Other' },
]

export function VendorForm({
  initial,
  onSaved,
  onCancel,
}: {
  initial?: Vendor
  onSaved: () => void
  onCancel: () => void
}) {
  const editing = !!initial
  const [name, setName] = useState(initial?.name ?? '')
  const [vendorType, setVendorType] = useState<VendorType>(initial?.vendor_type ?? 'parts')
  const [approved, setApproved] = useState(initial?.approved ?? false)
  const [contactName, setContactName] = useState(initial?.contact_name ?? '')
  const [contactEmail, setContactEmail] = useState(initial?.contact_email ?? '')
  const [phone, setPhone] = useState(initial?.phone ?? '')
  const [website, setWebsite] = useState(initial?.website ?? '')
  const [address, setAddress] = useState(initial?.address ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { toast.error('Name required'); return }
    setSubmitting(true)
    try {
      const payload = {
        name: name.trim(),
        vendor_type: vendorType,
        approved,
        contact_name:  contactName.trim()  || null,
        contact_email: contactEmail.trim() || null,
        phone:         phone.trim()        || null,
        website:       website.trim()      || null,
        address:       address.trim()      || null,
        description:   description.trim()  || null,
      }
      const url = editing ? `/api/vendors/${initial!.id}` : '/api/vendors'
      const method = editing ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(out?.error || 'Save failed')
        return
      }
      toast.success(editing ? 'Vendor updated' : 'Vendor added')
      onSaved()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-border p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Building2 className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-[14px] text-foreground" style={{ fontWeight: 700 }}>
          {editing ? `Edit vendor — ${initial!.name}` : 'New vendor'}
        </h3>
        <button type="button" onClick={onCancel} className="ml-auto p-1 rounded-md hover:bg-muted text-muted-foreground" title="Close">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Aircraft Spruce" className={inputCls} />
        </Field>
        <Field label="Type">
          <select value={vendorType} onChange={(e) => setVendorType(e.target.value as VendorType)} className={inputCls}>
            {VENDOR_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </Field>
      </div>

      <label className="inline-flex items-center gap-2 text-[13px] text-foreground cursor-pointer">
        <input
          type="checkbox"
          checked={approved}
          onChange={(e) => setApproved(e.target.checked)}
          className="rounded border-border"
        />
        <span className="inline-flex items-center gap-1">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
          <span style={{ fontWeight: 500 }}>Approved vendor</span>
          <span className="text-muted-foreground/80">— eligible for OSR work + auto-approved POs</span>
        </span>
      </label>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Contact name">
          <input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Jane Doe" className={inputCls} />
        </Field>
        <Field label="Contact email">
          <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="orders@vendor.com" className={inputCls} />
        </Field>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Phone">
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 123 4567" className={inputCls} />
        </Field>
        <Field label="Website">
          <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://aircraftspruce.com" className={inputCls} />
        </Field>
      </div>

      <Field label="Address">
        <textarea value={address} onChange={(e) => setAddress(e.target.value)} className={`${inputCls} resize-none`} rows={2} />
      </Field>
      <Field label="Description / notes">
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} className={`${inputCls} resize-none`} rows={2} placeholder="Account number, terms, lead time…" />
      </Field>

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>Cancel</Button>
        <Button type="submit" disabled={submitting}>
          {submitting && <Loader2 className="h-3 w-3 animate-spin mr-1.5" />}
          {editing ? 'Save changes' : 'Add vendor'}
        </Button>
      </div>
    </form>
  )
}

const inputCls =
  'mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-[13px] outline-none focus:border-primary'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider text-muted-foreground" style={{ fontWeight: 600 }}>
        {label}
      </label>
      {children}
    </div>
  )
}
