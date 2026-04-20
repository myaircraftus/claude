'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link, { useTenantRouter } from '@/components/shared/tenant-link'
import { useParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { AlertCircle, CheckCircle2, Loader2, Plane, Search } from 'lucide-react'
import { Topbar } from '@/components/shared/topbar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import {
  AIRCRAFT_OPERATION_TYPES,
  buildOperationProfile,
  OPERATION_TYPE_OPTIONS,
} from '@/lib/aircraft/operations'

const aircraftSchema = z.object({
  tail_number: z.string().min(2, 'Tail number is required').max(10),
  make: z.string().min(1, 'Make is required').max(80),
  model: z.string().min(1, 'Model is required').max(80),
  year: z.string().optional(),
  serial_number: z.string().max(50).optional(),
  engine_make: z.string().max(80).optional(),
  engine_model: z.string().max(80).optional(),
  base_airport: z.string().max(10).optional(),
  operator_name: z.string().max(120).optional(),
  operation_types: z.array(z.enum(AIRCRAFT_OPERATION_TYPES)).max(4).default([]),
  notes: z.string().max(2000).optional(),
})

type AircraftFormValues = z.infer<typeof aircraftSchema>
type FAAStatus = 'idle' | 'loading' | 'found' | 'not_found' | 'error'

export default function EditAircraftPage() {
  const router = useTenantRouter()
  const params = useParams<{ id: string }>()
  const [loadingAircraft, setLoadingAircraft] = useState(true)
  const [serverError, setServerError] = useState<string | null>(null)
  const [faaStatus, setFAAStatus] = useState<FAAStatus>('idle')
  const [faaMessage, setFAAMessage] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<AircraftFormValues>({
    resolver: zodResolver(aircraftSchema),
    defaultValues: {
      tail_number: '',
      make: '',
      model: '',
      year: '',
      serial_number: '',
      engine_make: '',
      engine_model: '',
      base_airport: '',
      operator_name: '',
      operation_types: [],
      notes: '',
    },
  })

  useEffect(() => {
    let cancelled = false

    async function loadAircraft() {
      setLoadingAircraft(true)
      setServerError(null)
      try {
        const res = await fetch(`/api/aircraft/${params.id}`)
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Failed to load aircraft')
        if (cancelled) return
        reset({
          tail_number: data.tail_number ?? '',
          make: data.make ?? '',
          model: data.model ?? '',
          year: data.year ? String(data.year) : '',
          serial_number: data.serial_number ?? '',
          engine_make: data.engine_make ?? '',
          engine_model: data.engine_model ?? '',
          base_airport: data.base_airport ?? '',
          operator_name: data.operator_name ?? '',
          operation_types: data.operation_types ?? [],
          notes: data.notes ?? '',
        })
      } catch (error: any) {
        if (!cancelled) setServerError(error.message ?? 'Failed to load aircraft')
      } finally {
        if (!cancelled) setLoadingAircraft(false)
      }
    }

    loadAircraft()
    return () => {
      cancelled = true
    }
  }, [params.id, reset])

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
        if (res.status === 404) {
          setFAAStatus('not_found')
          setFAAMessage('Not found in FAA Registry — keep editing manually')
        } else {
          setFAAStatus('error')
          setFAAMessage(data.error || 'FAA Registry unavailable — keep editing manually')
        }
        return
      }

      if (data.make) setValue('make', data.make)
      if (data.model) setValue('model', data.model)
      if (data.year) setValue('year', String(data.year))
      if (data.serial_number) setValue('serial_number', data.serial_number)
      if (data.engine_make) setValue('engine_make', data.engine_make)
      if (data.engine_model) setValue('engine_model', data.engine_model)

      setFAAStatus('found')
      const fields = [data.make, data.model, data.year].filter(Boolean).join(' · ')
      setFAAMessage(`Found: ${fields}${data.registrant_name ? ` — ${data.registrant_name}` : ''}`)
    } catch {
      setFAAStatus('error')
      setFAAMessage('FAA Registry unavailable — keep editing manually')
    }
  }, [setValue])

  function handleTailChange(event: React.ChangeEvent<HTMLInputElement>) {
    const value = event.target.value.toUpperCase()
    event.target.value = value
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => lookupFAA(value), 700)
  }

  function toggleOperationType(value: (typeof AIRCRAFT_OPERATION_TYPES)[number], checked: boolean) {
    const current = watch('operation_types') ?? []
    const next = checked
      ? Array.from(new Set([...current, value])).slice(0, 4)
      : current.filter(entry => entry !== value)
    setValue('operation_types', next, { shouldDirty: true, shouldValidate: true })
  }

  async function onSubmit(values: AircraftFormValues) {
    setServerError(null)

    try {
      const res = await fetch(`/api/aircraft/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tail_number: values.tail_number.toUpperCase(),
          make: values.make,
          model: values.model,
          year: values.year ? parseInt(values.year, 10) : null,
          serial_number: values.serial_number || null,
          engine_make: values.engine_make || null,
          engine_model: values.engine_model || null,
          base_airport: values.base_airport?.toUpperCase() || null,
          operator_name: values.operator_name || null,
          operation_types: values.operation_types,
          notes: values.notes || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to update aircraft')
      router.push(`/aircraft/${params.id}`)
    } catch (error: any) {
      setServerError(error.message ?? 'Failed to update aircraft')
    }
  }

  const selectedOperationTypes = watch('operation_types')
  const operationProfile = buildOperationProfile(selectedOperationTypes)
  const topbarProfile = {
    id: '', email: '', full_name: undefined, avatar_url: undefined, created_at: '', updated_at: '',
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={topbarProfile as any}
        breadcrumbs={[
          { label: 'Aircraft', href: '/aircraft' },
          { label: 'Edit Aircraft' },
        ]}
      />

      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center">
              <Plane className="h-5 w-5 text-brand-500" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Edit Aircraft</h1>
              <p className="text-sm text-muted-foreground">
                Update aircraft details, operator info, and operation profile.
              </p>
            </div>
          </div>

          {loadingAircraft ? (
            <Card>
              <CardContent className="py-16 flex items-center justify-center text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                Loading aircraft…
              </CardContent>
            </Card>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Basic Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="tail_number">Tail number</Label>
                    <div className="relative max-w-xs">
                      <Input
                        id="tail_number"
                        className="font-mono uppercase pr-8"
                        {...register('tail_number')}
                        onChange={(event) => {
                          register('tail_number').onChange(event)
                          handleTailChange(event)
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
                    {faaMessage && <p className="text-xs text-muted-foreground">{faaMessage}</p>}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="make">Make</Label>
                      <Input id="make" {...register('make')} />
                      {errors.make && <p className="text-xs text-destructive">{errors.make.message}</p>}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="model">Model</Label>
                      <Input id="model" {...register('model')} />
                      {errors.model && <p className="text-xs text-destructive">{errors.model.message}</p>}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="year">Year</Label>
                      <Input id="year" type="number" {...register('year')} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="serial_number">Serial number</Label>
                      <Input id="serial_number" className="font-mono" {...register('serial_number')} />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="base_airport">Base airport</Label>
                    <Input id="base_airport" className="uppercase max-w-xs font-mono" {...register('base_airport')} />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="operator_name">Operator / management company</Label>
                    <Input id="operator_name" {...register('operator_name')} />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Operation Profile</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3">
                    {OPERATION_TYPE_OPTIONS.map(option => {
                      const checked = selectedOperationTypes.includes(option.value)
                      return (
                        <label
                          key={option.value}
                          className={`flex items-start gap-3 rounded-xl border p-3 transition-colors ${checked ? 'border-brand-300 bg-brand-50/60' : 'border-border hover:bg-accent/50'}`}
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(value) => toggleOperationType(option.value, value === true)}
                          />
                          <div className="space-y-1">
                            <div className="text-sm font-medium text-foreground">{option.label}</div>
                            <p className="text-xs text-muted-foreground">{option.description}</p>
                          </div>
                        </label>
                      )
                    })}
                  </div>

                  {operationProfile.types.length > 0 && (
                    <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Suggested role presets
                        </p>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {operationProfile.rolePresets.join(' · ')}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Reminder focus
                        </p>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {operationProfile.reminderFocus.join(' · ')}
                        </p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Engine</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="engine_make">Engine make</Label>
                    <Input id="engine_make" {...register('engine_make')} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="engine_model">Engine model</Label>
                    <Input id="engine_model" {...register('engine_model')} />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Notes</CardTitle>
                </CardHeader>
                <CardContent>
                  <Textarea rows={4} {...register('notes')} />
                </CardContent>
              </Card>

              {serverError && (
                <p className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                  {serverError}
                </p>
              )}

              <Separator />

              <div className="flex items-center justify-between">
                <Button type="button" variant="outline" asChild>
                  <Link href={`/aircraft/${params.id}`}>Cancel</Link>
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    <>
                      <Plane className="mr-2 h-4 w-4" />
                      Save Aircraft
                    </>
                  )}
                </Button>
              </div>
            </form>
          )}
        </div>
      </main>
    </div>
  )
}
