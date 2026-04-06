'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Loader2,
  Plane,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  Search,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createBrowserSupabase } from '@/lib/supabase/browser'

// ─── Types ────────────────────────────────────────────────────────────────────

interface FAAData {
  tail_number: string
  make: string
  model: string
  year?: number
  serial_number?: string
  engine_make?: string
  engine_model?: string
  registrant_name?: string
}

type LookupState = 'idle' | 'loading' | 'found' | 'not_found' | 'error'

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NewAircraftPage() {
  const router = useRouter()
  const [tail, setTail] = useState('')
  const [lookupState, setLookupState] = useState<LookupState>('idle')
  const [faaData, setFaaData] = useState<FAAData | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Trigger lookup whenever tail changes (debounced)
  useEffect(() => {
    const trimmed = tail.trim().toUpperCase()

    if (trimmed.length < 3) {
      setLookupState('idle')
      setFaaData(null)
      return
    }

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doLookup(trimmed), 600)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tail])

  async function doLookup(trimmedTail: string) {
    setLookupState('loading')
    setFaaData(null)
    setErrorMsg('')

    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      const res = await fetch(`/api/aircraft/faa-lookup?tail=${encodeURIComponent(trimmedTail)}`, { signal: controller.signal })
      const data = await res.json()

      if (!res.ok || data.error) {
        if (res.status === 404) {
          setLookupState('not_found')
          setErrorMsg('Not found in FAA Registry')
        } else {
          setLookupState('error')
          setErrorMsg(data.error ?? 'FAA Registry unavailable')
        }
        return
      }

      setFaaData(data as FAAData)
      setLookupState('found')
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return
      setLookupState('error')
      setErrorMsg('Network error — check connection')
    }
  }

  async function handleAdd() {
    if (!faaData) return
    setSaving(true)
    setSaveError('')

    try {
      const supabase = createBrowserSupabase()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setSaveError('Not authenticated.'); setSaving(false); return }

      const { data: mem } = await supabase
        .from('organization_memberships')
        .select('organization_id')
        .eq('user_id', user.id)
        .not('accepted_at', 'is', null)
        .single()

      if (!mem?.organization_id) {
        setSaveError('Unable to determine your organization.')
        setSaving(false)
        return
      }

      const res = await fetch('/api/aircraft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_id: mem.organization_id,
          tail_number: faaData.tail_number,
          make: faaData.make,
          model: faaData.model,
          year: faaData.year ?? undefined,
          serial_number: faaData.serial_number ?? undefined,
          engine_make: faaData.engine_make ?? undefined,
          engine_model: faaData.engine_model ?? undefined,
        }),
      })

      const json = await res.json()
      if (!res.ok) {
        setSaveError(json.error ?? 'Failed to add aircraft')
        setSaving(false)
        return
      }

      router.push(`/aircraft/${json.id}`)
    } catch {
      setSaveError('Network error. Please try again.')
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background px-4">
      <div className="w-full max-w-md">

        {/* Back link */}
        <Link
          href="/aircraft"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Aircraft
        </Link>

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-50 mb-4">
            <Plane className="h-7 w-7 text-brand-500" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Add Aircraft</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Enter the tail number — we&apos;ll pull everything from the FAA registry automatically.
          </p>
        </div>

        {/* Tail number input */}
        <div className="relative mb-2">
          <Input
            autoFocus
            value={tail}
            onChange={e => setTail(e.target.value.toUpperCase())}
            placeholder="N12345"
            className="h-14 text-2xl font-mono text-center tracking-widest uppercase pr-12 border-2 focus:border-brand-500"
            maxLength={8}
            spellCheck={false}
          />
          {/* Status icon */}
          <span className="absolute right-4 top-1/2 -translate-y-1/2">
            {lookupState === 'loading' && (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            )}
            {lookupState === 'found' && (
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            )}
            {(lookupState === 'not_found' || lookupState === 'error') && (
              <AlertCircle className="h-5 w-5 text-amber-500" />
            )}
            {lookupState === 'idle' && tail.length >= 3 && (
              <Search className="h-5 w-5 text-muted-foreground/40" />
            )}
          </span>
        </div>

        {/* Status line */}
        {lookupState === 'loading' && (
          <p className="text-xs text-center text-muted-foreground animate-pulse mb-6">
            Looking up in FAA Aircraft Registry…
          </p>
        )}
        {(lookupState === 'not_found' || lookupState === 'error') && (
          <p className="text-xs text-center text-amber-600 mb-6">{errorMsg}</p>
        )}
        {lookupState === 'idle' && tail.length === 0 && (
          <p className="text-xs text-center text-muted-foreground mb-6">
            N-numbers are 1–6 alphanumeric characters after the &ldquo;N&rdquo;
          </p>
        )}

        {/* Found: preview card */}
        {lookupState === 'found' && faaData && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-5 mb-6">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-500 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide mb-2">
                  Found in FAA Registry
                </p>
                <div className="space-y-1.5">
                  <DataRow label="Aircraft" value={`${faaData.make} ${faaData.model}`} />
                  {faaData.year && <DataRow label="Year" value={String(faaData.year)} />}
                  {faaData.serial_number && (
                    <DataRow label="Serial" value={faaData.serial_number} mono />
                  )}
                  {(faaData.engine_make || faaData.engine_model) && (
                    <DataRow
                      label="Engine"
                      value={[faaData.engine_make, faaData.engine_model].filter(Boolean).join(' ')}
                    />
                  )}
                  {faaData.registrant_name && (
                    <DataRow label="Registered to" value={faaData.registrant_name} />
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Add button */}
        {lookupState === 'found' && faaData && (
          <>
            {saveError && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2 mb-3 text-center">
                {saveError}
              </p>
            )}
            <Button
              className="w-full h-12 text-base"
              onClick={handleAdd}
              disabled={saving}
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding to your fleet…
                </>
              ) : (
                <>
                  <Plane className="mr-2 h-4 w-4" />
                  Add {faaData.tail_number} to Fleet
                </>
              )}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Tiny helper ──────────────────────────────────────────────────────────────

function DataRow({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-xs text-muted-foreground w-24 flex-shrink-0">{label}</span>
      <span className={`text-sm font-medium text-foreground ${mono ? 'font-mono' : ''}`}>
        {value}
      </span>
    </div>
  )
}
