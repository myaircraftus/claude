'use client'

import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Users, Search, X, Loader2, Check } from 'lucide-react'

interface Customer {
  id: string
  name: string
  email?: string
  company?: string
}

interface OwnerPickerProps {
  aircraftId: string
  currentOwner: Customer | null
}

export function OwnerPicker({ aircraftId, currentOwner }: OwnerPickerProps) {
  const [owner, setOwner] = useState<Customer | null>(currentOwner)
  const [showPicker, setShowPicker] = useState(false)
  const [search, setSearch] = useState('')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!showPicker) return
    const timer = setTimeout(() => {
      fetchCustomers(search)
    }, 300)
    return () => clearTimeout(timer)
  }, [search, showPicker])

  useEffect(() => {
    if (showPicker && inputRef.current) {
      inputRef.current.focus()
    }
  }, [showPicker])

  async function fetchCustomers(query: string) {
    setLoading(true)
    try {
      const res = await fetch(`/api/customers?search=${encodeURIComponent(query)}&limit=20`)
      if (res.ok) {
        const data = await res.json()
        setCustomers(data.customers ?? [])
      }
    } finally {
      setLoading(false)
    }
  }

  async function selectOwner(customer: Customer | null) {
    setSaving(true)
    try {
      const res = await fetch(`/api/aircraft/${aircraftId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner_customer_id: customer?.id ?? null }),
      })
      const data = await res.json().catch(() => null)

      if (!res.ok) {
        toast.error(data?.error ?? 'Failed to update aircraft owner')
        return
      }

      setOwner(customer)
      setShowPicker(false)
      setSearch('')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
            <Users className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            {owner ? (
              <>
                <p className="text-sm font-medium">{owner.name}</p>
                {owner.email && (
                  <p className="text-xs text-muted-foreground">{owner.email}</p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No owner assigned</p>
            )}
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowPicker(!showPicker)}
        >
          {showPicker ? (
            <>
              <X className="mr-1 h-3.5 w-3.5" />
              Cancel
            </>
          ) : (
            'Change Owner'
          )}
        </Button>
      </div>

      {showPicker && (
        <div className="mt-3 space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={inputRef}
              placeholder="Search customers..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <Card>
            <CardContent className="p-0 max-h-[240px] overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : customers.length === 0 ? (
                <div className="py-6 text-center">
                  <p className="text-sm text-muted-foreground">No customers found</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {customers.map(c => (
                    <button
                      key={c.id}
                      onClick={() => selectOwner(c)}
                      disabled={saving}
                      className="w-full flex items-center gap-3 p-3 text-left hover:bg-accent transition-colors disabled:opacity-50"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{c.name}</p>
                        <div className="flex items-center gap-2">
                          {c.email && (
                            <span className="text-xs text-muted-foreground truncate">{c.email}</span>
                          )}
                          {c.company && (
                            <Badge variant="secondary" className="text-xs py-0 px-1.5">{c.company}</Badge>
                          )}
                        </div>
                      </div>
                      {owner?.id === c.id && (
                        <Check className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                      )}
                      {saving && (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground flex-shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {owner && (
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => {
                const confirmed = window.confirm(
                  'Remove this aircraft from the current owner UI? The aircraft record will stay in the backend and can be reassigned later.'
                )
                if (confirmed) {
                  void selectOwner(null)
                }
              }}
              disabled={saving}
            >
              Remove owner
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
