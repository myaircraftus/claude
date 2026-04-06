'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2, Plane, CheckCircle2, AlertCircle, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Topbar } from '@/components/shared/topbar'
import { createBrowserSupabase } from '@/lib/supabase/browser'

// ─── Types ─────────────────────────────────────────────────────────────────────

type FlowState = 'idle' | 'looking' | 'found' | 'not_found' | 'error'

interface FAAData {
  tail_number: string
  make: string
  model: string
  year?: number
  serial_number?: string
  engine_make?: string
  engine_model?: string
  aircraft_type?: string
  engine_type?: string
  reg_status?: string
  cert_issued?: string
  registrant_name?: string
  registrant_location?: string
}

// ─── Info row component ────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-green-600/70">{label}</span>
      <span className="text-sm font-medium text-green-900">{value}</span>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NewAircraftPage() {
  const router = useRouter()
  const [tail, setTail] = useState('')
  const [flowState, setFlowState] = useState<FlowState>('idle')
  const [faaData, setFaaData] = useState<FAAData | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── FAA lookup ───────────────────────────────────────────────────────────────

  const lookupFAA = useCallback(async (value: string) => {
    const trimmed = value.trim().toUpperCase()
    if (trimmed.length < 2) {
      setFlowState('idle')
      setFaaData(null)
      return
    }

    setFlowState('looking')
    setFaaData(null)
    setErrorMsg('')

    try {
      const res = await fetch(`/api/aircraft/faa-lookup?tail=${encodeURIComponent(trimmed)}`)
      const data = await res.json()

      if (!res.ok || data.error) {
        setFlowState('not_found')
        return
      }

      setFaaData(data)
      setFlowState('found')
    } catch {
      setFlowState('error')
      setErrorMsg('FAA Registry unavailable — check your connection and try again.')
    }
  }, [])

  // ── Input handler ────────────────────────────────────────────────────────────

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value.toUpperCase()
    setTail(val)

    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (val.length >= 2) {
      debounceRef.current = setTimeout(() => lookupFAA(val), 700)
      setFlowState('idle')
    } else {
      setFlowState('idle')
      setFaaData(null)
    }
  }

  // ── Add to fleet ─────────────────────────────────────────────────────────────

  async function addToFleet() {
    if (!faaData) return
    setIsCreating(true)
    setErrorMsg('')

    try {
      const supabase = createBrowserSupabase()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        setErrorMsg('Not authenticated. Please refresh and try again.')
        setIsCreating(false)
        return
      }

      const { data: membership } = await supabase
        .from('organization_memberships')
        .select('organization_id')
        .eq('user_id', user.id)
        .not('accepted_at', 'is', null)
        .single()

      if (!membership?.organization_id) {
        setErrorMsg('No organization found. Please refresh and try again.')
        setIsCreating(false)
        return
      }

      const res = await fetch('/api/aircraft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_id: membership.organization_id,
          tail_number: faaData.tail_number,
          make: faaData.make || 'Unknown',
          model: faaData.model || 'Unknown',
          year: faaData.year,
          serial_number: faaData.serial_number,
          engine_make: faaData.engine_make,
          engine_model: faaData.engine_model,
        }),
      })

      const result = await res.json()

      if (!res.ok) {
        setErrorMsg(result.error || 'Failed to create aircraft')
        setIsCreating(false)
        return
      }

      router.push(`/aircraft/${result.id}`)
    } catch {
      setErrorMsg('Network error. Please try again.')
      setIsCreating(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  const topbarProfile = {
    id: '', email: '', full_name: undefined, avatar_url: undefined, created_at: '', updated_at: '',
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={topbarProfile as any}
        breadcrumbs={[
          { label: 'Aircraft', href: '/aircraft' },
          { label: 'Add Aircraft' },
        ]}
      />

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-6 py-12">

          {/* Header */}
          <div className="flex items-center gap-3 mb-10">
            <div className="w-11 h-11 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
              <Plane className="h-5 w-5 text-brand-500" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground leading-tight">Add Aircraft</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Enter the FAA tail number — registry data fills automatically.
              </p>
            </div>
          </div>

          {/* ── N-number input ── */}
          <div className="relative">
            <Input
              value={tail}
              onChange={handleInput}
              placeholder="N12345"
              autoFocus
              autoComplete="off"
              spellCheck={false}
              className="h-16 text-2xl font-mono uppercase tracking-[0.2em] text-center pr-12 rounded-xl border-2 focus-visible:ring-2"
              style={{ letterSpacing: '0.2em' }}
            />

            {/* Status icon inside input */}
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
              {flowState === 'looking' && (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              )}
              {flowState === 'found' && (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              )}
              {(flowState === 'not_found' || flowState === 'error') && (
                <AlertCircle className="h-5 w-5 text-amber-500" />
              )}
            </div>
          </div>

          {/* ── Looking state ── */}
          {flowState === 'looking' && (
            <p className="mt-3 text-sm text-muted-foreground animate-pulse text-center">
              Looking up in FAA Aircraft Registry…
            </p>
          )}

          {/* ── Not found ── */}
          {flowState === 'not_found' && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
              <span className="font-semibold">Not found in the FAA Registry.</span>{' '}
              Check the tail number and try again, or verify it at{' '}
              <a
                href={`https://registry.faa.gov/aircraftinquiry/Search/NNumberInquiry`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                FAA registry
              </a>
              .
            </div>
          )}

          {/* ── Error ── */}
          {flowState === 'error' && errorMsg && (
            <div className="mt-4 rounded-xl border border-destructive/20 bg-destructive/5 px-5 py-4 text-sm text-destructive">
              {errorMsg}
            </div>
          )}

          {/* ── Found — FAA info card ── */}
          {flowState === 'found' && faaData && (
            <div className="mt-5 rounded-xl border border-green-200 bg-green-50 overflow-hidden">
              {/* Card header */}
              <div className="px-5 py-4 border-b border-green-200 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-green-600/70 mb-0.5">
                    FAA Registry · Live
                  </p>
                  <p className="text-lg font-bold text-green-900 font-mono tracking-wide">
                    {faaData.tail_number}
                  </p>
                </div>
                {faaData.reg_status && (
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-green-200 text-green-800 uppercase tracking-wide">
                    {faaData.reg_status}
                  </span>
                )}
              </div>

              {/* Data grid */}
              <div className="px-5 py-4 grid grid-cols-2 gap-x-6 gap-y-4">
                <InfoRow label="Make" value={faaData.make} />
                <InfoRow label="Model" value={faaData.model} />
                {faaData.year && <InfoRow label="Year" value={String(faaData.year)} />}
                <InfoRow label="Serial Number" value={faaData.serial_number} />
                <InfoRow label="Aircraft Type" value={faaData.aircraft_type} />
                <InfoRow label="Engine Type" value={faaData.engine_type} />
                <InfoRow label="Engine Make" value={faaData.engine_make} />
                <InfoRow label="Engine Model" value={faaData.engine_model} />
                {faaData.cert_issued && <InfoRow label="Cert. Issued" value={faaData.cert_issued} />}
                {faaData.registrant_name && (
                  <div className="col-span-2 pt-1 border-t border-green-200 mt-1">
                    <InfoRow label="Registered Owner" value={faaData.registrant_name} />
                    {faaData.registrant_location && (
                      <InfoRow label="Location" value={faaData.registrant_location} />
                    )}
                  </div>
                )}
              </div>

              {/* Action */}
              <div className="px-5 pb-5">
                {errorMsg && (
                  <p className="mb-3 text-sm text-destructive">{errorMsg}</p>
                )}
                <Button
                  onClick={addToFleet}
                  disabled={isCreating}
                  className="w-full h-11 text-base font-semibold"
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Adding to fleet…
                    </>
                  ) : (
                    <>
                      <Plane className="mr-2 h-4 w-4" />
                      Add to Fleet
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Back link */}
          <div className="mt-8 text-center">
            <Link
              href="/aircraft"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Aircraft
            </Link>
          </div>

        </div>
      </main>
    </div>
  )
}
