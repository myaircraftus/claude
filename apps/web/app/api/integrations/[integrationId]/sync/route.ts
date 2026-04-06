// POST /api/integrations/[integrationId]/sync — Manually trigger a sync for a connected integration
// Supports: Flight Schedule Pro, Flight Circle, etc.

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

export const maxDuration = 30

export async function POST(
  _req: NextRequest,
  { params }: { params: { integrationId: string } }
) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)
    .single()
  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const orgId = (membership as any).organization_id

  // Fetch integration record
  const { data: integration } = await supabase
    .from('integrations')
    .select('*')
    .eq('id', params.integrationId)
    .eq('organization_id', orgId)
    .single()

  if (!integration) return NextResponse.json({ error: 'Integration not found' }, { status: 404 })
  if (integration.status !== 'connected') {
    return NextResponse.json({ error: 'Integration is not connected' }, { status: 400 })
  }

  const credentials = integration.credentials_encrypted ?? {}
  const provider = integration.provider
  let syncResult: SyncResult

  try {
    switch (provider) {
      case 'flight_schedule_pro':
        syncResult = await syncFlightSchedulePro(credentials, orgId, supabase)
        break
      case 'flight_circle':
        syncResult = await syncFlightCircle(credentials, orgId, supabase)
        break
      default:
        return NextResponse.json({ error: `Sync not implemented for provider: ${provider}` }, { status: 400 })
    }
  } catch (err: any) {
    // Log failure
    await supabase.from('integration_sync_logs').insert({
      integration_id: params.integrationId,
      organization_id: orgId,
      sync_type: 'manual',
      status: 'failed',
      error_message: err?.message ?? 'Unknown error',
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    })
    await supabase
      .from('integrations')
      .update({ last_sync_status: 'failed', last_sync_error: err?.message ?? 'Unknown error', updated_at: new Date().toISOString() })
      .eq('id', params.integrationId)

    return NextResponse.json({ error: `Sync failed: ${err?.message}` }, { status: 500 })
  }

  // Log success
  await supabase.from('integration_sync_logs').insert({
    integration_id: params.integrationId,
    organization_id: orgId,
    sync_type: 'manual',
    status: 'success',
    records_synced: syncResult.recordsSynced,
    summary: syncResult.summary,
    started_at: syncResult.startedAt,
    completed_at: new Date().toISOString(),
  })

  await supabase
    .from('integrations')
    .update({
      last_sync_at: new Date().toISOString(),
      last_sync_status: 'success',
      last_sync_error: null,
      aircraft_count_synced: syncResult.aircraftSynced,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.integrationId)

  return NextResponse.json({
    success: true,
    provider,
    records_synced: syncResult.recordsSynced,
    aircraft_synced: syncResult.aircraftSynced,
    summary: syncResult.summary,
  })
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface SyncResult {
  recordsSynced: number
  aircraftSynced: number
  summary: Record<string, unknown>
  startedAt: string
}

// ─── Flight Schedule Pro sync ────────────────────────────────────────────────

async function syncFlightSchedulePro(
  credentials: any,
  orgId: string,
  supabase: any
): Promise<SyncResult> {
  const startedAt = new Date().toISOString()
  const apiKey = credentials.api_key
  const accountId = credentials.account_id
  if (!apiKey) throw new Error('Missing API key for Flight Schedule Pro')

  const baseUrl = 'https://app.flightschedulepro.com/api/v1'
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }
  if (accountId) headers['X-Account-Id'] = accountId

  // 1. Sync aircraft fleet
  let aircraftSynced = 0
  let recordsSynced = 0
  const squawksSynced: string[] = []

  try {
    const acResp = await fetch(`${baseUrl}/aircraft`, { headers, signal: AbortSignal.timeout(15000) })
    if (!acResp.ok) throw new Error(`FSP aircraft API returned ${acResp.status}: ${await acResp.text()}`)
    const acData = await acResp.json()
    const fspAircraft: any[] = Array.isArray(acData) ? acData : (acData.data ?? acData.aircraft ?? [])

    for (const fspAc of fspAircraft) {
      const tail = fspAc.tailNumber ?? fspAc.tail_number ?? fspAc.registration
      if (!tail) continue

      // Upsert aircraft by tail number within this org
      const { data: existingAc } = await supabase
        .from('aircraft')
        .select('id')
        .eq('organization_id', orgId)
        .ilike('tail_number', tail)
        .single()

      if (existingAc) {
        // Update times from FSP
        const updates: Record<string, any> = { updated_at: new Date().toISOString() }
        if (fspAc.totalTime != null || fspAc.total_time != null) {
          updates.total_time_hours = fspAc.totalTime ?? fspAc.total_time
        }
        if (fspAc.hobbs != null) updates.hobbs_time = fspAc.hobbs
        if (fspAc.tach != null) updates.tach_time = fspAc.tach
        await supabase.from('aircraft').update(updates).eq('id', existingAc.id)
        aircraftSynced++
      }
      recordsSynced++
    }
  } catch (err: any) {
    // Aircraft sync failed — continue to try squawks
    console.error('[FSP sync] aircraft error:', err.message)
  }

  // 2. Sync squawks (maintenance items / discrepancies)
  try {
    const sqResp = await fetch(`${baseUrl}/squawks`, { headers, signal: AbortSignal.timeout(15000) })
    if (sqResp.ok) {
      const sqData = await sqResp.json()
      const fspSquawks: any[] = Array.isArray(sqData) ? sqData : (sqData.data ?? sqData.squawks ?? [])

      for (const fspSq of fspSquawks) {
        const tail = fspSq.tailNumber ?? fspSq.tail_number ?? fspSq.aircraft?.registration
        if (!tail || !fspSq.description) continue

        // Find matching aircraft
        const { data: ac } = await supabase
          .from('aircraft')
          .select('id')
          .eq('organization_id', orgId)
          .ilike('tail_number', tail)
          .single()

        if (!ac) continue

        // Upsert squawk (use FSP ID as part of source_metadata to avoid duplicates)
        const fspId = fspSq.id ?? fspSq.squawkId ?? `fsp-${fspSq.description.slice(0, 30)}`
        const { data: existing } = await supabase
          .from('squawks')
          .select('id')
          .eq('organization_id', orgId)
          .eq('aircraft_id', ac.id)
          .contains('source_metadata', { fsp_id: fspId })
          .maybeSingle()

        if (!existing) {
          await supabase.from('squawks').insert({
            organization_id: orgId,
            aircraft_id: ac.id,
            title: (fspSq.description ?? '').slice(0, 200),
            description: fspSq.description,
            severity: mapFspSeverity(fspSq.severity ?? fspSq.priority),
            status: fspSq.resolved ? 'resolved' : 'open',
            source: 'flight_schedule_pro',
            source_metadata: { fsp_id: fspId, raw: fspSq },
            reported_at: fspSq.reportedDate ?? fspSq.created_at ?? new Date().toISOString(),
          })
          squawksSynced.push(fspId)
          recordsSynced++
        }
      }
    }
  } catch (err: any) {
    console.error('[FSP sync] squawks error:', err.message)
  }

  // 3. Sync flight activity (for tach/hobbs updates)
  try {
    const flightResp = await fetch(`${baseUrl}/flights?limit=50&sort=-date`, { headers, signal: AbortSignal.timeout(15000) })
    if (flightResp.ok) {
      const flightData = await flightResp.json()
      const flights: any[] = Array.isArray(flightData) ? flightData : (flightData.data ?? flightData.flights ?? [])

      for (const flight of flights.slice(0, 50)) {
        const tail = flight.tailNumber ?? flight.tail_number ?? flight.aircraft?.registration
        if (!tail) continue

        const { data: ac } = await supabase
          .from('aircraft')
          .select('id')
          .eq('organization_id', orgId)
          .ilike('tail_number', tail)
          .single()

        if (ac && (flight.hobbsEnd ?? flight.hobbs_end)) {
          await supabase
            .from('aircraft')
            .update({
              hobbs_time: flight.hobbsEnd ?? flight.hobbs_end,
              tach_time: flight.tachEnd ?? flight.tach_end ?? undefined,
              updated_at: new Date().toISOString(),
            })
            .eq('id', ac.id)
          recordsSynced++
        }
      }
    }
  } catch (err: any) {
    console.error('[FSP sync] flights error:', err.message)
  }

  return {
    recordsSynced,
    aircraftSynced,
    summary: {
      aircraft_updated: aircraftSynced,
      squawks_imported: squawksSynced.length,
      total_records: recordsSynced,
    },
    startedAt,
  }
}

function mapFspSeverity(s: string | undefined): string {
  if (!s) return 'normal'
  const lower = s.toLowerCase()
  if (lower.includes('ground') || lower.includes('critical')) return 'grounding'
  if (lower.includes('urgent') || lower.includes('high')) return 'urgent'
  if (lower.includes('low') || lower.includes('minor')) return 'minor'
  return 'normal'
}

// ─── Flight Circle sync ──────────────────────────────────────────────────────

async function syncFlightCircle(
  credentials: any,
  orgId: string,
  supabase: any
): Promise<SyncResult> {
  const startedAt = new Date().toISOString()
  const apiKey = credentials.api_key
  if (!apiKey) throw new Error('Missing API key for Flight Circle')

  const baseUrl = 'https://api.flightcircle.com/v1'
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }

  let aircraftSynced = 0
  let recordsSynced = 0

  try {
    const acResp = await fetch(`${baseUrl}/aircraft`, { headers, signal: AbortSignal.timeout(15000) })
    if (!acResp.ok) throw new Error(`Flight Circle API returned ${acResp.status}`)
    const acData = await acResp.json()
    const fcAircraft: any[] = Array.isArray(acData) ? acData : (acData.data ?? [])

    for (const fcAc of fcAircraft) {
      const tail = fcAc.tailNumber ?? fcAc.registration ?? fcAc.tail_number
      if (!tail) continue

      const { data: existing } = await supabase
        .from('aircraft')
        .select('id')
        .eq('organization_id', orgId)
        .ilike('tail_number', tail)
        .single()

      if (existing) {
        const updates: Record<string, any> = { updated_at: new Date().toISOString() }
        if (fcAc.totalTime != null) updates.total_time_hours = fcAc.totalTime
        if (fcAc.hobbs != null) updates.hobbs_time = fcAc.hobbs
        await supabase.from('aircraft').update(updates).eq('id', existing.id)
        aircraftSynced++
      }
      recordsSynced++
    }
  } catch (err: any) {
    console.error('[Flight Circle sync] error:', err.message)
  }

  return {
    recordsSynced,
    aircraftSynced,
    summary: { aircraft_updated: aircraftSynced },
    startedAt,
  }
}
