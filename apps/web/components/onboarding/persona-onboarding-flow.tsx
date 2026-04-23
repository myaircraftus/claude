'use client'

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  ArrowRight,
  Building2,
  Check,
  FileText,
  Loader2,
  Plane,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { useTenantRouter } from '@/components/shared/tenant-link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
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
  org_name: z.string().min(2, 'Organization name must be at least 2 characters').max(80),
  slug: z
    .string()
    .min(2, 'Slug must be at least 2 characters')
    .max(40)
    .regex(/^[a-z0-9-]+$/, 'Slug may only contain lowercase letters, numbers and hyphens'),
  full_name: z.string().min(2, 'Your full name is required').max(80),
  phone: z.string().max(30).optional(),
})

const ownerSetupSchema = orgSchema

const mechanicSetupSchema = orgSchema.extend({
  business_type: z.enum(['company', 'individual']),
  cert_number: z.string().min(3, 'Certificate number is required').max(40),
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

type OwnerSetupValues = z.infer<typeof ownerSetupSchema>
type MechanicSetupValues = z.infer<typeof mechanicSetupSchema>
type AircraftFormValues = z.infer<typeof aircraftSchema>
type FAAStatus = 'idle' | 'loading' | 'found' | 'not_found' | 'error'
type InviteRole = 'admin' | 'mechanic' | 'viewer'
type InviteTitle = 'Head Mechanic / IA' | 'Mechanic' | 'Office / Service Writer'

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

interface TeamInviteDraft {
  id: string
  fullName: string
  email: string
  title: InviteTitle
  role: InviteRole
}

const OWNER_STEPS = [
  { number: 1, label: 'Workspace', icon: Building2 },
  { number: 2, label: 'Aircraft', icon: Plane },
  { number: 3, label: 'Operations', icon: Sparkles },
  { number: 4, label: 'Documents', icon: FileText },
] as const

const MECHANIC_STEPS = [
  { number: 1, label: 'Shop', icon: Wrench },
  { number: 2, label: 'Aircraft', icon: Plane },
  { number: 3, label: 'Team', icon: Users },
  { number: 4, label: 'Finish', icon: ShieldCheck },
] as const

const TITLE_TO_ROLE: Record<InviteTitle, InviteRole> = {
  'Head Mechanic / IA': 'admin',
  Mechanic: 'mechanic',
  'Office / Service Writer': 'viewer',
}

function StepIndicator({
  current,
  steps,
}: {
  current: number
  steps: ReadonlyArray<{ number: number; label: string; icon: LucideIcon }>
}) {
  return (
    <div className="hidden items-center justify-center gap-2 md:flex">
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
                      ? 'border-sky-400 bg-sky-400/10 text-sky-200'
                      : 'border-white/20 bg-white/5 text-white/45'
                )}
              >
                {done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
              </div>
              <span
                className={cn(
                  'text-[11px] font-medium',
                  done ? 'text-emerald-300' : active ? 'text-white' : 'text-white/50'
                )}
              >
                {step.label}
              </span>
            </div>
            {idx < steps.length - 1 && (
              <div
                className={cn(
                  'mx-2 mb-5 h-0.5 w-12 transition-all',
                  done ? 'bg-emerald-400' : 'bg-white/15'
                )}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

function OnboardingShell({
  persona,
  step,
  steps,
  eyebrow,
  title,
  description,
  children,
}: {
  persona: OnboardingPersona
  step: number
  steps: ReadonlyArray<{ number: number; label: string; icon: LucideIcon }>
  eyebrow: string
  title: string
  description: string
  children: ReactNode
}) {
  const progress = Math.round((step / steps.length) * 100)

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(37,99,235,0.16),_rgba(10,22,40,0.96)_55%)] px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <p className="text-[11px] uppercase tracking-[0.24em] text-white/60">{eyebrow}</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
              {title}
            </h1>
            <p className="mt-3 text-sm leading-6 text-white/70">{description}</p>

            <div className="mt-6 rounded-2xl border border-white/10 bg-black/10 p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-[0.18em] text-white/60">
                  Setup progress
                </span>
                <span className="text-sm font-semibold text-white">{progress}%</span>
              </div>
              <Progress value={progress} className="h-2 bg-white/10 [&>div]:bg-sky-400" />
              <div className="mt-4 space-y-2">
                {steps.map((item) => {
                  const done = step > item.number
                  const active = step === item.number
                  const Icon = item.icon
                  return (
                    <div
                      key={item.number}
                      className={cn(
                        'flex items-center gap-3 rounded-xl px-3 py-2 text-sm',
                        active ? 'bg-white/10 text-white' : 'text-white/55'
                      )}
                    >
                      <div
                        className={cn(
                          'flex h-8 w-8 items-center justify-center rounded-full border text-xs',
                          done
                            ? 'border-emerald-400 bg-emerald-500 text-white'
                            : active
                              ? 'border-sky-400 bg-sky-400/10 text-sky-200'
                              : 'border-white/15 bg-white/5 text-white/45'
                        )}
                      >
                        {done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium">{item.label}</div>
                        <div className="text-xs text-white/45">
                          {done ? 'Done' : active ? 'In progress' : 'Coming up'}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="mt-5 hidden text-xs leading-5 text-white/55 lg:block">
              {persona === 'owner'
                ? 'Tail number first. FAA registry autofill handles the aircraft details, then you choose the operation and decide whether to upload documents now or later.'
                : 'Set up the shop, capture the lead mechanic credentials, optionally add aircraft, and optionally invite the rest of the team before you land in the mechanic dashboard.'}
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <div className="md:hidden">
              <StepIndicator current={step} steps={steps} />
            </div>
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}

function QuestionCard({
  kicker,
  title,
  description,
  children,
}: {
  kicker: string
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <Card className="border-white/15 bg-white text-slate-900 shadow-2xl">
      <CardHeader className="space-y-3 pb-4">
        <div className="inline-flex w-fit rounded-full bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-700">
          {kicker}
        </div>
        <div>
          <CardTitle className="text-2xl tracking-tight text-slate-900">{title}</CardTitle>
          <CardDescription className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            {description}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

function SetupOwnerStep({
  onSubmitSuccess,
}: {
  onSubmitSuccess: (
    organization: { id: string; slug: string; name: string },
    values: OwnerSetupValues
  ) => Promise<void>
}) {
  const [serverError, setServerError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<OwnerSetupValues>({
    resolver: zodResolver(ownerSetupSchema),
    defaultValues: {
      org_name: '',
      slug: '',
      full_name: '',
      phone: '',
    },
  })

  function handleOrgNameChange(event: ChangeEvent<HTMLInputElement>) {
    const value = event.target.value
    setValue('org_name', value, { shouldDirty: true, shouldValidate: true })
    setValue('slug', slugify(value), { shouldDirty: true, shouldValidate: true })
  }

  async function onSubmit(values: OwnerSetupValues) {
    setServerError(null)
    try {
      const res = await fetch('/api/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: values.org_name,
          slug: values.slug,
        }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        setServerError(payload.error ?? 'Failed to create organization')
        return
      }

      await onSubmitSuccess(
        { id: payload.id, slug: payload.slug, name: values.org_name },
        values
      )
    } catch {
      setServerError('Network error. Please try again.')
    }
  }

  return (
    <QuestionCard
      kicker="Owner setup"
      title="Who is setting this workspace up?"
      description="Start with the owner record and the organization URL. You can invite other users later from Settings once the workspace is live."
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="owner-full-name">Your full name</Label>
            <Input id="owner-full-name" placeholder="Andy Patel" {...register('full_name')} />
            {errors.full_name && <p className="text-xs text-destructive">{errors.full_name.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="owner-phone">Phone number</Label>
            <Input id="owner-phone" placeholder="(650) 555-0123" {...register('phone')} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="owner-org-name">Organization or ownership name</Label>
            <Input
              id="owner-org-name"
              placeholder="Horizon Flights Corp"
              {...register('org_name')}
              onChange={handleOrgNameChange}
            />
            {errors.org_name && <p className="text-xs text-destructive">{errors.org_name.message}</p>}
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="owner-slug">Workspace URL</Label>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="whitespace-nowrap text-sm text-slate-500">myaircraft.us/</span>
              <Input
                id="owner-slug"
                className="border-0 bg-transparent px-0 font-mono shadow-none focus-visible:ring-0"
                placeholder="horizon-flights"
                {...register('slug')}
              />
            </div>
            {errors.slug && <p className="text-xs text-destructive">{errors.slug.message}</p>}
          </div>
        </div>

        {serverError && (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {serverError}
          </div>
        )}

        <div className="flex items-center justify-end">
          <Button type="submit" className="min-w-40" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating workspace…
              </>
            ) : (
              <>
                Continue
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </form>
    </QuestionCard>
  )
}

function SetupMechanicStep({
  onSubmitSuccess,
}: {
  onSubmitSuccess: (
    organization: { id: string; slug: string; name: string },
    values: MechanicSetupValues
  ) => Promise<void>
}) {
  const [serverError, setServerError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<MechanicSetupValues>({
    resolver: zodResolver(mechanicSetupSchema),
    defaultValues: {
      business_type: 'company',
      org_name: '',
      slug: '',
      full_name: '',
      phone: '',
      cert_number: '',
    },
  })

  const businessType = watch('business_type')

  function handleOrgNameChange(event: ChangeEvent<HTMLInputElement>) {
    const value = event.target.value
    setValue('org_name', value, { shouldDirty: true, shouldValidate: true })
    setValue('slug', slugify(value), { shouldDirty: true, shouldValidate: true })
  }

  async function onSubmit(values: MechanicSetupValues) {
    setServerError(null)
    try {
      const res = await fetch('/api/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: values.org_name,
          slug: values.slug,
        }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        setServerError(payload.error ?? 'Failed to create organization')
        return
      }

      await onSubmitSuccess(
        { id: payload.id, slug: payload.slug, name: values.org_name },
        values
      )
    } catch {
      setServerError('Network error. Please try again.')
    }
  }

  return (
    <QuestionCard
      kicker="Mechanic setup"
      title="Who runs this maintenance workspace?"
      description="Capture the lead mechanic details now. The certificate number is mandatory because that identity anchors signatures, logbook workflows, and review actions later."
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="mechanic-business-type">Business type</Label>
            <Select
              value={businessType}
              onValueChange={(value) =>
                setValue('business_type', value as 'company' | 'individual', {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
            >
              <SelectTrigger id="mechanic-business-type">
                <SelectValue placeholder="Select business type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="company">Company / repair station / shop</SelectItem>
                <SelectItem value="individual">Individual / proprietor</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="mechanic-full-name">Lead mechanic name</Label>
            <Input id="mechanic-full-name" placeholder="Mike Torres" {...register('full_name')} />
            {errors.full_name && <p className="text-xs text-destructive">{errors.full_name.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="mechanic-phone">Phone number</Label>
            <Input id="mechanic-phone" placeholder="(650) 555-0199" {...register('phone')} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="mechanic-cert-number">A&P / IA certificate number</Label>
            <Input
              id="mechanic-cert-number"
              placeholder="A&P 3456789"
              {...register('cert_number')}
            />
            {errors.cert_number && <p className="text-xs text-destructive">{errors.cert_number.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="mechanic-org-name">
              {businessType === 'individual' ? 'Shop or proprietor name' : 'Company name'}
            </Label>
            <Input
              id="mechanic-org-name"
              placeholder={businessType === 'individual' ? 'Mike Torres A&P Services' : 'Precision Air Maintenance'}
              {...register('org_name')}
              onChange={handleOrgNameChange}
            />
            {errors.org_name && <p className="text-xs text-destructive">{errors.org_name.message}</p>}
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="mechanic-slug">Workspace URL</Label>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="whitespace-nowrap text-sm text-slate-500">myaircraft.us/</span>
              <Input
                id="mechanic-slug"
                className="border-0 bg-transparent px-0 font-mono shadow-none focus-visible:ring-0"
                placeholder="precision-air-maintenance"
                {...register('slug')}
              />
            </div>
            {errors.slug && <p className="text-xs text-destructive">{errors.slug.message}</p>}
          </div>
        </div>

        {serverError && (
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {serverError}
          </div>
        )}

        <div className="flex items-center justify-end">
          <Button type="submit" className="min-w-40" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating workspace…
              </>
            ) : (
              <>
                Continue
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </form>
    </QuestionCard>
  )
}

function AircraftStep({
  title,
  description,
  organizationId,
  aircraft,
  onAircraftAdded,
  onContinue,
  continueLabel,
  optional = false,
}: {
  title: string
  description: string
  organizationId: string
  aircraft: AddedAircraft[]
  onAircraftAdded: (aircraft: AddedAircraft) => void
  onContinue: () => void
  continueLabel: string
  optional?: boolean
}) {
  const [serverError, setServerError] = useState<string | null>(null)
  const [lookupStatus, setLookupStatus] = useState<FAAStatus>('idle')
  const [lookupMessage, setLookupMessage] = useState('')
  const [lastLookup, setLastLookup] = useState<FAAResult | null>(null)
  const [showManualFields, setShowManualFields] = useState(false)
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
      setShowManualFields(false)
      return
    }

    setLookupStatus('loading')
    setLookupMessage('Looking up the FAA registry…')

    try {
      const res = await fetch(`/api/aircraft/faa-lookup?tail=${encodeURIComponent(trimmed)}`)
      const data = (await res.json()) as FAAResult

      if (!res.ok || data.error) {
        setLastLookup(null)
        setShowManualFields(true)
        if (res.status === 404) {
          setLookupStatus('not_found')
          setLookupMessage('No FAA match found. Enter the aircraft details manually.')
        } else {
          setLookupStatus('error')
          setLookupMessage(data.error || 'FAA lookup is unavailable right now. Enter details manually.')
        }
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
      setShowManualFields(false)
      setLookupMessage(
        `FAA match found${data.make || data.model ? `: ${[data.year, data.make, data.model].filter(Boolean).join(' ')}` : ''}${data.registrant_name ? ` — ${data.registrant_name}` : ''}`
      )
    } catch {
      setLastLookup(null)
      setLookupStatus('error')
      setLookupMessage('FAA lookup is unavailable right now. Enter details manually.')
      setShowManualFields(true)
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
    }, 600)
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
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        setServerError(payload.error ?? 'Failed to add aircraft')
        return
      }

      onAircraftAdded({
        id: payload.id,
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
      setShowManualFields(false)
    } catch {
      setServerError('Network error. Please try again.')
    }
  }

  return (
    <QuestionCard kicker="Aircraft setup" title={title} description={description}>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="tail-number">Tail number</Label>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Input
                id="tail-number"
                placeholder="N12345"
                className="font-mono uppercase sm:max-w-xs"
                {...register('tail_number')}
                onChange={handleTailChange}
              />
              <Button
                type="button"
                variant="outline"
                className="sm:w-auto"
                onClick={() => void lookupFAA(getValues('tail_number'))}
              >
                <Search className="mr-2 h-4 w-4" />
                Search FAA
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
                      ? 'text-slate-500'
                      : 'text-amber-700'
                )}
              >
                {lookupMessage}
              </p>
            )}
          </div>

          {lookupStatus === 'found' && !showManualFields && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-sm font-semibold text-slate-900">
                {[lastLookup?.year, lastLookup?.make, lastLookup?.model].filter(Boolean).join(' ')}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {[lastLookup?.engine_make, lastLookup?.engine_model].filter(Boolean).join(' ')}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                {lastLookup?.registrant_name
                  ? `FAA registrant: ${lastLookup.registrant_name}`
                  : 'Using FAA registry details.'}
              </p>
              <Button
                type="button"
                variant="ghost"
                className="mt-2 h-auto px-0 text-sm text-sky-700 hover:bg-transparent hover:text-sky-800"
                onClick={() => setShowManualFields(true)}
              >
                Edit imported details
              </Button>
            </div>
          )}

          {(showManualFields || lookupStatus !== 'found') && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="make">Make</Label>
                <Input id="make" placeholder="Cessna" {...register('make')} />
                {errors.make && <p className="text-xs text-destructive">{errors.make.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="model">Model</Label>
                <Input id="model" placeholder="172S" {...register('model')} />
                {errors.model && <p className="text-xs text-destructive">{errors.model.message}</p>}
              </div>
              <div className="space-y-2">
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
              <div className="space-y-2">
                <Label htmlFor="serial-number">Serial number</Label>
                <Input id="serial-number" placeholder="172S9401" {...register('serial_number')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="engine-make">Engine make</Label>
                <Input id="engine-make" placeholder="Lycoming" {...register('engine_make')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="engine-model">Engine model</Label>
                <Input id="engine-model" placeholder="IO-360-L2A" {...register('engine_model')} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="base-airport">Base airport</Label>
                <Input id="base-airport" placeholder="KPAO" {...register('base_airport')} />
              </div>
            </div>
          )}

          {serverError && (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {serverError}
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding aircraft…
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  Add aircraft
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onContinue}
              disabled={!optional && aircraft.length === 0}
            >
              {continueLabel}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </form>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Aircraft added</h3>
              <p className="text-xs text-slate-500">
                {optional
                  ? 'You can skip this and come back later.'
                  : 'Add every aircraft you want in this workspace before continuing.'}
              </p>
            </div>
            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-500">
              {aircraft.length}
            </span>
          </div>

          {aircraft.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">
              {optional ? 'No aircraft added yet.' : 'No aircraft added yet. Add the first tail number to continue.'}
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {aircraft.map((entry) => (
                <div key={entry.id} className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-sm font-semibold text-slate-900">{entry.tailNumber}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {[entry.year, entry.make, entry.model].filter(Boolean).join(' ')}
                  </p>
                  {entry.registrantName && (
                    <p className="mt-1 text-xs text-slate-500">Registrant: {entry.registrantName}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </QuestionCard>
  )
}

function OperationStep({
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
  const [selectionByAircraftId, setSelectionByAircraftId] = useState<Record<string, AircraftOperationType>>(
    () =>
      aircraft.reduce<Record<string, AircraftOperationType>>((acc, entry) => {
        if (entry.operationType) acc[entry.id] = entry.operationType
        return acc
      }, {})
  )

  async function handleContinue() {
    if (aircraft.some((entry) => !selectionByAircraftId[entry.id])) {
      setServerError('Choose an operation type for each aircraft before continuing.')
      return
    }
    setLoading(true)
    setServerError(null)
    try {
      await onContinue(selectionByAircraftId)
    } catch (error) {
      setServerError(error instanceof Error ? error.message : 'Failed to save operation profiles.')
    } finally {
      setLoading(false)
    }
  }

  async function handleSkip() {
    setLoading(true)
    setServerError(null)
    try {
      await onSkip()
    } catch (error) {
      setServerError(error instanceof Error ? error.message : 'Failed to skip operation setup.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <QuestionCard
      kicker="Aircraft operations"
      title="How is each aircraft used?"
      description="Pick the operating profile for every aircraft. This feeds document recommendations, reminders, and the default owner-facing intelligence."
    >
      <div className="space-y-4">
        {aircraft.map((entry) => (
          <div key={entry.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3">
              <p className="text-sm font-semibold text-slate-900">{entry.tailNumber}</p>
              <p className="text-xs text-slate-500">
                {[entry.year, entry.make, entry.model].filter(Boolean).join(' ')}
              </p>
            </div>
            <Label className="mb-2 block text-xs uppercase tracking-[0.16em] text-slate-500">
              Operation type
            </Label>
            <Select
              value={selectionByAircraftId[entry.id]}
              onValueChange={(value) =>
                setSelectionByAircraftId((current) => ({
                  ...current,
                  [entry.id]: value as AircraftOperationType,
                }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select the operating profile" />
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
          <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {serverError}
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => void handleSkip()} disabled={loading}>
            Skip for now
          </Button>
          <Button onClick={() => void handleContinue()} disabled={loading}>
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
        </div>
      </div>
    </QuestionCard>
  )
}

function TeamInviteStep({
  organizationId,
  invites,
  onInviteCreated,
  onContinue,
}: {
  organizationId: string
  invites: TeamInviteDraft[]
  onInviteCreated: (invite: TeamInviteDraft) => void
  onContinue: () => Promise<void>
}) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [title, setTitle] = useState<InviteTitle>('Mechanic')
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [finishing, setFinishing] = useState(false)

  async function handleInvite() {
    if (!email.trim()) {
      setServerError('Email is required to send an invite.')
      return
    }
    setSubmitting(true)
    setServerError(null)
    try {
      const role = TITLE_TO_ROLE[title]
      const res = await fetch('/api/settings/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          role,
          full_name: fullName.trim() || undefined,
          job_title: title,
          org_id: organizationId,
        }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        setServerError(payload.error ?? 'Failed to send invite')
        return
      }

      onInviteCreated({
        id: `${Date.now()}`,
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        title,
        role,
      })
      setFullName('')
      setEmail('')
      setTitle('Mechanic')
    } catch {
      setServerError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleContinue() {
    setFinishing(true)
    try {
      await onContinue()
    } finally {
      setFinishing(false)
    }
  }

  return (
    <QuestionCard
      kicker="Team invites"
      title="Do you want to invite your team now?"
      description="You can invite the rest of the shop here, or skip and add them later from Settings. Customers can also be added later from the Customers section once the workspace is live."
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="invite-name">Name</Label>
              <Input
                id="invite-name"
                placeholder="Dana Lee"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="dana@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="invite-title">Title</Label>
              <Select value={title} onValueChange={(value) => setTitle(value as InviteTitle)}>
                <SelectTrigger id="invite-title">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Head Mechanic / IA">Head Mechanic / IA</SelectItem>
                  <SelectItem value="Mechanic">Mechanic</SelectItem>
                  <SelectItem value="Office / Service Writer">Office / Service Writer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Access level is derived automatically. Head Mechanic / IA gets admin access, Mechanic gets mechanic access, and Office / Service Writer gets viewer access.
          </div>

          {serverError && (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {serverError}
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
            <Button type="button" variant="outline" onClick={() => void handleInvite()} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending invite…
                </>
              ) : (
                <>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Invite team member
                </>
              )}
            </Button>
            <Button onClick={() => void handleContinue()} disabled={finishing}>
              {finishing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Finishing…
                </>
              ) : (
                <>
                  Continue
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <h3 className="text-sm font-semibold text-slate-900">Invites sent</h3>
          <p className="mt-1 text-xs text-slate-500">
            Team members can accept later. You can still edit roles from Settings afterward.
          </p>
          {invites.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">No invites yet.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {invites.map((invite) => (
                <div key={invite.id} className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-sm font-semibold text-slate-900">
                    {invite.fullName || invite.email}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">{invite.email}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {invite.title} · {invite.role}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </QuestionCard>
  )
}

function OwnerDocumentStep({
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
    <QuestionCard
      kicker="Finish owner onboarding"
      title="Upload documents now or finish and come back later"
      description="Your aircraft are already in place. We can drop you into document upload with the first aircraft preselected, or you can finish now and return later. Team users can be invited from Settings."
    >
      <div className="space-y-5">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <p className="text-sm font-semibold text-slate-900">
            {primaryAircraft?.tailNumber
              ? `Ready for ${primaryAircraft.tailNumber}`
              : 'Ready for your first upload'}
          </p>
          <p className="mt-2 text-sm text-slate-600">
            {aircraftCount > 1
              ? `We’ll open the upload screen with ${primaryAircraft?.tailNumber ?? 'your first aircraft'} preselected.`
              : 'We’ll open upload with the aircraft you just added and show the recommended categories first.'}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-900">What still comes later?</p>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              <li>Invite more users from Settings</li>
              <li>Add more aircraft any time</li>
              <li>Upload documents whenever you are ready</li>
            </ul>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-900">What is already saved?</p>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              <li>Organization URL and owner profile</li>
              <li>Aircraft imported from FAA registry</li>
              <li>Operation profile for every aircraft</li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            onClick={() => void run('skip', onSkip)}
            disabled={loadingAction !== null}
          >
            {loadingAction === 'skip' ? 'Finishing…' : 'Skip for now'}
          </Button>
          <Button onClick={() => void run('upload', onUpload)} disabled={loadingAction !== null}>
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
        </div>
      </div>
    </QuestionCard>
  )
}

function MechanicFinishStep({
  aircraftCount,
  inviteCount,
  onFinish,
}: {
  aircraftCount: number
  inviteCount: number
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
    <QuestionCard
      kicker="Finish mechanic onboarding"
      title="Your mechanic workspace is ready"
      description="You can start from the dashboard now. Add customers later from Customers, add more aircraft whenever needed, and adjust labor rates, templates, and team access from Settings."
    >
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-900">Lead mechanic</p>
          <p className="mt-2 text-sm text-slate-600">Profile and certificate number captured.</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-900">Aircraft loaded</p>
          <p className="mt-2 text-sm text-slate-600">{aircraftCount} aircraft added during onboarding.</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-900">Invites sent</p>
          <p className="mt-2 text-sm text-slate-600">{inviteCount} team invites queued.</p>
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <Button onClick={() => void handleFinish()} disabled={loading}>
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
      </div>
    </QuestionCard>
  )
}

export function PersonaOnboardingFlow({ persona }: { persona: OnboardingPersona }) {
  const router = useTenantRouter()
  const steps = useMemo(() => (persona === 'mechanic' ? MECHANIC_STEPS : OWNER_STEPS), [persona])
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [organizationId, setOrganizationId] = useState('')
  const [organizationSlug, setOrganizationSlug] = useState('')
  const [aircraft, setAircraft] = useState<AddedAircraft[]>([])
  const [teamInvites, setTeamInvites] = useState<TeamInviteDraft[]>([])
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
      // Keep onboarding moving.
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

  async function handleOwnerSetupSuccess(
    organization: { id: string; slug: string; name: string },
    values: OwnerSetupValues
  ) {
    setOrganizationId(organization.id)
    setOrganizationSlug(organization.slug)
    persistOnboardingContext(
      {
        onboarding_step: 'workspace',
        organization_id: organization.id,
        organization_name: organization.name,
        organization_slug: organization.slug,
        owner_name: values.full_name,
        owner_phone: values.phone || null,
      },
      {
        org_id: organization.id,
        org_name: organization.name,
        full_name: values.full_name,
        phone: values.phone || null,
      }
    )
    setStep(2)
  }

  async function handleMechanicSetupSuccess(
    organization: { id: string; slug: string; name: string },
    values: MechanicSetupValues
  ) {
    setOrganizationId(organization.id)
    setOrganizationSlug(organization.slug)
    persistOnboardingContext(
      {
        onboarding_step: 'shop',
        organization_id: organization.id,
        organization_name: organization.name,
        organization_slug: organization.slug,
        business_type: values.business_type,
        lead_mechanic_name: values.full_name,
        lead_mechanic_phone: values.phone || null,
        lead_mechanic_cert_number: values.cert_number,
        lead_mechanic_title: 'Head Mechanic / IA',
      },
      {
        org_id: organization.id,
        org_name: organization.name,
        full_name: values.full_name,
        phone: values.phone || null,
        job_title: 'Head Mechanic / IA',
        cert_number: values.cert_number,
      }
    )
    setStep(2)
  }

  function handleAircraftAdded(entry: AddedAircraft) {
    setAircraft((current) => {
      const next = [...current, entry]
      persistOnboardingContext(
        {
          onboarding_step: persona === 'owner' ? 'aircraft' : 'shop_aircraft',
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
      if (persona === 'owner') {
        window.localStorage.setItem('owner_selected_aircraft_id', entry.id)
      }
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
        // Best-effort.
      }
    }

    setAircraft(nextAircraft)
    persistOnboardingContext(
      {
        onboarding_step: 'operations',
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
        onboarding_step: 'operations_skipped',
      },
      {
        org_id: organizationId,
      }
    )
    setStep(4)
  }

  function handleInviteCreated(invite: TeamInviteDraft) {
    setTeamInvites((current) => {
      const next = [...current, invite]
      persistOnboardingContext(
        {
          onboarding_step: 'team_invites',
          team_invites: next,
        },
        {
          org_id: organizationId,
        }
      )
      return next
    })
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

  async function handleMechanicAircraftContinue() {
    persistOnboardingContext(
      {
        onboarding_step: 'mechanic_aircraft_complete',
      },
      {
        org_id: organizationId,
      }
    )
    setStep(3)
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
    const destination = withTenantPrefix(
      primaryAircraftId ? `/documents/upload?aircraft=${primaryAircraftId}` : '/documents/upload',
      organizationSlug
    )
    await completeOnboarding(destination)
  }

  async function handleSkipDocuments() {
    if (aircraft[0]?.id) {
      window.localStorage.setItem('owner_selected_aircraft_id', aircraft[0].id)
    }
    const destination = withTenantPrefix('/dashboard', organizationSlug)
    await completeOnboarding(destination)
  }

  return (
    <OnboardingShell
      persona={persona}
      step={step}
      steps={steps}
      eyebrow={persona === 'mechanic' ? 'Mechanic onboarding' : 'Owner onboarding'}
      title={persona === 'mechanic' ? 'Set up your maintenance workspace' : 'Set up your aircraft workspace'}
      description={
        persona === 'mechanic'
          ? 'Lead with the shop setup and certificate details, then optionally load aircraft and invite the rest of the team.'
          : 'Set up the owner workspace, add the fleet by tail number, assign operations, and decide whether to upload records now.'
      }
    >
      {persona === 'owner' && step === 1 && <SetupOwnerStep onSubmitSuccess={handleOwnerSetupSuccess} />}
      {persona === 'owner' && step === 2 && (
        <AircraftStep
          title="Which aircraft should we load first?"
          description="Enter only the tail number. We will pull the make, model, engine, and other details from the FAA registry automatically when we can, and you can keep adding aircraft before moving on."
          organizationId={organizationId}
          aircraft={aircraft}
          onAircraftAdded={handleAircraftAdded}
          onContinue={() => setStep(3)}
          continueLabel={aircraft.length === 0 ? 'Add an aircraft to continue' : `Continue with ${aircraft.length} aircraft`}
        />
      )}
      {persona === 'owner' && step === 3 && (
        <OperationStep
          aircraft={aircraft}
          onContinue={handleOperationsSaved}
          onSkip={handleOperationSkipped}
        />
      )}
      {persona === 'owner' && step === 4 && (
        <OwnerDocumentStep
          aircraftCount={aircraft.length}
          primaryAircraft={aircraft[0] ?? null}
          onSkip={handleSkipDocuments}
          onUpload={handleUploadDocuments}
        />
      )}

      {persona === 'mechanic' && step === 1 && (
        <SetupMechanicStep onSubmitSuccess={handleMechanicSetupSuccess} />
      )}
      {persona === 'mechanic' && step === 2 && (
        <AircraftStep
          title="Do you want to add any aircraft now?"
          description="This step is optional. If you already know some tail numbers, add them now and we will pull what we can from the FAA registry. If not, skip and load them later."
          organizationId={organizationId}
          aircraft={aircraft}
          onAircraftAdded={handleAircraftAdded}
          onContinue={() => void handleMechanicAircraftContinue()}
          continueLabel={aircraft.length === 0 ? 'Skip for now' : `Continue with ${aircraft.length} aircraft`}
          optional
        />
      )}
      {persona === 'mechanic' && step === 3 && (
        <TeamInviteStep
          organizationId={organizationId}
          invites={teamInvites}
          onInviteCreated={handleInviteCreated}
          onContinue={async () => setStep(4)}
        />
      )}
      {persona === 'mechanic' && step === 4 && (
        <MechanicFinishStep
          aircraftCount={aircraft.length}
          inviteCount={teamInvites.length}
          onFinish={finishMechanicOnboarding}
        />
      )}
    </OnboardingShell>
  )
}
