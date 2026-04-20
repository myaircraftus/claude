import { NextRequest, NextResponse } from 'next/server'
import { runBenchmarkEvaluation } from '@/lib/intelligence/quality'
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase()
  const service = createServiceSupabase()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()
  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const datasetId = body?.dataset_id as string | undefined
  const baselineLabel = body?.baseline_label as string | undefined
  const candidateLabel = body?.candidate_label as string | undefined

  if (!datasetId) {
    return NextResponse.json({ error: 'dataset_id required' }, { status: 400 })
  }

  const { data: dataset } = await service
    .from('benchmark_datasets')
    .select('id, organization_id, split, is_locked, name')
    .eq('id', datasetId)
    .maybeSingle()

  if (!dataset) {
    return NextResponse.json({ error: 'Benchmark dataset not found' }, { status: 404 })
  }

  if (dataset.organization_id && dataset.organization_id !== membership.organization_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const result = await runBenchmarkEvaluation({
    supabase: service,
    datasetId,
    organizationId: membership.organization_id,
    triggeredBy: user.id,
    baselineLabel: baselineLabel ?? `${dataset.name}-baseline`,
    candidateLabel: candidateLabel ?? `${dataset.name}-candidate`,
  })

  return NextResponse.json({
    success: true,
    dataset: {
      id: dataset.id,
      name: dataset.name,
      split: dataset.split,
      is_locked: dataset.is_locked,
    },
    result,
  })
}
