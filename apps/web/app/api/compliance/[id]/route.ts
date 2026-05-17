/**
 * PATCH /api/compliance/[id]
 *
 * Updates a single compliance_items row. Currently scoped to the ATA/JASC
 * classification fields written from the Due List side panel — the selector
 * saves the chosen code straight back onto the record.
 *
 * Body: { ata_code?, jasc_code?, classification_source?, classification_status? }
 * Response: the updated { id, ata_code, jasc_code, classification_status }.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAppServerSession } from '@/lib/auth/server-app'
import { buildClassificationPatch } from '@/lib/taxonomy/format'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { supabase, membership } = await requireAppServerSession()
  const orgId = membership.organization_id

  const body = await req.json().catch(() => ({}))

  let patch: Record<string, unknown>
  try {
    patch = buildClassificationPatch(body as Record<string, unknown>)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Invalid classification' },
      { status: 400 },
    )
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No updatable fields supplied' }, { status: 400 })
  }
  patch.updated_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('compliance_items')
    .update(patch)
    .eq('organization_id', orgId)
    .eq('id', params.id)
    .select('id, ata_code, jasc_code, classification_source, classification_status')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Compliance item not found' }, { status: 404 })

  return NextResponse.json(data)
}
