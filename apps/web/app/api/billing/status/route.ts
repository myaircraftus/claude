import { NextRequest, NextResponse } from 'next/server'
import { resolveRequestOrgContext } from '@/lib/auth/context'
import { getOrganizationBillingStatus } from '@/lib/billing/gate'

export async function GET(req: NextRequest) {
  const ctx = await resolveRequestOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const status = await getOrganizationBillingStatus(ctx.organizationId)
  return NextResponse.json(status)
}
