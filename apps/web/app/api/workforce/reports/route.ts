/**
 * SOP-WRK-001 §11 — workforce report CSV export.
 *
 *   GET ?type=<reportId>&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Mechanics cannot export reports; the audit report needs an audit-viewing
 * role. Role is resolved and checked server-side.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/server'
import { getRequestUser } from '@/lib/supabase/request-user'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { runReport, reportDef } from '@/lib/workforce/reports'

type WorkforceRole = 'admin' | 'manager' | 'mechanic' | 'payroll_admin' | 'auditor'

async function resolveWorkforceRole(
  service: ReturnType<typeof createServiceSupabase>,
  organizationId: string,
  userId: string,
  membershipRole: string,
): Promise<WorkforceRole> {
  const { data } = await service
    .from('workforce_employee_profiles')
    .select('workforce_role')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .maybeSingle()
  if (data?.workforce_role) return data.workforce_role as WorkforceRole
  return ['owner', 'admin'].includes(membershipRole) ? 'admin' : 'mechanic'
}

function csvCell(v: string | number): string {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export async function GET(req: NextRequest) {
  const user = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const reqCtx = await resolveRequestOrgContext(req)
  if (!reqCtx) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  const sp = req.nextUrl.searchParams
  const type = sp.get('type') ?? ''
  const def = reportDef(type)
  if (!def) return NextResponse.json({ error: 'Unknown report' }, { status: 404 })

  const orgId = reqCtx.organizationId
  const service = createServiceSupabase()
  const role = await resolveWorkforceRole(service, orgId, user.id, reqCtx.role)

  // SOP §11 — only admin/manager/payroll/auditor may run reports.
  if (!['admin', 'manager', 'payroll_admin', 'auditor'].includes(role)) {
    return NextResponse.json({ error: 'Not permitted to run reports.' }, { status: 403 })
  }
  // Audit report needs an audit-viewing role.
  if (def.auditGated && !['admin', 'payroll_admin', 'auditor'].includes(role)) {
    return NextResponse.json({ error: 'Not permitted to view the audit report.' }, { status: 403 })
  }

  const dateRe = /^\d{4}-\d{2}-\d{2}$/
  const today = new Date()
  const defFrom = new Date(today); defFrom.setDate(defFrom.getDate() - 13)
  const from = (sp.get('from') && dateRe.test(sp.get('from')!)) ? sp.get('from')! : defFrom.toISOString().slice(0, 10)
  const to = (sp.get('to') && dateRe.test(sp.get('to')!)) ? sp.get('to')! : today.toISOString().slice(0, 10)
  const fromIso = new Date(`${from}T00:00:00`).toISOString()
  const toEnd = new Date(`${to}T00:00:00`); toEnd.setDate(toEnd.getDate() + 1)
  const toIso = toEnd.toISOString()

  const result = await runReport(service, orgId, def.id, fromIso, toIso)
  const lines = [
    result.columns.map(csvCell).join(','),
    ...result.rows.map((r) => r.map(csvCell).join(',')),
  ]

  return new NextResponse(lines.join('\n') + '\n', {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${def.id}-${from}_${to}.csv"`,
    },
  })
}
