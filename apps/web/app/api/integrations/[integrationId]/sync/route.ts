// POST /api/integrations/[integrationId]/sync — Manually trigger a sync for a connected integration
// Supports: Flight Schedule Pro, Flight Circle, etc.

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { decryptIntegrationCredentials } from '@/lib/integrations/crypto'
import {
  exportAccountingInvoices,
  getDecryptedProviderTokens,
  type ExportableInvoice,
} from '@/lib/integrations/accounting'

export const maxDuration = 30

const PROVIDER_LABELS: Record<string, string> = {
  flight_schedule_pro: 'Flight Schedule Pro',
  flight_circle: 'Flight Circle',
  schedule_master: 'ScheduleMaster',
  schedaero: 'Schedaero',
  myflightbook: 'MyFlightbook',
  aerocrew: 'Aero Crew Solutions',
  fltplan: 'FltPlan.com',
  avplan: 'AvPlan EFB',
  flightaware: 'FlightAware AeroAPI',
  adsb_exchange: 'ADS-B Exchange',
  flight_radar_24: 'FlightRadar24 Business',
  camp: 'CAMP Systems',
  flightdocs: 'Flightdocs',
  traxxall: 'Traxxall',
  quantum_control: 'Quantum Control',
  corridor: 'Corridor',
  atp_aviation_hub: 'ATP Aviation Hub',
  winair: 'WinAir',
  logbook_pro: 'Logbook Pro',
  smart_aviation: 'Smart Aviation',
  mx_commander: 'Mx Commander',
  safety_culture: 'SafetyCulture',
  aviobook: 'AvioBook Maintenance',
  quickbooks: 'QuickBooks',
  freshbooks: 'FreshBooks',
}

function hasUsableCredentials(credentials: any) {
  if (!credentials || typeof credentials !== 'object') return false
  const candidates = [
    credentials.api_key,
    credentials.access_token,
    credentials.client_secret,
    credentials.client_id,
  ]
  return candidates.some((value) => typeof value === 'string' && value.trim().length >= 8)
}

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

  const storedCredentials = integration.credentials_encrypted ?? {}
  const credentials = decryptIntegrationCredentials<any>(storedCredentials) ?? {}
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
      case 'quickbooks':
      case 'freshbooks':
        syncResult = await syncAccountingProvider(
          params.integrationId,
          provider,
          storedCredentials,
          orgId,
          supabase,
          (integration.settings ?? {}) as Record<string, unknown>
        )
        break
      default:
        syncResult = await syncScaffoldedProvider(provider, credentials, orgId, supabase)
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
      last_sync_status: syncResult.lastSyncStatus ?? 'success',
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
    last_sync_status: syncResult.lastSyncStatus ?? 'success',
    summary: syncResult.summary,
  })
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface SyncResult {
  recordsSynced: number
  aircraftSynced: number
  summary: Record<string, unknown>
  startedAt: string
  lastSyncStatus?: string
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
      message: `Synced ${recordsSynced} Flight Schedule Pro record(s).`,
    },
    startedAt,
    lastSyncStatus: 'success',
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
    summary: {
      aircraft_updated: aircraftSynced,
      message: `Synced ${recordsSynced} Flight Circle record(s).`,
    },
    startedAt,
    lastSyncStatus: 'success',
  }
}

async function syncAccountingProvider(
  integrationId: string,
  provider: string,
  credentials: any,
  orgId: string,
  supabase: any,
  settings: Record<string, unknown> | null = null
): Promise<SyncResult> {
  const startedAt = new Date().toISOString()
  const decrypted = getDecryptedProviderTokens(credentials)
  if (!decrypted?.refresh_token) {
    throw new Error(`Missing OAuth credentials for ${PROVIDER_LABELS[provider] ?? provider}`)
  }

  const { data: invoices, error } = await supabase
    .from('invoices')
    .select(`
      id,
      invoice_number,
      status,
      invoice_date,
      due_date,
      subtotal,
      tax_amount,
      total,
      notes,
      customer:customer_id (name, company, email, phone, billing_address),
      aircraft:aircraft_id (tail_number),
      line_items:invoice_line_items (description, quantity, unit_price, item_type)
    `)
    .eq('organization_id', orgId)
    .not('status', 'eq', 'void')
    .order('created_at', { ascending: false })
    .limit(25)

  if (error) throw new Error(error.message)

  const { exported, skipped, failures, context } = await exportAccountingInvoices({
    provider: provider as 'quickbooks' | 'freshbooks',
    integrationId,
    credentials,
    settings,
    invoices: (invoices ?? []) as ExportableInvoice[],
    orgId,
    supabase,
  })

  return {
    recordsSynced: exported,
    aircraftSynced: 0,
    startedAt,
    lastSyncStatus: failures.length > 0 && exported === 0 ? 'failed' : 'success',
    summary: {
      provider,
      provider_name: PROVIDER_LABELS[provider] ?? provider,
      invoices_exported: exported,
      invoices_skipped: skipped,
      failures,
      remote_sync: true,
      adapter_status: failures.length > 0 ? 'partial_success' : 'success',
      connected_context: context,
      message:
        exported > 0
          ? `Exported ${exported} invoice(s) to ${PROVIDER_LABELS[provider] ?? provider}${skipped > 0 ? ` and skipped ${skipped} already-linked invoice(s)` : ''}.`
          : skipped > 0
            ? `No new invoices needed export for ${PROVIDER_LABELS[provider] ?? provider}; ${skipped} invoice(s) were already linked.`
            : `No invoices were available to export for ${PROVIDER_LABELS[provider] ?? provider}.`,
    },
  }
}

async function syncScaffoldedProvider(
  provider: string,
  credentials: any,
  orgId: string,
  supabase: any
): Promise<SyncResult> {
  const startedAt = new Date().toISOString()
  if (!hasUsableCredentials(credentials)) {
    throw new Error(`Missing API credentials for ${PROVIDER_LABELS[provider] ?? provider}`)
  }

  const [
    aircraftRes,
    customersRes,
    workOrdersRes,
    squawksRes,
  ] = await Promise.all([
    supabase.from('aircraft').select('id', { count: 'exact', head: true }).eq('organization_id', orgId),
    supabase.from('customers').select('id', { count: 'exact', head: true }).eq('organization_id', orgId),
    supabase.from('work_orders').select('id', { count: 'exact', head: true }).eq('organization_id', orgId),
    supabase.from('squawks').select('id', { count: 'exact', head: true }).eq('organization_id', orgId),
  ])

  const aircraftCount = aircraftRes.count ?? 0
  const customerCount = customersRes.count ?? 0
  const workOrderCount = workOrdersRes.count ?? 0
  const squawkCount = squawksRes.count ?? 0
  const prepared = aircraftCount + customerCount + workOrderCount + squawkCount

  return {
    recordsSynced: prepared,
    aircraftSynced: aircraftCount,
    startedAt,
    lastSyncStatus: 'scaffolded',
    summary: {
      provider,
      provider_name: PROVIDER_LABELS[provider] ?? provider,
      adapter_status: 'scaffolded',
      remote_sync: false,
      aircraft_available: aircraftCount,
      customers_available: customerCount,
      work_orders_available: workOrderCount,
      squawks_available: squawkCount,
      message: `Prepared ${prepared} normalized local record(s) for ${PROVIDER_LABELS[provider] ?? provider}. The adapter and status plumbing are live, but provider-specific field mapping still needs final API credential work.`,
    },
  }
}
