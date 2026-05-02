import { redirect } from 'next/navigation'
import { requireAppServerSession } from '@/lib/auth/server-app'
import { Topbar } from '@/components/shared/topbar'
import { ProcedureEditClient } from './edit-client'
import { createServerSupabase } from '@/lib/supabase/server'

export const metadata = { title: 'Edit procedure' }

/**
 * Procedure edit page (Spec 1.3). Mounts the ProcedureBuilder in edit mode
 * pre-loaded with the procedure's sections+items. Server pre-fetches once
 * so the editor opens instantly.
 */
export default async function ProcedureEditPage({
  params,
}: {
  params: { id: string }
}) {
  const { profile, membership } = await requireAppServerSession()
  const supabase = createServerSupabase()
  const { data } = await supabase
    .from('procedures')
    .select(`
      id, organization_id, name, description, applies_to, is_archived,
      created_by, created_at, updated_at,
      sections:procedure_sections (
        id, procedure_id, title, sort_order, created_at, updated_at,
        items:procedure_items (
          id, procedure_section_id, text, input_type, reference,
          requires_photo, sort_order, created_at, updated_at
        )
      )
    `)
    .eq('id', params.id)
    .eq('organization_id', membership.organization_id)
    .maybeSingle()

  if (!data) redirect('/procedures')

  const sorted = {
    ...(data as any),
    sections: (Array.isArray((data as any).sections) ? (data as any).sections : [])
      .slice()
      .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((s: any) => ({
        ...s,
        items: (Array.isArray(s.items) ? s.items : [])
          .slice()
          .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
      })),
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar
        profile={profile}
        breadcrumbs={[
          { label: 'Procedures', href: '/procedures' },
          { label: (data as { name: string }).name },
        ]}
      />
      <main className="flex-1 overflow-y-auto p-6 max-w-4xl mx-auto w-full">
        <ProcedureEditClient initialProcedure={sorted} />
      </main>
    </div>
  )
}
