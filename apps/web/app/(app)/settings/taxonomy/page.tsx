import Link from 'next/link'
import { requireAppServerSession } from '@/lib/auth/server-app'
import { fetchAtaChapters, fetchJascCodes, searchTaxonomyRows } from '@/lib/taxonomy/queries'

export const metadata = { title: 'Settings - Taxonomy' }

const CLASSIFIED_MODULES = [
  { label: 'Due Items', table: 'compliance_items', ata: 'ata_code' },
  { label: 'Future To-Do', table: 'continued_items', ata: 'ata_code' },
  { label: 'Work Orders', table: 'work_orders', ata: 'primary_ata_code' },
  { label: 'Work Order Lines', table: 'work_order_lines', ata: 'ata_code' },
  { label: 'Estimate Lines', table: 'estimate_line_items', ata: 'ata_code' },
  { label: 'Parts Library', table: 'parts_library', ata: 'ata_code' },
  { label: 'Inventory', table: 'inventory_parts', ata: 'ata_code' },
  { label: 'Squawks', table: 'squawks', ata: 'confirmed_ata_code' },
  { label: 'Logbook', table: 'logbook_entries', ata: 'ata_code' },
] as const

async function countUnclassified(supabase: any, organizationId: string) {
  const results = await Promise.all(
    CLASSIFIED_MODULES.map(async (module) => {
      const { count } = await supabase
        .from(module.table)
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .or(`classification_status.in.(unclassified,needs_review),${module.ata}.is.null`)

      return { ...module, count: count ?? 0 }
    }),
  )

  return results
}

export default async function TaxonomySettingsPage({
  searchParams,
}: {
  searchParams?: { q?: string }
}) {
  const { supabase, membership } = await requireAppServerSession()
  const organizationId = membership.organization_id
  const q = (searchParams?.q ?? '').trim()

  if (!['owner', 'admin', 'mechanic'].includes(membership.role)) {
    return (
      <main className="min-h-screen bg-slate-50 p-8">
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <h1 className="text-2xl font-semibold text-slate-950">Taxonomy</h1>
          <p className="mt-2 text-sm text-slate-600">You do not have access to taxonomy administration.</p>
        </div>
      </main>
    )
  }

  try {
    const [ataRows, jascRows, importRuns, cleanupCounts, aircraftRows] = await Promise.all([
      fetchAtaChapters(supabase),
      fetchJascCodes(supabase, { limit: 1000 }),
      supabase
        .from('taxonomy_import_runs')
        .select('source, source_version, ata_count, jasc_count, created_at')
        .order('created_at', { ascending: false })
        .limit(1),
      countUnclassified(supabase, organizationId),
      supabase
        .from('aircraft')
        .select('id, tail_number, make, model')
        .eq('organization_id', organizationId)
        .eq('is_archived', false)
        .order('tail_number', { ascending: true })
        .limit(12),
    ])

    const ataByCode = new Map(ataRows.map((row) => [row.ata_code, row]))
    const searchRows = searchTaxonomyRows(jascRows, ataByCode, q).slice(0, q ? 25 : 12)
    const latestImport = importRuns.data?.[0] ?? null
    const totalUnclassified = cleanupCounts.reduce((sum, row) => sum + row.count, 0)

    return (
      <main className="min-h-screen bg-slate-50 p-8 text-slate-950">
        <div className="mx-auto max-w-7xl space-y-6">
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-blue-700">Settings</p>
              <h1 className="text-3xl font-semibold tracking-normal">Taxonomy</h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-600">
                ATA chapters and JASC codes are the shared classification layer for aircraft, due items,
                work orders, estimates, parts, squawks, logbook entries, and reports.
              </p>
            </div>
            <Link
              href="/api/taxonomy/unclassified"
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800"
            >
              Export cleanup JSON
            </Link>
          </header>

          <section className="grid gap-4 md:grid-cols-4">
            <MetricCard label="ATA Chapters" value={ataRows.length} detail="00 through 99 source slots" />
            <MetricCard label="JASC Codes" value={jascRows.length} detail="FAA-derived component codes" />
            <MetricCard label="Unclassified" value={totalUnclassified} detail="Records needing review" tone="amber" />
            <MetricCard
              label="Latest Import"
              value={latestImport ? latestImport.source_version : 'Not run'}
              detail={latestImport ? new Date(latestImport.created_at).toLocaleString() : 'Run pnpm import:jasc-ata'}
            />
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Search Codes</h2>
                <p className="text-sm text-slate-600">Search by system, component, ATA, JASC, or common text.</p>
              </div>
              <form className="flex w-full gap-2 sm:w-auto">
                <input
                  name="q"
                  defaultValue={q}
                  placeholder="brake, oil, ignition, 3240"
                  className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm sm:w-80"
                />
                <button className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white" type="submit">
                  Search
                </button>
              </form>
            </div>

            <div className="mt-5 divide-y divide-slate-100">
              {searchRows.map((row) => (
                <div key={row.jasc_code} className="grid gap-2 py-3 md:grid-cols-[1fr_auto]">
                  <div>
                    <p className="font-medium">{row.label}</p>
                    <p className="text-sm text-slate-600">{row.definition || 'No definition supplied.'}</p>
                  </div>
                  <p className="text-sm font-medium text-slate-500">{row.secondary_label}</p>
                </div>
              ))}
              {searchRows.length === 0 && (
                <p className="py-6 text-sm text-slate-600">No taxonomy matches found.</p>
              )}
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <h2 className="text-lg font-semibold">Aircraft Applicability</h2>
              <p className="mt-1 text-sm text-slate-600">
                Aircraft profiles filter irrelevant systems, and overrides can hide or relabel specific codes.
              </p>
              <div className="mt-4 divide-y divide-slate-100">
                {(aircraftRows.data ?? []).map((aircraft: any) => (
                  <Link
                    key={aircraft.id}
                    href={`/api/aircraft/${aircraft.id}/taxonomy/applicable`}
                    className="flex items-center justify-between py-3 text-sm"
                  >
                    <span>
                      <span className="font-medium">{aircraft.tail_number}</span>
                      <span className="ml-2 text-slate-500">{[aircraft.make, aircraft.model].filter(Boolean).join(' ')}</span>
                    </span>
                    <span className="text-blue-700">View applicable JSON</span>
                  </Link>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-5">
              <h2 className="text-lg font-semibold">Unclassified Records</h2>
              <p className="mt-1 text-sm text-slate-600">
                Codes remain optional so work is not blocked. These records should be reviewed during cleanup.
              </p>
              <div className="mt-4 divide-y divide-slate-100">
                {cleanupCounts.map((row) => (
                  <div key={row.table} className="flex items-center justify-between py-3 text-sm">
                    <span className="font-medium">{row.label}</span>
                    <span className={row.count > 0 ? 'text-amber-700' : 'text-emerald-700'}>{row.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </main>
    )
  } catch (error) {
    return (
      <main className="min-h-screen bg-slate-50 p-8">
        <div className="rounded-lg border border-amber-200 bg-white p-6">
          <h1 className="text-2xl font-semibold text-slate-950">Taxonomy setup pending</h1>
          <p className="mt-2 text-sm text-slate-600">
            {error instanceof Error ? error.message : 'Apply the taxonomy migration and import the JASC/ATA package.'}
          </p>
          <pre className="mt-4 rounded-md bg-slate-950 p-4 text-sm text-white">pnpm import:jasc-ata</pre>
        </div>
      </main>
    )
  }
}

function MetricCard({
  label,
  value,
  detail,
  tone = 'blue',
}: {
  label: string
  value: string | number
  detail: string
  tone?: 'blue' | 'amber'
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className={tone === 'amber' ? 'mt-2 text-3xl font-semibold text-amber-700' : 'mt-2 text-3xl font-semibold'}>
        {value}
      </p>
      <p className="mt-2 text-sm text-slate-600">{detail}</p>
    </div>
  )
}
