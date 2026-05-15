import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { createServerSupabase } from '@/lib/supabase/server'

const ADMIN_ROLES = new Set(['owner', 'admin', 'mechanic'])

const SOURCES = [
  {
    module: 'due_items',
    table: 'compliance_items',
    labelColumn: 'title',
    ataColumn: 'ata_code',
    jascColumn: 'jasc_code',
    select: 'id, aircraft_id, title, status, ata_code, jasc_code, classification_status, updated_at',
  },
  {
    module: 'future_to_do',
    table: 'continued_items',
    labelColumn: 'description',
    ataColumn: 'ata_code',
    jascColumn: 'jasc_code',
    select: 'id, aircraft_id, description, status, ata_code, jasc_code, classification_status, updated_at',
  },
  {
    module: 'work_orders',
    table: 'work_orders',
    labelColumn: 'work_order_number',
    ataColumn: 'primary_ata_code',
    jascColumn: 'primary_jasc_code',
    select: 'id, aircraft_id, work_order_number, status, primary_ata_code, primary_jasc_code, classification_status, updated_at',
  },
  {
    module: 'work_order_lines',
    table: 'work_order_lines',
    labelColumn: 'description',
    ataColumn: 'ata_code',
    jascColumn: 'jasc_code',
    select: 'id, work_order_id, description, line_type, ata_code, jasc_code, classification_status, created_at',
  },
  {
    module: 'estimate_lines',
    table: 'estimate_line_items',
    labelColumn: 'description',
    ataColumn: 'ata_code',
    jascColumn: 'jasc_code',
    select: 'id, estimate_id, description, item_type, ata_code, jasc_code, classification_status, created_at',
  },
  {
    module: 'parts',
    table: 'parts_library',
    labelColumn: 'title',
    ataColumn: 'ata_code',
    jascColumn: 'jasc_code',
    select: 'id, part_number, title, category, ata_code, jasc_code, classification_status, updated_at',
  },
  {
    module: 'inventory',
    table: 'inventory_parts',
    labelColumn: 'description',
    ataColumn: 'ata_code',
    jascColumn: 'jasc_code',
    select: 'id, part_number, description, category, ata_code, jasc_code, classification_status, updated_at',
  },
  {
    module: 'squawks',
    table: 'squawks',
    labelColumn: 'title',
    ataColumn: 'confirmed_ata_code',
    jascColumn: 'confirmed_jasc_code',
    select: 'id, aircraft_id, title, severity, status, confirmed_ata_code, confirmed_jasc_code, suggested_ata_code, suggested_jasc_code, classification_status, updated_at',
  },
  {
    module: 'logbook',
    table: 'logbook_entries',
    labelColumn: 'description',
    ataColumn: 'ata_code',
    jascColumn: 'jasc_code',
    select: 'id, aircraft_id, description, entry_type, entry_date, ata_code, jasc_code, classification_status, updated_at',
  },
] as const

export async function GET(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ADMIN_ROLES.has(ctx.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const limit = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get('limit') ?? '25', 10) || 25, 1), 100)
  const supabase = createServerSupabase()

  try {
    const results = await Promise.all(
      SOURCES.map(async (source) => {
        let query = supabase
          .from(source.table)
          .select(source.select)
          .eq('organization_id', ctx.organizationId)
          .or(`classification_status.in.(unclassified,needs_review),${source.ataColumn}.is.null`)
          .limit(limit)

        const { data, error } = await query
        if (error) throw new Error(`${source.table}: ${error.message}`)

        return (data ?? []).map((record: any) => ({
          module: source.module,
          table: source.table,
          id: record.id,
          label: record[source.labelColumn],
          ata_code: record[source.ataColumn] ?? null,
          jasc_code: record[source.jascColumn] ?? null,
          classification_status: record.classification_status ?? 'unclassified',
          record,
        }))
      }),
    )

    const records = results.flat()
    return NextResponse.json({
      total: records.length,
      records,
      by_module: records.reduce<Record<string, number>>((acc, row) => {
        acc[row.module] = (acc[row.module] ?? 0) + 1
        return acc
      }, {}),
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load unclassified records' },
      { status: 500 },
    )
  }
}
