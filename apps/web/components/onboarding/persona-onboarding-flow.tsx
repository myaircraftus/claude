'use client'

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  ArrowRight,
  Building2,
  Check,
  FileText,
  type LucideIcon,
  Loader2,
  Plane,
  Search,
  Sparkles,
  Wrench,
} from 'lucide-react'
import { useTenantRouter } from '@/components/shared/tenant-link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { OnboardingPersona } from '@/lib/auth/onboarding'
import { withTenantPrefix } from '@/lib/auth/tenant-routing'
import {
  OPERATION_TYPE_OPTIONS,
  type AircraftOperationType,
} from '@/lib/aircraft/operations'
import { cn, slugify } from '@/lib/utils'

const orgSchema = z.object({
  name: z.string().min(2, 'Organization name must be at least 2 characters').max(80),
  slug: z
    .string()
    .min(2, 'Slug must be at least 2 characters')
    .max(40)
    .regex(/^[a-z0-9-]+$/, 'Slug may only contain lowercase letters, numbers and hyphens'),
})

const aircraftSchema = z.object({
  tail_number: z.string().min(2, 'Tail number required').max(10),
  make: z.string().min(1, 'Make is required').max(80),
  model: z.string().min(1, 'Model is required').max(80),
  year: z.string().optional(),
  serial_number: z.string().max(50).optional(),
  engine_make: z.string().max(80).optional(),
  engine_model: z.string().max(80).optional(),
  base_airport: z.string().max(10).optional(),
})

type OrgFormValues = z.infer<typeof orgSchema>
type AircraftFormValues = z.infer<typeof aircraftSchema>
type FAAStatus = 'idle' | 'loading' | 'found' | 'not_found' | 'error'

interface AddedAircraft {
  id: string
  tailNumber: string
  make: string
  model: string
  year?: number
  serialNumber?: string
  engineMake?: string
  engineModel?: string
  baseAirport?: string
  registrantName?: string
  source?: string
  operationType?: AircraftOperationType
}

interface FAAResult {
  tail_number?: string
  make?: string
  model?: string
  year?: number
  serial_number?: string
  engine_make?: string
  engine_model?: string
  base_airport?: string
  registrant_name?: string
  source?: string
  error?: string
}

const OWNER_STEPS = [
  { number: 1, label: 'Organization', icon: Building2 },
  { number: 2, label: 'Aircraft', icon: Plane },
  { number: 3, label: 'Operations', icon: Sparkles },
  { number: 4, label: 'Documents', icon: FileText },
] as const

const MECHANIC_STEPS = [
  { number: 1, label: 'Organization', icon: Building2 },
  { number: 2, label: 'Finish', icon: Wrench },
] as const

function StepIndicator({
  current,
  steps,
}: {
  current: number
  steps: ReadonlyArray<{ number: number; label: string; icon: LucideIcon }>
}) {
  return (
    <div className="mb-8 flex items-center justify-center gap-2">
      {steps.map((step, idx) => {
        const done = current > step.number
        const active = current === step.number
        const Icon = step.icon
        return (
          <div key={step.number} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <div
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all',
                  done
                    ? 'border-emerald-500 bg-emerald-500 text-white'
                    : active
                      ? 'border-brand-500 bg-white text-brand-600'
                      : 'border-white/30 bg-white/20 text-white/50'
                )}
              >
                {done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
              </div>
              <span
                className={cn(
                  'text-xs font-medium',
                  active ? 'text-white' : done ? 'text-emerald-300' : 'text-white/50'
                )}
              >
                {step.label}
              </span>
            </div>
            {idx < steps.length - 1 && (
              <div
                className={cn(
                  'mx-2 mb-5 h-0.5 w-12 transition-all',
                  done ? 'bg-emerald-400' : 'bg-white/20'
                )}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

function StepOrganization({
  persona,
  onSuccess,
}: {
  persona: OnboardingPersona
  onSuccess: (organization: { id: string; slug: string; name: string }) => void
}) {
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<OrgFormValues>({
    resolver: zodResolver(orgSchema),
    defaultValues: { name: '', slug: '' },
  })

  function handleNameChange(e: ChangeEvent<HTMLInputElement>) {
    const value = e.target.value
    setValue('name', value, { shouldDirty: true, shouldValidate: true })
    setValue('slug', slugify(value), { shouldDirty: true, shouldValidate: true })
  }

  async function onSubmit(values: OrgFormValues) {
    setServerError(null)
    try {
      const res = await fetch('/api/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      const data = await res.json()
      if (!res.ok) {
        setServerError(data.error ?? 'Failed to create organization')
        return
      }
      onSuccess({ id: data.id, slug: data.slug, name: values.name })
    } catch {
      setServerError('Network error. Please try again.')
    }
  }

  const title = persona === 'mechanic' ? 'Create your shop organization' : 'Create your organization'
  const description =
    persona === 'mechanic'
      ? 'Set up the maintenance organization you will manage.'
      : 'Set up the owner organization for your aircraft records.'

  return (
    <Card className="w-full max-w-lg shadow-panel">
      <CardHeader className="pb-4">
        <div className="mb-2 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-100">
            <Building2 className="h-5 w-5 text-brand-600" />
          </div>
          <div>
            <CardTitle className="text-xl">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="org-name">Organization name</Label>
            <Input
              id="org-name"
              placeholder={persona === 'mechanic' ? 'Precision Air Maintenance' : 'Acme Aviation LLC'}
              {...register('name')}
              onChange={handleNameChange}
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="org-slug">URL slug</Label>
            <div className="flex items-center gap-2">
              <span className="whitespace-nowrap text-sm text-muted-foreground">myaircraft.us/</span>
              <Input
                id="org-slug"
                placeholder="acme-aviation"
                {...register('slug')}
                className="font-mono"
              />
            </div>
            {errors.slug && <p className="text-xs text-destructive">{errors.slug.message}</p>}
          </div>

          {serverError && (
            <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {serverError}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating…
              </>
            ) : (
              <>
                Continue
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function StepAircraft({
  organizationId,
  aircraft,
  onAircraftAdded,
  onContinue,
}: {
  organizationId: string
  aircraft: AddedAircraft[]
  onAircraftAdded: (aircraft: AddedAircraft) => void
  onContinue: () => void
}) {
  const [serverError, setServerError] = useState<string | null>(null)
  const [lookupStatus, setLookupStatus] = useState<FAAStatus>('idle')
  const [lookupMessage, setLookupMessage] = useState<string>('')
  const [lastLookup, setLastLookup] = useState<FAAResult | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    getValues,
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
    },
  })

  async function lookupFAA(tail: string) {
    const trimmed = tail.trim().toUpperCase()
    if (trimmed.length < 2) {
      setLookupStatus('idle')
      setLookupMessage('')
      setLastLookup(null)
      return
    }

    setLookupStatus('loading')
    setLookupMessage('Looking up in FAA Registry…')

    try {
      const res = await fetch(`/api/aircraft/faa-lookup?tail=${encodeURIComponent(trimmed)}`)
      const data = (await res.json()) as FAAResult

      if (!res.ok || data.error) {
        if (res.status === 404) {
          setLookupStatus('not_found')
          setLookupMessage('Not found in FAA Registry. Enter details manually.')
        } else {
          setLookupStatus('error')
          setLookupMessage(data.error || 'FAA Registry unavailable. Enter details manually.')
        }
        setLastLookup(null)
        return
      }

      setValue('tail_number', data.tail_number ?? trimmed, { shouldValidate: true })
      setValue('make', data.make ?? '', { shouldValidate: true })
      setValue('model', data.model ?? '', { shouldValidate: true })
      setValue('year', data.year ? String(data.year) : '', { shouldValidate: false })
      setValue('serial_number', data.serial_number ?? '', { shouldValidate: false })
      setValue('engine_make', data.engine_make ?? '', { shouldValidate: false })
      setValue('engine_model', data.engine_model ?? '', { shouldValidate: false })
      setValue('base_airport', data.base_airport ?? '', { shouldValidate: false })

      setLookupStatus('found')
      setLastLookup(data)

      const fields = [data.make, data.model, data.year].filter(Boolean).join(' · ')
      setLookupMessage(
        `FAA match found${fields ? `: ${fields}` : ''}${data.registrant_name ? ` — ${data.registrant_name}` : ''}`
      )
    } catch {
      setLookupStatus('error')
      setLookupMessage('FAA Registry unavailable. Enter details manually.')
      setLastLookup(null)
    }
  }

  function handleTailChange(event: ChangeEvent<HTMLInputElement>) {
    const value = event.target.value.toUpperCase()
    event.target.value = value
    setValue('tail_number', value, { shouldDirty: true, shouldValidate: true })

    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    debounceRef.current = setTimeout(() => {
      void lookupFAA(value)
    }, 650)
  }

  async function onSubmit(values: AircraftFormValues) {
    setServerError(null)
    try {
      const yearParsed = values.year ? parseInt(values.year, 10) : undefined
      const res = await fetch('/api/aircraft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_id: organizationId,
          tail_number: values.tail_number.toUpperCase(),
          make: values.make,
          model: values.model,
          year: yearParsed || undefined,
          serial_number: values.serial_number || undefined,
          engine_make: values.engine_make || undefined,
          engine_model: values.engine_model || undefined,
          base_airport: values.base_airport?.toUpperCase() || undefined,
          operator_name: lastLookup?.registrant_name || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setServerError(data.error ?? 'Failed to add aircraft')
        return
      }

      onAircraftAdded({
        id: data.id,
        tailNumber: values.tail_number.toUpperCase(),
        make: values.make,
        model: values.model,
        year: yearParsed,
        serialNumber: values.serial_number || undefined,
        engineMake: values.engine_make || undefined,
        engineModel: values.engine_model || undefined,
        baseAirport: values.base_airport?.toUpperCase() || undefined,
        registrantName: lastLookup?.registrant_name,
        source: lastLookup?.source,
      })

      reset({
        tail_number: '',
        make: '',
        model: '',
        year: '',
        serial_number: '',
        engine_make: '',
        engine_model: '',
        base_airport: '',
      })
      setLookupStatus('idle')
      setLookupMessage('')
      setLastLookup(null)
    } catch {
      setServerError('Network error. Please try again.')
    }
  }

  return (
    <Card className="w-full max-w-3xl shadow-panel">
      <CardHeader className="pb-4">
        <div className="mb-2 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-100">
            <Plane className="h-5 w-5 text-sky-600" />
          </div>
          <div>
            <CardTitle className="text-xl">Add your aircraft</CardTitle>
            <CardDescription>
              Enter the tail number first. We’ll pull everything we can from the FAA Registry, and you can keep adding aircraft before continuing.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="tail-number">Tail number</Label>
            <div className="flex gap-2">
              <Input
                id="tail-number"
                placeholder="N12345"
                className="font-mono uppercase"
                {...register('tail_number')}
                onChange={handleTailChange}
              />
              <Button
                type="button"
                variant="outline"
                className="shrink-0"
                onClick={() => void lookupFAA(getValues('tail_number'))}
              >
                <Search className="mr-2 h-4 w-4" />
                Lookup
              </Button>
            </div>
            {errors.tail_number && (
              <p className="text-xs text-destructive">{errors.tail_number.message}</p>
            )}
            {lookupMessage && (
              <p
                className={cn(
                  'text-xs',
                  lookupStatus === 'found'
                    ? 'text-emerald-600'
                    : lookupStatus === 'loading'
                      ? 'text-muted-foreground'
                      : 'text-amber-600'
                )}
              >
                {lookupMessage}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="make">Make</Label>
              <Input id="make" placeholder="Cessna" {...register('make')} />
              {errors.make && <p className="text-xs text-destructive">{errors.make.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="model">Model</Label>
              <Input id="model" placeholder="172S" {...register('model')} />
              {errors.model && <p className="text-xs text-destructive">{errors.model.message}</p>}
            </div>
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
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="serial-number">Serial number</Label>
              <Input id="serial-number" placeholder="172S9401" {...register('serial_number')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="engine-make">Engine make</Label>
              <Input id="engine-make" placeholder="Lycoming" {...register('engine_make')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="engine-model">Engine model</Label>
              <Input id="engine-model" placeholder="IO-360-L2A" {...register('engine_model')} />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="base-airport">Base airport</Label>
              <Input id="base-airport" placeholder="KPAO" {...register('base_airport')} />
            </div>
          </div>

          {serverError && (
            <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {serverError}
            </p>
          )}

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button type="submit" disabled={isSubmitting} className="sm:w-auto">
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding aircraft…
                </>
              ) : (
                <>
                  <Plane className="mr-2 h-4 w-4" />
                  Add aircraft
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={aircraft.length === 0}
              onClick={onContinue}
            >
              Continue with {aircraft.length} aircraft
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </form>

        <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Aircraft added</h3>
              <p className="text-xs text-muted-foreground">
                Keep adding tail numbers until your initial fleet is in place.
              </p>
            </div>
            <span className="rounded-full bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground">
              {aircraft.length} total
            </span>
          </div>

          {aircraft.length === 0 ? (
            <p className="text-sm text-muted-foreground">No aircraft added yet.</p>
          ) : (
            <div className="space-y-2">
              {aircraft.map((entry) => (
                <div
                  key={entry.id}
                  className="flex flex-col gap-1 rounded-lg border border-border bg-background p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-semibold text-foreground">{entry.tailNumber}</p>
                    <p className="text-xs text-muted-foreground">
                      {[entry.year, entry.make, entry.model].filter(Boolean).join(' ')}
                    </p>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {entry.registrantName ? `Registrant: ${entry.registrantName}` : entry.source === 'faa_registry' ? 'FAA Registry match' : 'Added manually'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function StepOperation({
  aircraft,
  onContinue,
  onSkip,
}: {
  aircraft: AddedAircraft[]
  onContinue: (values: Record<string, AircraftOperationType>) => Promise<void>
  onSkip: () => Promise<void>
}) {
  const [loading, setLoading] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [selectionByAircraftId, setSelectionByAircraftId] = useState<Record<string, AircraftOperationType>>(() =>
    aircraft.reduce<Record<string, AircraftOperationType>>((acc, entry) => {
      if (entry.operationType) {
        acc[entry.id] = entry.operationType
      }
      return acc
    }, {})
  )

  async function handleContinue() {
    if (aircraft.some((entry) => !selectionByAircraftId[entry.id])) {
      setServerError('Choose an operation type for each aircraft before continuing.')
      return
    }

    setServerError(null)
    setLoading(true)
    try {
      await onContinue(selectionByAircraftId)
    } catch (error) {
      setServerError(error instanceof Error ? error.message : 'Failed to save operation profiles.')
    } finally {
      setLoading(false)
    }
  }

  async function handleSkip() {
    setServerError(null)
    setLoading(true)
    try {
      await onSkip()
    } catch (error) {
      setServerError(error instanceof Error ? error.message : 'Failed to skip operation setup.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-4xl shadow-panel">
      <CardHeader className="pb-4">
        <div className="mb-2 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-100">
            <Sparkles className="h-5 w-5 text-brand-600" />
          </div>
          <div>
            <CardTitle className="text-xl">Set the operation for each aircraft</CardTitle>
            <CardDescription>
              This drives reminders, document recommendations, and the default owner workflow for each tail number.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {aircraft.map((entry) => (
          <div key={entry.id} className="rounded-xl border border-border bg-background p-4">
            <div className="mb-3">
              <p className="text-sm font-semibold text-foreground">{entry.tailNumber}</p>
              <p className="text-xs text-muted-foreground">
                {[entry.year, entry.make, entry.model].filter(Boolean).join(' ')}
              </p>
            </div>
            <Label className="mb-2 block text-xs uppercase tracking-wide text-muted-foreground">
              Operation type
            </Label>
            <Select
              value={selectionByAircraftId[entry.id]}
              onValueChange={(value) => {
                setSelectionByAircraftId((current) => ({
                  ...current,
                  [entry.id]: value as AircraftOperationType,
                }))
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select how this aircraft is used" />
              </SelectTrigger>
              <SelectContent>
                {OPERATION_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}

        {serverError && (
          <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {serverError}
          </p>
        )}

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button className="sm:w-auto" onClick={() => void handleContinue()} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                Continue
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
          <Button variant="outline" onClick={() => void handleSkip()} disabled={loading}>
            Skip for now
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function StepDocument({
  aircraftCount,
  primaryAircraft,
  onSkip,
  onUpload,
}: {
  aircraftCount: number
  primaryAircraft: AddedAircraft | null
  onSkip: () => Promise<void>
  onUpload: () => Promise<void>
}) {
  const [loadingAction, setLoadingAction] = useState<'skip' | 'upload' | null>(null)

  async function run(action: 'skip' | 'upload', callback: () => Promise<void>) {
    setLoadingAction(action)
    try {
      await callback()
    } finally {
      setLoadingAction(null)
    }
  }

  return (
    <Card className="w-full max-w-lg shadow-panel">
      <CardHeader className="pb-4">
        <div className="mb-2 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100">
            <FileText className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <CardTitle className="text-xl">Upload your first documents</CardTitle>
            <CardDescription>
              {aircraftCount > 1
                ? `We’ll open the upload screen with ${primaryAircraft?.tailNumber ?? 'your first aircraft'} preselected.`
                : 'We’ll pre-select this aircraft and show the recommended document categories first.'}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-xl border-2 border-dashed border-emerald-200 bg-emerald-50 p-8 text-center">
          <FileText className="mx-auto mb-3 h-10 w-10 text-emerald-400" />
          <p className="mb-1 text-sm font-medium text-foreground">
            {primaryAircraft?.tailNumber
              ? `Ready to upload documents for ${primaryAircraft.tailNumber}?`
              : 'Ready to upload your documents?'}
          </p>
          <p className="text-xs text-muted-foreground">
            You can always switch aircraft on the upload screen or come back later.
          </p>
        </div>

        <Button
          className="w-full"
          onClick={() => void run('upload', onUpload)}
          disabled={loadingAction !== null}
        >
          {loadingAction === 'upload' ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Opening upload…
            </>
          ) : (
            <>
              <FileText className="mr-2 h-4 w-4" />
              Upload documents
            </>
          )}
        </Button>

        <Button
          variant="outline"
          className="w-full"
          onClick={() => void run('skip', onSkip)}
          disabled={loadingAction !== null}
        >
          {loadingAction === 'skip' ? 'Finishing…' : 'Skip for now — go to dashboard'}
        </Button>
      </CardContent>
    </Card>
  )
}

function StepMechanicFinish({
  onFinish,
}: {
  onFinish: () => Promise<void>
}) {
  const [loading, setLoading] = useState(false)

  async function handleFinish() {
    setLoading(true)
    try {
      await onFinish()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-lg shadow-panel">
      <CardHeader className="pb-4">
        <div className="mb-2 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100">
            <Wrench className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <CardTitle className="text-xl">Your mechanic workspace is ready</CardTitle>
            <CardDescription>
              Finish onboarding and go to the dashboard. You can invite your team, create customers, and add aircraft after this.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-xl border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
          Start with your shop settings, invite mechanics, and connect aircraft to customers when you are ready.
        </div>
        <Button className="w-full" onClick={() => void handleFinish()} disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Finishing…
            </>
          ) : (
            <>
              Go to dashboard
              <ArrowRight className="ml-2 h-4 w-4" />
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  )
}

export function PersonaOnboardingFlow({ persona }: { persona: OnboardingPersona }) {
  const router = useTenantRouter()
  const steps = useMemo(() => (persona === 'mechanic' ? MECHANIC_STEPS : OWNER_STEPS), [persona])
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [organizationId, setOrganizationId] = useState('')
  const [organizationSlug, setOrganizationSlug] = useState('')
  const [aircraft, setAircraft] = useState<AddedAircraft[]>([])
  const onboardingContextRef = useRef<Record<string, unknown>>({})

  useEffect(() => {
    window.localStorage.setItem('ui_persona', persona)
  }, [persona])

  async function saveOnboardingState(payload: Record<string, unknown>) {
    try {
      await fetch('/api/onboarding/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    } catch {
      // Non-blocking. Keep onboarding moving.
    }
  }

  function persistOnboardingContext(
    contextPatch: Record<string, unknown>,
    payloadPatch: Record<string, unknown> = {}
  ) {
    onboardingContextRef.current = {
      ...onboardingContextRef.current,
      persona,
      ...contextPatch,
    }

    void saveOnboardingState({
      persona,
      ...payloadPatch,
      onboarding_context: onboardingContextRef.current,
    })
  }

  function handleOrgCreated(organization: { id: string; slug: string; name: string }) {
    setOrganizationId(organization.id)
    setOrganizationSlug(organization.slug)
    persistOnboardingContext(
      {
        onboarding_step: 'organization',
        organization_id: organization.id,
        organization_name: organization.name,
        organization_slug: organization.slug,
      },
      {
        org_id: organization.id,
        org_name: organization.name,
      }
    )
    setStep(2)
  }

  function handleAircraftAdded(entry: AddedAircraft) {
    setAircraft((current) => {
      const next = [...current, entry]
      persistOnboardingContext(
        {
          onboarding_step: 'aircraft',
          aircraft: next.map((item) => ({
            id: item.id,
            tail_number: item.tailNumber,
            make: item.make,
            model: item.model,
            year: item.year ?? null,
          })),
          first_aircraft_id: next[0]?.id ?? null,
          first_aircraft_tail_number: next[0]?.tailNumber ?? null,
        },
        {
          org_id: organizationId,
        }
      )
      window.localStorage.setItem('owner_selected_aircraft_id', entry.id)
      return next
    })
  }

  async function handleOperationsSaved(selectionByAircraftId: Record<string, AircraftOperationType>) {
    const nextAircraft = aircraft.map((entry) => ({
      ...entry,
      operationType: selectionByAircraftId[entry.id],
    }))

    for (const entry of nextAircraft) {
      const operationType = selectionByAircraftId[entry.id]
      const updateRes = await fetch(`/api/aircraft/${entry.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation_type: operationType,
          operation_types: [operationType],
        }),
      })

      if (!updateRes.ok) {
        const payload = await updateRes.json().catch(() => ({}))
        throw new Error(payload.error ?? `Failed to save operation for ${entry.tailNumber}`)
      }

      try {
        await fetch(`/api/aircraft/${entry.id}/suggest-categories`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            operation_type: operationType,
            operation_types: [operationType],
          }),
        })
      } catch {
        // Non-blocking. Operation persistence is the source of truth.
      }
    }

    setAircraft(nextAircraft)
    persistOnboardingContext(
      {
        onboarding_step: 'operation',
        aircraft_operations: nextAircraft.map((entry) => ({
          aircraft_id: entry.id,
          tail_number: entry.tailNumber,
          operation_type: entry.operationType,
        })),
      },
      {
        org_id: organizationId,
      }
    )
    setStep(4)
  }

  async function handleOperationSkipped() {
    persistOnboardingContext(
      {
        onboarding_step: 'operation_skipped',
      },
      {
        org_id: organizationId,
      }
    )
    setStep(4)
  }

  async function completeOnboarding(destination: string) {
    const nextContext = {
      ...onboardingContextRef.current,
      onboarding_step: 'completed',
      onboarding_destination: destination,
    }
    onboardingContextRef.current = nextContext

    await saveOnboardingState({
      org_id: organizationId || undefined,
      persona,
      onboarding_completed_at: new Date().toISOString(),
      onboarding_context: nextContext,
    })

    router.push(destination)
  }

  async function finishMechanicOnboarding() {
    const destination = withTenantPrefix('/dashboard', organizationSlug)
    await completeOnboarding(destination)
  }

  async function handleUploadDocuments() {
    const primaryAircraftId = aircraft[0]?.id
    if (primaryAircraftId) {
      window.localStorage.setItem('owner_selected_aircraft_id', primaryAircraftId)
    }
    const uploadDestination = withTenantPrefix(
      primaryAircraftId ? `/documents/upload?aircraft=${primaryAircraftId}` : '/documents/upload',
      organizationSlug
    )
    await completeOnboarding(uploadDestination)
  }

  async function handleSkipDocuments() {
    if (aircraft[0]?.id) {
      window.localStorage.setItem('owner_selected_aircraft_id', aircraft[0].id)
    }
    const dashboardDestination = withTenantPrefix('/dashboard', organizationSlug)
    await completeOnboarding(dashboardDestination)
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(37,99,235,0.16),_rgba(10,22,40,0.96)_55%)] px-4 py-10 text-white">
      <div className="mx-auto flex max-w-5xl flex-col items-center">
        <div className="mb-8 max-w-2xl text-center">
          <p className="mb-2 text-sm uppercase tracking-[0.24em] text-white/60">
            {persona === 'mechanic' ? 'Mechanic onboarding' : 'Owner onboarding'}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-white">
            {persona === 'mechanic'
              ? 'Set up your maintenance workspace'
              : 'Set up your aircraft records workspace'}
          </h1>
          <p className="mt-3 text-sm text-white/70">
            {persona === 'mechanic'
              ? 'Create the shop organization first, then finish inside the mechanic dashboard.'
              : 'Add your organization, load one or more aircraft from the FAA Registry, set the operation profile, and decide whether to upload documents now.'}
          </p>
        </div>

        <StepIndicator current={step} steps={steps} />

        {step === 1 && <StepOrganization persona={persona} onSuccess={handleOrgCreated} />}

        {persona === 'owner' && step === 2 && (
          <StepAircraft
            organizationId={organizationId}
            aircraft={aircraft}
            onAircraftAdded={handleAircraftAdded}
            onContinue={() => setStep(3)}
          />
        )}

        {persona === 'owner' && step === 3 && (
          <StepOperation
            aircraft={aircraft}
            onContinue={handleOperationsSaved}
            onSkip={handleOperationSkipped}
          />
        )}

        {persona === 'owner' && step === 4 && (
          <StepDocument
            aircraftCount={aircraft.length}
            primaryAircraft={aircraft[0] ?? null}
            onSkip={handleSkipDocuments}
            onUpload={handleUploadDocuments}
          />
        )}

        {persona === 'mechanic' && step === 2 && (
          <StepMechanicFinish onFinish={finishMechanicOnboarding} />
        )}
      </div>
    </div>
  )
}
