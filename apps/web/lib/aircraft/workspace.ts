export type AircraftSilhouetteStyle =
  | 'single_engine_piston'
  | 'multi_engine_piston'
  | 'turboprop'
  | 'jet'
  | 'helicopter'
  | 'glider'
  | 'unknown'

export type AircraftWorkspaceStatus =
  | 'active'
  | 'in_maintenance'
  | 'grounded'
  | 'archived'
  | 'needs_review'

const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  in_maintenance: 'In Maintenance',
  grounded: 'Grounded',
  archived: 'Archived',
  needs_review: 'Needs Review',
}

export function formatWorkspaceStatus(value?: string | null) {
  return STATUS_LABELS[value ?? ''] ?? 'Active'
}

export function inferSilhouetteStyle(input: {
  make?: string | null
  model?: string | null
  aircraft_category?: string | null
  aircraft_class?: string | null
  taxonomy_aircraft_kind?: string | null
  taxonomy_engine_type?: string | null
  taxonomy_engine_count?: number | null
  engine_type?: string | null
  engine_count?: number | null
}): AircraftSilhouetteStyle {
  const haystack = [
    input.make,
    input.model,
    input.aircraft_category,
    input.aircraft_class,
    input.taxonomy_aircraft_kind,
    input.taxonomy_engine_type,
    input.engine_type,
  ].filter(Boolean).join(' ').toLowerCase()

  if (haystack.includes('helicopter') || haystack.includes('rotor')) return 'helicopter'
  if (haystack.includes('glider')) return 'glider'
  if (haystack.includes('jet')) return 'jet'
  if (haystack.includes('turboprop')) return 'turboprop'

  const engineCount = input.engine_count ?? input.taxonomy_engine_count ?? null
  if (engineCount && engineCount > 1) return 'multi_engine_piston'
  if (haystack.includes('turbine')) return 'turboprop'
  if (haystack.includes('piston') || engineCount === 1) return 'single_engine_piston'

  return 'unknown'
}

export function formatHours(value?: number | string | null, digits = 1) {
  if (value === null || value === undefined || value === '') return '—'
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return '—'
  return numeric.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

export function formatDate(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function normalizeDueStatus(status?: string | null) {
  switch (status) {
    case 'overdue':
      return { label: 'Overdue', className: 'bg-red-50 text-red-700 border-red-200' }
    case 'due_now':
      return { label: 'Due now', className: 'bg-rose-50 text-rose-700 border-rose-200' }
    case 'due_soon':
      return { label: 'Due soon', className: 'bg-amber-50 text-amber-700 border-amber-200' }
    case 'upcoming':
      return { label: 'Upcoming', className: 'bg-blue-50 text-blue-700 border-blue-200' }
    case 'complied':
      return { label: 'Complied', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
    case 'deferred':
      return { label: 'Deferred', className: 'bg-slate-50 text-slate-700 border-slate-200' }
    case 'not_applicable':
      return { label: 'N/A', className: 'bg-slate-50 text-slate-500 border-slate-200' }
    default:
      return { label: 'Needs review', className: 'bg-orange-50 text-orange-700 border-orange-200' }
  }
}

export function buildAircraftLaunchContext(aircraft: {
  id: string
  tail_number?: string | null
  owner_customer_id?: string | null
  maintenance_payer_customer_id?: string | null
}) {
  return {
    source_context: 'aircraft_workspace',
    aircraft_id: aircraft.id,
    tail_number: aircraft.tail_number ?? '',
    owner_id: aircraft.maintenance_payer_customer_id ?? aircraft.owner_customer_id ?? null,
    launch_route: `/aircraft/${aircraft.id}`,
  }
}

export function getReadableTaxonomyLabel(item: {
  ata_code?: string | null
  jasc_code?: string | null
  ata?: { title?: string | null } | null
  jasc?: { title?: string | null } | null
}) {
  const title = [item.ata?.title, item.jasc?.title].filter(Boolean).join(' / ')
  const codes = [
    item.ata_code ? `ATA ${item.ata_code}` : null,
    item.jasc_code ? `JASC ${item.jasc_code}` : null,
  ].filter(Boolean).join(' · ')
  if (title && codes) return `${title} - ${codes}`
  return title || codes || 'Unclassified'
}
