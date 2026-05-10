import { requireAppServerSession } from '@/lib/auth/server-app'
import { Topbar } from '@/components/shared/topbar'
import { ManualsView } from './manuals-view'
import { getOrgTier } from '@/lib/billing/tier-service'
import { createServiceSupabase } from '@/lib/supabase/server'
import type { Document, DocType } from '@/types'
import type { TierSlug } from '@/lib/billing/pricing-config'

export const metadata = { title: 'Manuals' }

/**
 * Manuals — mechanic-facing reference library.
 *
 * Mechanic uploads manufacturer reference (parts catalogs, AMMs, service
 * manuals, SBs) and tags each with the aircraft it applies to + the manual
 * type. The list groups by category so a mechanic looking for "engine
 * manual for the 152s" can find it fast. Asking against the manual
 * library happens INSIDE the aircraft view, not here.
 *
 * Identification: docs with uploader_role = 'mechanic' AND a manual-class
 * doc_type are considered manuals. Owner-uploaded aircraft documents
 * (logbooks, POH, etc. uploaded by aircraft owner) live in the per-aircraft
 * Documents tab and are kept separate from this list.
 */

const MANUAL_DOC_TYPES: DocType[] = [
  'parts_catalog',
  'maintenance_manual',
  'service_manual',
  'service_bulletin',
  'airworthiness_directive',
  'miscellaneous',
]

export default async function ManualsPage() {
  const { supabase, profile, membership } = await requireAppServerSession()
  const orgId = membership.organization_id

  // Phase 14 SLA banner needs the org's effective tier — same source the
  // /documents PersonaAwareUploadModal uses (Phase 15.5 F5 fix).
  let effectiveTier: TierSlug = 'beta'
  try {
    effectiveTier = await getOrgTier(createServiceSupabase() as any, orgId)
  } catch {
    /* fall back to 'beta' default — page still renders */
  }

  const [manualsRes, aircraftRes] = await Promise.all([
    supabase
      .from('documents')
      .select(`
        id, title, doc_type, document_subtype, parsing_status, file_size_bytes,
        mime_type, uploader_role, uploaded_at, created_at, updated_at,
        document_group_id, document_detail_id, completeness_relevance,
        truth_role, document_date, page_count, needs_human_review,
        human_review_reason, parse_error, aircraft_id,
        aircraft:aircraft_id (id, tail_number, make, model, year)
      `)
      .eq('organization_id', orgId)
      .in('doc_type', MANUAL_DOC_TYPES)
      .order('updated_at', { ascending: false })
      .limit(300),
    supabase
      .from('aircraft')
      .select('id, tail_number, make, model, year')
      .eq('organization_id', orgId)
      .eq('is_archived', false)
      .order('tail_number'),
  ])

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar profile={profile} breadcrumbs={[{ label: 'Manuals' }]} />
      <main className="flex-1 overflow-hidden">
        <ManualsView
          manuals={(manualsRes.data ?? []) as unknown as Document[]}
          aircraft={(aircraftRes.data ?? []) as Array<{ id: string; tail_number: string; make: string | null; model: string | null; year: number | null }>}
          effectiveTier={effectiveTier}
        />
      </main>
    </div>
  )
}
