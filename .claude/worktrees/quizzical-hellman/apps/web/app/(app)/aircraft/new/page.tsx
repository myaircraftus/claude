'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Link from 'next/link'
import { Loader2, Plane, Search, CheckCircle2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Topbar } from '@/components/shared/topbar'
import { createBrowserSupabase } from '@/lib/supabase/browser'

// ─── Schema ───────────────────────────────────────────────────────────────────

const newAircraftSchema = z.object({
  tail_number: z.string().min(2, 'Tail number is required').max(10),
  make: z.string().min(1, 'Make is required').max(80),
  model: z.string().min(1, 'Model is required').max(80),
  year: z.string().optional(),
  serial_number: z.string().max(50).optional(),
  engine_make: z.string().max(80).optional(),
  engine_model: z.string().max(80).optional(),
  base_airport: z.string().max(10).optional(),
  notes: z.string().max(2000).optional(),
})

type NewAircraftValues = z.infer<typeof newAircraftSchema>

type FAAStatus = 'idle' | 'loading' | 'found' | 'not_found' | 'error'

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
  registrant_name?: string
  city?: string
  state?: string
  status?: string
  cert_issue_date?: string
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NewAircraftPage() {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)
  const [orgId, setOrgId] = useState<string | null>(null)
  const [faaStatus, setFAAStatus] = useState<FAAStatus>('idle')
  const [faaMessage, setFAAMessage] = useState<string>('')
  const [faaData, setFAAData] = useState<FAAData | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<NewAircraftValues>({
    resolver: zodResolver(newAircraftSchema),
    defaultValues: {
      tail_number: '',
      make: '',
      model: '',
      year: '',
      serial_number: '',
      engine_make: '',
      engine_model: '',
      base_airport: '',
      notes: '',
    },
  })

  // Lookup FAA registry and auto-fill fields
  const lookupFAA = useCallback(async (tail: string) => {
    const trimmed = tail.trim().toUpperCase()
    if (trimmed.length < 2) {
      setFAAStatus('idle')
      return
    }

    setFAAStatus('loading')
    setFAAMessage('Looking up in FAA Registry…')

    try {
      const res = await fetch(`/api/aircraft/faa-lookup?tail=${encodeURIComponent(trimmed)}`)
      const data = await res.json()

      if (!res.ok || data.error) {
        setFAAData(null)
        if (res.status === 404) {
          setFAAStatus('not_found')
          setFAAMessage('Not found in FAA Registry — enter details manually')
        } else {
          setFAAStatus('error')
          setFAAMessage(data.error || 'FAA Registry unavailable — enter details manually')
        }
        return
      }

      // Auto-fill all returned fields
      if (data.make) setValue('make', data.make)
      if (data.model) setValue('model', data.model)
      if (data.year) setValue('year', String(data.year))
      if (data.serial_number) setValue('serial_number', data.serial_number)
      if (data.engine_make) setValue('engine_make', data.engine_make)
      if (data.engine_model) setValue('engine_model', data.engine_model)

      setFAAData(data)
      setFAAStatus('found')
      setFAAMessage('')
    } catch {
      setFAAStatus('error')
      setFAAMessage('FAA Registry unavailable — enter details manually')
    }
  }, [setValue])

  // Debounced tail number change handler
  function handleTailChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value.toUpperCase()
    e.target.value = val
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      lookupFAA(val)
    }, 700)
  }

  // Fetch the user's org on first render — we need it for the POST body
  async function resolveOrgId(): Promise<string | null> {
    if (orgId) return orgId
    const supabase = createBrowserSupabase()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { data } = await supabase
      .from('organization_memberships')
      .select('organization_id')
      .eq('user_id', user.id)
      .not('accepted_at', 'is', null)
      .single()
    if (data?.organization_id) {
      setOrgId(data.organization_id)
      return data.organization_id
    }
    return null
  }

  async function onSubmit(values: NewAircraftValues) {
    setServerError(null)

    const resolvedOrgId = await resolveOrgId()
    if (!resolvedOrgId) {
      setServerError('Unable to determine your organization. Please refresh and try again.')
      return
    }

    const yearParsed = values.year ? parseInt(values.year, 10) : undefined

    try {
      const res = await fetch('/api/aircraft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_id: resolvedOrgId,
          tail_number: values.tail_number.toUpperCase(),
          make: values.make,
          model: values.model,
          year: yearParsed || undefined,
          serial_number: values.serial_number || undefined,
          engine_make: values.engine_make || undefined,
          engine_model: values.engine_model || undefined,
          base_airport: values.base_airport?.toUpperCase() || undefined,
          notes: values.notes || undefined,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setServerError(data.error ?? 'Failed to create aircraft')
        return
      }

      router.push(`/aircraft/${data.id}`)
    } catch {
      setServerError('Network error. Please try again.')
    }
  }

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

      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto">
          {/* Page header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center">
              <Plane className="h-5 w-5 text-brand-500" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Add Aircraft</h1>
              <p className="text-sm text-muted-foreground">
                Enter a tail number — we&apos;ll pull everything from the FAA Registry automatically.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Basic info */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Basic Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Tail number with FAA lookup */}
                <div className="space-y-1.5">
                  <Label htmlFor="tail_number">
                    Tail number <span className="text-destructive">*</span>
                  </Label>
                  <div className="flex items-center gap-2 max-w-xs">
                    <div className="relative flex-1">
                      <Input
                        id="tail_number"
                        placeholder="N12345"
                        className="font-mono uppercase pr-8"
                        {...register('tail_number')}
                        onChange={(e) => {
                          register('tail_number').onChange(e)
                          handleTailChange(e)
                        }}
                      />
                      {faaStatus === 'loading' && (
                        <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                      )}
                      {faaStatus === 'found' && (
                        <CheckCircle2 className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
                      )}
                      {(faaStatus === 'not_found' || faaStatus === 'error') && (
                        <AlertCircle className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-amber-500" />
                      )}
                    </div>
                  </div>
                  {errors.tail_number && (
                    <p className="text-xs text-destructive">{errors.tail_number.message}</p>
                  )}
                  {faaStatus === 'loading' && (
                    <p className="text-xs text-muted-foreground animate-pulse">
                      Looking up FAA Registry…
                    </p>
                  )}
                  {(faaStatus === 'not_found' || faaStatus === 'error') && faaMessage && (
                    <p className="text-xs text-amber-600 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3 shrink-0" />
                      {faaMessage}
                    </p>
                  )}
                </div>

                {/* FAA Registry result card */}
                {faaStatus === 'found' && faaData && (
                  <div className="rounded-lg border border-green-200 bg-green-50 p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                      <span className="text-sm font-semibold text-green-800">
                        Found in FAA Registry — fields auto-filled below
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                      {faaData.make && (
                        <><span className="text-muted-foreground">Make</span><span className="font-medium">{faaData.make}</span></>
                      )}
                      {faaData.model && (
                        <><span className="text-muted-foreground">Model</span><span className="font-medium">{faaData.model}</span></>
                      )}
                      {faaData.year && (
                        <><span className="text-muted-foreground">Year</span><span className="font-medium">{faaData.year}</span></>
                      )}
                      {faaData.serial_number && (
                        <><span className="text-muted-foreground">Serial</span><span className="font-mono font-medium">{faaData.serial_number}</span></>
                      )}
                      {faaData.aircraft_type && (
                        <><span className="text-muted-foreground">Type</span><span className="font-medium">{faaData.aircraft_type}</span></>
                      )}
                      {faaData.engine_type && (
                        <><span className="text-muted-foreground">Engine Type</span><span className="font-medium">{faaData.engine_type}</span></>
                      )}
                      {faaData.engine_make && (
                        <><span className="text-muted-foreground">Engine Make</span><span className="font-medium">{faaData.engine_make}</span></>
                      )}
                      {faaData.engine_model && (
                        <><span className="text-muted-foreground">Engine Model</span><span className="font-medium">{faaData.engine_model}</span></>
                      )}
                      {faaData.status && (
                        <><span className="text-muted-foreground">Reg. Status</span><span className="font-medium">{faaData.status}</span></>
                      )}
                      {faaData.cert_issue_date && (
                        <><span className="text-muted-foreground">Cert. Issued</span><span className="font-medium">{faaData.cert_issue_date}</span></>
                      )}
                      {faaData.registrant_name && (
                        <><span className="text-muted-foreground">Registrant</span><span className="font-medium">{faaData.registrant_name}</span></>
                      )}
                      {(faaData.city || faaData.state) && (
                        <><span className="text-muted-foreground">Location</span><span className="font-medium">{[faaData.city, faaData.state].filter(Boolean).join(', ')}</span></>
                      )}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="make">
                      Make <span className="text-destructive">*</span>
                    </Label>
                    <Input id="make" placeholder="Cessna" {...register('make')} />
                    {errors.make && (
                      <p className="text-xs text-destructive">{errors.make.message}</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="model">
                      Model <span className="text-destructive">*</span>
                    </Label>
                    <Input id="model" placeholder="172S Skyhawk" {...register('model')} />
                    {errors.model && (
                      <p className="text-xs text-destructive">{errors.model.message}</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="year">Year</Label>
                    <Input
                      id="year"
                      type="number"
                      placeholder="2018"
                      min={1900}
                      max={new Date().getFullYear() + 2}
                      {...register('year')}
                    />
                    {errors.year && (
                      <p className="text-xs text-destructive">{errors.year.message}</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="serial_number">Serial number</Label>
                    <Input
                      id="serial_number"
                      placeholder="17281234"
                      className="font-mono"
                      {...register('serial_number')}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="base_airport">Base airport (ICAO/IATA)</Label>
                  <Input
                    id="base_airport"
                    placeholder="KPAO"
                    className="uppercase max-w-xs font-mono"
                    {...register('base_airport')}
                    onChange={e => {
                      e.target.value = e.target.value.toUpperCase()
                    }}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Engine */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Engine</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="engine_make">Engine make</Label>
                    <Input id="engine_make" placeholder="Lycoming" {...register('engine_make')} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="engine_model">Engine model</Label>
                    <Input
                      id="engine_model"
                      placeholder="IO-360-L2A"
                      {...register('engine_model')}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Notes */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  id="notes"
                  placeholder="Any additional notes about this aircraft…"
                  rows={4}
                  {...register('notes')}
                />
              </CardContent>
            </Card>

            {/* Error */}
            {serverError && (
              <p className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                {serverError}
              </p>
            )}

            <Separator />

            {/* Actions */}
            <div className="flex items-center justify-between">
              <Button type="button" variant="outline" asChild>
                <Link href="/aircraft">Cancel</Link>
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating…
                  </>
                ) : (
                  <>
                    <Plane className="mr-2 h-4 w-4" />
                    Add Aircraft
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>
      </main>
    </div>
  )
}
