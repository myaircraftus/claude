/**
 * GET /logbook-entries/[id]
 *
 * Full-page logbook entry detail. The Ask AI surface deep-links here from
 * the LogbookEntriesArtifact "Open entry" CTA, so a user asking "find me
 * the latest annual" lands on the specific entry — not the aircraft profile.
 *
 * Renders: date, entry/logbook type, tach/total/Hobbs, full description,
 * AD numbers, references, parts used, mechanic signature, linked work order,
 * and (if linked) a deeplink to the source document at the cited page.
 */

import { redirect, notFound } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { LogbookEntryDetail } from '@/components/logbook/logbook-entry-detail'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: { id: string }
}

export default async function LogbookEntryPage({ params }: PageProps) {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/login?redirect=/logbook-entries/${params.id}`)

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .limit(1)
    .single()
  if (!membership) redirect('/onboarding')

  const { data: entry } = await supabase
    .from('logbook_entries')
    .select(
      `
      id, entry_date, entry_type, logbook_type, status,
      description, tach_time, total_time, hobbs_in, hobbs_out,
      parts_used, references_used, ad_numbers,
      mechanic_name, mechanic_cert_number, cert_type,
      signed_at, signed_by, work_order_id, work_order_ref,
      target_logbook, source_type, source_id, source_context, source_references,
      signer_id, certificate_number, certificate_type, ia_flag, revision_number,
      supersedes_entry_id, entry_hash, pdf_hash, signature_reason, owner_visible,
      ai_review_status, ai_warnings, signature_certificate_id, signature_audit,
      printed_unsigned_at, published_to_owner_at, void_reason,
      created_at, updated_at,
      aircraft:aircraft_id ( id, tail_number, make, model, year ),
      work_order:work_order_id ( id, work_order_number, service_type, status ),
      signature_certificate:signature_certificate_id (*),
      source_bundle:logbook_source_bundles (*),
      revisions:logbook_entry_revisions (*),
      output_events:logbook_output_events (*)
    `,
    )
    .eq('id', params.id)
    .eq('organization_id', membership.organization_id)
    .maybeSingle()

  if (!entry) notFound()

  return <LogbookEntryDetail entry={entry as any} />
}
