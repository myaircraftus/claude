import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabase } from '@/lib/supabase/server'

export async function POST(
  req: NextRequest,
  { params }: { params: { provider: string } }
) {
  const { provider } = params

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const supabase = createServiceSupabase()

  // Log receipt
  console.log(`[webhook/${provider}] received:`, JSON.stringify(body).slice(0, 300))

  // Find the connected integration for this provider
  const { data: integration } = await supabase
    .from('integrations')
    .select('id, organization_id, settings')
    .eq('provider', provider)
    .eq('status', 'connected')
    .limit(1)
    .maybeSingle()

  if (!integration) {
    console.warn(`[webhook/${provider}] no connected integration found`)
    return NextResponse.json({ error: 'Integration not found or not connected' }, { status: 404 })
  }

  // Persist raw webhook log
  await supabase.from('integration_sync_logs').insert({
    integration_id: integration.id,
    organization_id: integration.organization_id,
    sync_type: 'webhook',
    status: 'started',
    raw_response: body,
    started_at: new Date().toISOString(),
  })

  // Dispatch to provider-specific handler
  try {
    switch (provider) {
      case 'flight_schedule_pro':
        await handleFlightScheduleProWebhook(supabase, integration, body)
        break
      case 'flight_circle':
        await handleFlightCircleWebhook(supabase, integration, body)
        break
      default:
        console.info(`[webhook/${provider}] no handler implemented — logged only`)
    }
  } catch (err: any) {
    console.error(`[webhook/${provider}] handler error:`, err)
    await supabase.from('integration_sync_logs').insert({
      integration_id: integration.id,
      organization_id: integration.organization_id,
      sync_type: 'webhook',
      status: 'error',
      error_message: err.message ?? 'Unknown error',
      started_at: new Date().toISOString(),
    })
    return NextResponse.json({ error: 'Processing error', detail: err.message }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}

// ─── Flight Schedule Pro ──────────────────────────────────────────────────────

async function handleFlightScheduleProWebhook(
  supabase: any,
  integration: { id: string; organization_id: string; settings: any },
  body: any
) {
  const eventType: string = body.event_type ?? body.eventType ?? ''

  if (eventType === 'flight_completed' || eventType === 'tach_updated') {
    const aircraftData = body.aircraft ?? {}
    const tailNumber: string =
      aircraftData.registration ?? aircraftData.tail_number ?? aircraftData.tailNumber ?? ''

    if (!tailNumber) {
      console.warn('[fsp webhook] flight_completed: no tail number in payload')
      return
    }

    const { data: aircraft } = await supabase
      .from('aircraft')
      .select('id')
      .eq('organization_id', integration.organization_id)
      .eq('tail_number', tailNumber.toUpperCase())
      .single()

    if (!aircraft) {
      console.warn(`[fsp webhook] aircraft ${tailNumber} not found in org`)
      return
    }

    const tachTime: number | undefined =
      aircraftData.tach_time ?? aircraftData.tachTime ?? body.tach_time

    if (tachTime !== undefined && tachTime > 0) {
      await supabase
        .from('aircraft')
        .update({ total_time_hours: tachTime, updated_at: new Date().toISOString() })
        .eq('id', aircraft.id)

      console.info(`[fsp webhook] updated ${tailNumber} total_time_hours → ${tachTime}`)
    }

    // Update last sync on the integration
    await supabase
      .from('integrations')
      .update({ last_sync_at: new Date().toISOString(), last_sync_status: 'success' })
      .eq('id', integration.id)
  }
}

// ─── Flight Circle ────────────────────────────────────────────────────────────

async function handleFlightCircleWebhook(
  supabase: any,
  integration: { id: string; organization_id: string; settings: any },
  body: any
) {
  const eventType: string = body.type ?? body.event ?? ''

  if (
    eventType === 'reservation_completed' ||
    eventType === 'flight_ended' ||
    eventType === 'hobbs_updated'
  ) {
    const aircraftData = body.aircraft ?? body.resource ?? {}
    const tailNumber: string =
      aircraftData.tail_number ?? aircraftData.registration ?? ''

    if (!tailNumber) return

    const { data: aircraft } = await supabase
      .from('aircraft')
      .select('id')
      .eq('organization_id', integration.organization_id)
      .eq('tail_number', tailNumber.toUpperCase())
      .single()

    if (!aircraft) return

    const hobbsTime: number | undefined =
      aircraftData.hobbs ?? aircraftData.hobbs_end ?? body.hobbs_time

    if (hobbsTime !== undefined && hobbsTime > 0) {
      await supabase
        .from('aircraft')
        .update({ total_time_hours: hobbsTime, updated_at: new Date().toISOString() })
        .eq('id', aircraft.id)

      console.info(`[fc webhook] updated ${tailNumber} total_time_hours → ${hobbsTime}`)
    }

    await supabase
      .from('integrations')
      .update({ last_sync_at: new Date().toISOString(), last_sync_status: 'success' })
      .eq('id', integration.id)
  }
}
