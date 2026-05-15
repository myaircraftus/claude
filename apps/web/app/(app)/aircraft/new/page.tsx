'use client'

import { useMemo, useState } from 'react'
import Link, { useTenantRouter } from '@/components/shared/tenant-link'
import { AircraftSilhouette } from '@/components/aircraft/aircraft-silhouette'
import { inferSilhouetteStyle } from '@/lib/aircraft/workspace'
import { OPERATION_TYPE_OPTIONS } from '@/lib/aircraft/operations'
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  Clock3,
  Loader2,
  Plane,
  Search,
  ShieldCheck,
  UserRound,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const FIELD_CLASS = 'w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
const BTN_PRIMARY = 'inline-flex items-center justify-center gap-2 rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50'
const BTN_SECONDARY = 'inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50'

type StepId = 'find' | 'payer' | 'details' | 'time' | 'due' | 'create'

const steps: Array<{ id: StepId; label: string }> = [
  { id: 'find', label: 'Find Aircraft' },
  { id: 'payer', label: 'Owner / Payer' },
  { id: 'details', label: 'Aircraft Details' },
  { id: 'time', label: 'Time & Setup' },
  { id: 'due', label: 'AI Due List' },
  { id: 'create', label: 'Create' },
]

const dueTemplates = [
  { title: 'Annual inspection', category: 'Scheduled Inspection', reason: 'Review annual currency from logbooks before activation.' },
  { title: 'ELT battery and inspection review', category: 'Recurring Compliance', reason: 'Confirm battery and inspection dates.' },
  { title: 'Transponder / altimeter certification', category: 'Recurring Compliance', reason: 'Verify if required for this aircraft and operation.' },
  { title: 'Oil and filter service', category: 'Preventive Maintenance', reason: 'Set interval from shop policy and last service records.' },
]

function normalizeTail(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export default function NewAircraftPage() {
  const router = useTenantRouter()
  const [step, setStep] = useState<StepId>('find')
  const [saving, setSaving] = useState(false)
  const [lookupLoading, setLookupLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lookupMessage, setLookupMessage] = useState<string | null>(null)

  const [tailNumber, setTailNumber] = useState('')
  const [make, setMake] = useState('')
  const [model, setModel] = useState('')
  const [year, setYear] = useState('')
  const [serialNumber, setSerialNumber] = useState('')
  const [registeredOwner, setRegisteredOwner] = useState('')
  const [registryRaw, setRegistryRaw] = useState<Record<string, unknown>>({})
  const [registrySource, setRegistrySource] = useState<string | null>(null)

  const [payerMode, setPayerMode] = useState<'registered' | 'different'>('registered')
  const [payerName, setPayerName] = useState('')
  const [payerEmail, setPayerEmail] = useState('')
  const [payerPhone, setPayerPhone] = useState('')
  const [payerAddress, setPayerAddress] = useState('')

  const [aircraftCategory, setAircraftCategory] = useState('airplane')
  const [aircraftClass, setAircraftClass] = useState('single_engine_land')
  const [engineType, setEngineType] = useState('piston')
  const [engineCount, setEngineCount] = useState('1')
  const [homeBase, setHomeBase] = useState('')
  const [operationType, setOperationType] = useState('private_owner')
  const [maintenanceProgram, setMaintenanceProgram] = useState('annual')
  const [notes, setNotes] = useState('')

  const [tach, setTach] = useState('')
  const [hobbs, setHobbs] = useState('')
  const [totalTime, setTotalTime] = useState('')
  const [timeSource, setTimeSource] = useState('mechanic_verified')
  const [adsbFallback, setAdsbFallback] = useState(false)
  const [activateDue, setActivateDue] = useState(false)
  const [selectedDue, setSelectedDue] = useState(() => new Set(dueTemplates.map((item) => item.title)))

  const silhouetteStyle = useMemo(() => inferSilhouetteStyle({
    make,
    model,
    aircraft_category: aircraftCategory,
    aircraft_class: aircraftClass,
    engine_type: engineType,
    engine_count: Number(engineCount) || null,
  }), [make, model, aircraftCategory, aircraftClass, engineType, engineCount])

  const stepIndex = steps.findIndex((item) => item.id === step)

  async function lookupAircraft() {
    const normalized = normalizeTail(tailNumber)
    if (!normalized) {
      setError('Enter a tail number first.')
      return
    }

    setError(null)
    setLookupLoading(true)
    setLookupMessage('Searching FAA registry...')
    try {
      const res = await fetch(`/api/aircraft/faa-lookup?tail=${encodeURIComponent(normalized)}`)
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setLookupMessage('FAA lookup unavailable or incomplete. You can continue manually; identity will be marked Needs Review.')
        setRegistrySource('manual')
        setTailNumber(normalized)
        return
      }

      setTailNumber(data.tail_number || normalized)
      setMake(data.make || '')
      setModel(data.model || '')
      setYear(data.year ? String(data.year) : '')
      setSerialNumber(data.serial_number || '')
      setRegisteredOwner(data.registrant_name || '')
      setPayerName(data.registrant_name || '')
      setRegistryRaw(data)
      setRegistrySource(data.source || 'faa_registry')
      setLookupMessage(`Found ${[data.make, data.model, data.year].filter(Boolean).join(' ') || normalized}. Review before saving.`)
    } catch {
      setLookupMessage('FAA registry lookup failed. Continue manually and review identity before saving.')
      setRegistrySource('manual')
    } finally {
      setLookupLoading(false)
    }
  }

  function canAdvance(current: StepId) {
    if (current === 'find') return tailNumber.trim().length >= 2
    if (current === 'payer') return payerMode === 'registered' || payerName.trim().length > 1
    if (current === 'details') return make.trim() && model.trim()
    return true
  }

  function nextStep() {
    if (!canAdvance(step)) {
      setError('Complete the required fields before continuing.')
      return
    }
    setError(null)
    const next = steps[Math.min(stepIndex + 1, steps.length - 1)]
    setStep(next.id)
  }

  function previousStep() {
    setError(null)
    const prev = steps[Math.max(stepIndex - 1, 0)]
    setStep(prev.id)
  }

  async function resolveOrganizationId() {
    const res = await fetch('/api/organization', { cache: 'no-store' })
    const data = await res.json().catch(() => null)
    if (!res.ok || !data?.organization_id) throw new Error(data?.error ?? 'Unable to resolve organization')
    return data.organization_id as string
  }

  async function createPayerIfNeeded() {
    const name = payerMode === 'registered' ? (registeredOwner || payerName) : payerName
    if (!name.trim()) return null

    const res = await fetch('/api/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.trim(),
        email: payerEmail.trim() || null,
        phone: payerPhone.trim() || null,
        billing_address: payerAddress.trim() ? { line1: payerAddress.trim() } : null,
        tags: ['aircraft-owner'],
        notes: 'Created during aircraft onboarding.',
      }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) throw new Error(data?.error ?? 'Failed to create owner / payer')
    return data.id as string
  }

  async function createAircraft() {
    setSaving(true)
    setError(null)
    try {
      const organizationId = await resolveOrganizationId()
      const payerId = await createPayerIfNeeded()

      const aircraftRes = await fetch('/api/aircraft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_id: organizationId,
          tail_number: normalizeTail(tailNumber),
          make: make.trim() || 'Unknown',
          model: model.trim() || 'Unknown',
          year: year ? Number(year) : undefined,
          serial_number: serialNumber.trim() || undefined,
          owner_customer_id: payerId,
          maintenance_payer_customer_id: payerId,
          registered_owner_name: registeredOwner.trim() || null,
          aircraft_category: aircraftCategory,
          aircraft_class: aircraftClass,
          engine_type: engineType,
          engine_count: Number(engineCount) || null,
          taxonomy_aircraft_kind: aircraftCategory === 'rotorcraft' ? 'rotorcraft' : 'fixed_wing',
          taxonomy_engine_type: engineType === 'unknown' ? 'unknown' : engineType,
          taxonomy_engine_count: Number(engineCount) || null,
          base_airport: homeBase.trim().toUpperCase() || undefined,
          home_base: homeBase.trim().toUpperCase() || null,
          operation_type: operationType,
          operation_types: [operationType],
          maintenance_program_type: maintenanceProgram,
          silhouette_style: silhouetteStyle,
          registry_source: registrySource || 'manual',
          registry_status: registrySource && registrySource !== 'manual' ? 'prefilled' : 'manual',
          registry_lookup_at: new Date().toISOString(),
          registry_raw: registryRaw,
          identity_review_status: registrySource && registrySource !== 'manual' ? 'needs_review' : 'manual',
          time_source_preference: adsbFallback ? 'mixed' : 'manual',
          aircraft_workspace_status: 'needs_review',
          notes: notes.trim() || undefined,
        }),
      })
      const aircraftData = await aircraftRes.json().catch(() => null)
      if (!aircraftRes.ok) throw new Error(aircraftData?.error ?? 'Failed to create aircraft')

      const readings: Record<string, number> = {}
      if (tach) readings.tach = Number(tach)
      if (hobbs) readings.hobbs = Number(hobbs)
      if (totalTime) readings.total_time = Number(totalTime)
      if (Object.keys(readings).length > 0) {
        await fetch(`/api/aircraft/${aircraftData.id}/time`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source: timeSource,
            ...readings,
            notes: 'Initial onboarding time entry',
          }),
        })
      }

      if (activateDue) {
        for (const candidate of dueTemplates.filter((item) => selectedDue.has(item.title))) {
          await fetch(`/api/aircraft/${aircraftData.id}/due-items`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: candidate.title,
              description: `${candidate.reason}\n\nCreated from onboarding due-list review.`,
              status: 'needs_review',
              source_type: 'ai',
              due_basis: candidate.title.includes('Oil') ? 'tach' : 'calendar',
              business_category: candidate.category,
              confidence: 'low',
              review_state: 'suggested',
              classification_source: 'ai',
              classification_status: 'suggested',
            }),
          })
        }
      }

      router.push(`/aircraft/${aircraftData.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create aircraft')
    } finally {
      setSaving(false)
    }
  }

  function toggleDue(title: string) {
    setSelectedDue((current) => {
      const next = new Set(current)
      if (next.has(title)) next.delete(title)
      else next.add(title)
      return next
    })
  }

  return (
    <main className="mx-auto w-full max-w-[1180px] px-4 py-5 sm:px-6 lg:px-8">
      <div className="mb-5 flex items-center justify-between gap-3">
        <Link href="/aircraft" className="inline-flex items-center gap-2 text-sm font-semibold text-blue-700">
          <ArrowLeft className="h-4 w-4" />
          Back to Aircraft
        </Link>
      </div>

      <section className="mb-5 rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-950">Add Aircraft</h1>
            <p className="mt-1 text-sm text-slate-600">N-number onboarding with owner/payee, time source, generated silhouette, and reviewable due-list setup.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {steps.map((item, index) => (
              <button
                key={item.id}
                type="button"
                onClick={() => index <= stepIndex ? setStep(item.id) : undefined}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                  item.id === step
                    ? 'border-blue-700 bg-blue-50 text-blue-700'
                    : index < stepIndex
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 bg-slate-50 text-slate-500'
                }`}
              >
                {index + 1}. {item.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {error ? <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          {step === 'find' ? (
            <StepBlock icon={Search} title="Find Aircraft by Tail Number">
              <p className="text-sm text-slate-600">We search the FAA registry to prefill aircraft identity. Review and correct the data before saving.</p>
              <div className="mt-5 flex gap-2">
                <input className={`${FIELD_CLASS} font-mono uppercase`} value={tailNumber} onChange={(e) => setTailNumber(normalizeTail(e.target.value))} placeholder="N12345" />
                <button className={BTN_PRIMARY} onClick={lookupAircraft} disabled={lookupLoading} type="button">
                  {lookupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  Lookup
                </button>
              </div>
              {lookupMessage ? <div className="mt-3 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">{lookupMessage}</div> : null}
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <input className={FIELD_CLASS} value={make} onChange={(e) => setMake(e.target.value)} placeholder="Make" />
                <input className={FIELD_CLASS} value={model} onChange={(e) => setModel(e.target.value)} placeholder="Model" />
                <input className={FIELD_CLASS} value={year} onChange={(e) => setYear(e.target.value)} placeholder="Year" type="number" />
                <input className={FIELD_CLASS} value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} placeholder="Serial number" />
                <input className={`${FIELD_CLASS} sm:col-span-2`} value={registeredOwner} onChange={(e) => setRegisteredOwner(e.target.value)} placeholder="Registered owner from registry" />
              </div>
            </StepBlock>
          ) : null}

          {step === 'payer' ? (
            <StepBlock icon={UserRound} title="Owner / Payee / Maintenance Customer">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="rounded-lg border border-slate-200 p-3">
                  <input type="radio" checked={payerMode === 'registered'} onChange={() => setPayerMode('registered')} className="mr-2" />
                  Use registered owner as maintenance payer
                </label>
                <label className="rounded-lg border border-slate-200 p-3">
                  <input type="radio" checked={payerMode === 'different'} onChange={() => setPayerMode('different')} className="mr-2" />
                  Add a different payer/customer
                </label>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <input className={FIELD_CLASS} value={payerName} onChange={(e) => setPayerName(e.target.value)} placeholder="Name or organization" />
                <input className={FIELD_CLASS} value={payerEmail} onChange={(e) => setPayerEmail(e.target.value)} placeholder="Email" type="email" />
                <input className={FIELD_CLASS} value={payerPhone} onChange={(e) => setPayerPhone(e.target.value)} placeholder="Phone" />
                <input className={FIELD_CLASS} value={payerAddress} onChange={(e) => setPayerAddress(e.target.value)} placeholder="Billing address (optional now)" />
              </div>
            </StepBlock>
          ) : null}

          {step === 'details' ? (
            <StepBlock icon={Plane} title="Aircraft Details and Operation Profile">
              <div className="grid gap-3 sm:grid-cols-2">
                <select className={FIELD_CLASS} value={aircraftCategory} onChange={(e) => setAircraftCategory(e.target.value)}>
                  <option value="airplane">Airplane</option>
                  <option value="rotorcraft">Rotorcraft</option>
                  <option value="glider">Glider</option>
                  <option value="experimental">Experimental</option>
                </select>
                <select className={FIELD_CLASS} value={aircraftClass} onChange={(e) => setAircraftClass(e.target.value)}>
                  <option value="single_engine_land">Single Engine Land</option>
                  <option value="multi_engine_land">Multi Engine Land</option>
                  <option value="helicopter">Helicopter</option>
                  <option value="jet">Jet</option>
                  <option value="unknown">Needs Review</option>
                </select>
                <select className={FIELD_CLASS} value={engineType} onChange={(e) => setEngineType(e.target.value)}>
                  <option value="piston">Piston</option>
                  <option value="turbine">Turbine</option>
                  <option value="jet">Jet</option>
                  <option value="turboprop">Turboprop</option>
                  <option value="electric">Electric</option>
                  <option value="unknown">Unknown</option>
                </select>
                <input className={FIELD_CLASS} value={engineCount} onChange={(e) => setEngineCount(e.target.value)} type="number" min="0" placeholder="Engine count" />
                <input className={FIELD_CLASS} value={homeBase} onChange={(e) => setHomeBase(e.target.value.toUpperCase())} placeholder="Home base, e.g. KSDL" />
                <select className={FIELD_CLASS} value={operationType} onChange={(e) => setOperationType(e.target.value)}>
                  {OPERATION_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                <select className={FIELD_CLASS} value={maintenanceProgram} onChange={(e) => setMaintenanceProgram(e.target.value)}>
                  <option value="annual">Annual</option>
                  <option value="100_hour">100-hour</option>
                  <option value="progressive">Progressive</option>
                  <option value="manufacturer_program">Manufacturer Program</option>
                  <option value="part_135_program">Part 135 Program</option>
                  <option value="custom">Custom</option>
                </select>
                <textarea className={`${FIELD_CLASS} min-h-24 sm:col-span-2`} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes or missing identity details" />
              </div>
            </StepBlock>
          ) : null}

          {step === 'time' ? (
            <StepBlock icon={Clock3} title="Current Times and Source">
              <div className="grid gap-3 sm:grid-cols-3">
                <input className={FIELD_CLASS} value={tach} onChange={(e) => setTach(e.target.value)} placeholder="Tach" type="number" step="0.1" />
                <input className={FIELD_CLASS} value={hobbs} onChange={(e) => setHobbs(e.target.value)} placeholder="Hobbs" type="number" step="0.1" />
                <input className={FIELD_CLASS} value={totalTime} onChange={(e) => setTotalTime(e.target.value)} placeholder="Total Time" type="number" step="0.1" />
              </div>
              <select className={`${FIELD_CLASS} mt-3`} value={timeSource} onChange={(e) => setTimeSource(e.target.value)}>
                <option value="mechanic_verified">Mechanic verified</option>
                <option value="owner_entered">Owner entered</option>
                <option value="work_order_closeout">Work order closeout</option>
                <option value="logbook">Logbook</option>
                <option value="airbly">Airbly / direct tracking</option>
                <option value="scheduling">Scheduling software</option>
                <option value="adsb_estimate">ADS-B estimate</option>
              </select>
              <label className="mt-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <input type="checkbox" checked={adsbFallback} onChange={(e) => setAdsbFallback(e.target.checked)} className="mt-1" />
                <span>Allow ADS-B estimated fallback for soft forecasting only. It will not become verified Tach/Hobbs.</span>
              </label>
            </StepBlock>
          ) : null}

          {step === 'due' ? (
            <StepBlock icon={Bot} title="AI Due List Setup">
              <p className="text-sm text-slate-600">These are draft candidates only. Activate them if you want reviewable due items created with the aircraft.</p>
              <label className="mt-4 flex items-center gap-3 rounded-lg border border-slate-200 p-3">
                <input type="checkbox" checked={activateDue} onChange={(e) => setActivateDue(e.target.checked)} />
                <span className="font-semibold text-slate-900">Create selected candidates as Needs Review</span>
              </label>
              <div className="mt-4 space-y-2">
                {dueTemplates.map((item) => (
                  <label key={item.title} className="flex items-start gap-3 rounded-lg border border-slate-200 p-3">
                    <input type="checkbox" checked={selectedDue.has(item.title)} onChange={() => toggleDue(item.title)} className="mt-1" />
                    <span>
                      <span className="block font-semibold text-slate-950">{item.title}</span>
                      <span className="block text-sm text-slate-500">{item.category} · {item.reason}</span>
                    </span>
                  </label>
                ))}
              </div>
            </StepBlock>
          ) : null}

          {step === 'create' ? (
            <StepBlock icon={ShieldCheck} title="Review and Create Aircraft">
              <div className="space-y-3 text-sm">
                <ReviewRow label="Aircraft" value={`${tailNumber || 'N-number'} · ${[make, model].filter(Boolean).join(' ') || 'details need review'}`} />
                <ReviewRow label="Owner / payer" value={payerName || registeredOwner || 'Not assigned'} />
                <ReviewRow label="Operation" value={operationType.replace(/_/g, ' ')} />
                <ReviewRow label="Time source" value={timeSource.replace(/_/g, ' ')} />
                <ReviewRow label="Due candidates" value={activateDue ? `${selectedDue.size} will be created as Needs Review` : 'No due items created yet'} />
              </div>
              <button onClick={createAircraft} disabled={saving} className={`${BTN_PRIMARY} mt-5 w-full`}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Create Aircraft
              </button>
            </StepBlock>
          ) : null}

          <div className="mt-6 flex justify-between">
            <button onClick={previousStep} className={BTN_SECONDARY} disabled={stepIndex === 0}>Back</button>
            {step !== 'create' ? <button onClick={nextStep} className={BTN_PRIMARY}>Next</button> : null}
          </div>
        </section>

        <aside className="space-y-4">
          <AircraftSilhouette tailNumber={tailNumber || 'N-----'} style={silhouetteStyle} className="h-56 w-full" />
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="font-bold text-slate-950">Onboarding Rules</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              <li>No official aircraft is saved until final create.</li>
              <li>Photo upload is optional after onboarding.</li>
              <li>Verified and estimated time stay separate.</li>
              <li>AI due items are suggestions until human review.</li>
            </ul>
          </div>
        </aside>
      </div>
    </main>
  )
}

function StepBlock({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
          <Icon className="h-5 w-5" />
        </div>
        <h2 className="text-xl font-bold text-slate-950">{title}</h2>
      </div>
      {children}
    </div>
  )
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-slate-200 px-3 py-2">
      <span className="font-semibold text-slate-500">{label}</span>
      <span className="text-right font-bold capitalize text-slate-950">{value}</span>
    </div>
  )
}
