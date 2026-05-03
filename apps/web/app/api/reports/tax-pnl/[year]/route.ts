/**
 * GET /api/reports/tax-pnl/[year]  (Spec 7.7)
 *
 * Returns a PDF binary stream of the org-wide tax-time P&L for the year.
 * Owner+/admin/auditor can read; other roles 403.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { buildTaxPnlReport } from '@/lib/reports/tax-pnl-generator'
import { renderTaxPnlPdf } from '@/lib/reports/pdf-generator'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const ALLOWED_ROLES = new Set(['owner', 'admin', 'auditor', 'mechanic'])
const MIN_YEAR = 2000
const MAX_YEAR = new Date().getUTCFullYear() + 1

export async function GET(_req: NextRequest, { params }: { params: { year: string } }) {
  const year = parseInt(params.year, 10)
  if (!Number.isFinite(year) || year < MIN_YEAR || year > MAX_YEAR) {
    return NextResponse.json({ error: `Year must be ${MIN_YEAR}–${MAX_YEAR}` }, { status: 400 })
  }

  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()
  if (!membership) return NextResponse.json({ error: 'No org' }, { status: 403 })
  if (!ALLOWED_ROLES.has(membership.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const report = await buildTaxPnlReport({
      supabase,
      organization_id: membership.organization_id,
      year,
    })
    const buf = await renderTaxPnlPdf(report)
    const filename = `aircraft-pnl-${year}-${(report.organization_name ?? 'organization').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}.pdf`
    return new NextResponse(buf as unknown as ArrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(buf.length),
        'Cache-Control': 'no-store',
      },
    })
  } catch (e) {
    console.error('[tax-pnl] render error:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Render failed' },
      { status: 500 },
    )
  }
}
