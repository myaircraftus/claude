# MyAircraft — Layer B: Records Intelligence
## Complete Implementation Handoff for Claude Code

**Version:** 1.0 — April 2026
**Platform:** myaircraft.us
**Stack:** Next.js 14 · TypeScript · Supabase · OpenAI GPT-4o · TailwindCSS · Shadcn UI · Stripe · Vercel
**Builds on:** Existing system documented in `MyAircraft_Master_Brief_ClaudeCode.md`

---

## Table of Contents

1. [Overview and Architecture](#1-overview-and-architecture)
2. [Database Migrations](#2-database-migrations)
3. [Feature A: Aircraft Computed Status](#3-feature-a-aircraft-computed-status)
4. [Feature B: Missing Record Detection Engine](#4-feature-b-missing-record-detection-engine)
5. [Feature C: Discrepancy Detection](#5-feature-c-discrepancy-detection)
6. [Feature D: Report Generation System](#6-feature-d-report-generation-system)
7. [Feature E: Prebuy / Lender / Insurer Packet](#7-feature-e-prebuy--lender--insurer-packet)
8. [API Routes Reference](#8-api-routes-reference)
9. [UI Components and Pages](#9-ui-components-and-pages)
10. [Stripe Billing Extensions](#10-stripe-billing-extensions)
11. [TypeScript Types Reference](#11-typescript-types-reference)
12. [Build Order and Dependencies](#12-build-order-and-dependencies)

---

## 1. Overview and Architecture

### What Layer B Is

Layer B sits on top of the existing digitization pipeline. It does not change how records are ingested — it reads the canonical data that already exists in `maintenance_events`, `aircraft_ad_applicability`, and related tables, and produces structured intelligence from it.

The three source-of-truth tables Layer B reads from:

```
maintenance_events          → all canonical maintenance actions per aircraft
aircraft_ad_applicability   → AD compliance status per aircraft
documents                   → all uploaded/scanned source files per aircraft
aircraft                    → aircraft profile, make/model/serial/engine data
```

The four new output systems Layer B creates:

```
aircraft_computed_status    → current aggregated state (time, compliance, currency)
record_findings             → missing record and discrepancy findings
report_jobs                 → async report generation tracker
report_outputs              → generated report metadata and storage paths
```

### Design Principles

**Never mutate source data.** Layer B reads from canonical tables and writes only to its own output tables. It never modifies `maintenance_events` or any pipeline table.

**Everything is aircraft-scoped.** All Layer B tables include `aircraft_id` and `organization_id` with RLS applied identically to the rest of the system.

**Computed status is a snapshot.** The `aircraft_computed_status` table is a materialized snapshot, refreshed on demand or on a schedule. It is not a live view — it is computed by the intelligence engine and stored.

**Findings are versioned.** Each time the detection engine runs, it creates a new `findings_run_id`. Old findings are preserved for audit trail. The UI shows only the latest run by default.

**Reports are async.** PDF generation is expensive. All reports are queued as jobs, generated server-side, stored to Supabase Storage, and surfaced to the user as a signed download URL.

---

## 2. Database Migrations

Apply these as sequential Supabase migrations after the existing 22 migrations. Start at migration `023`.

### Migration 023 — aircraft_computed_status

```sql
-- Migration 023: Aircraft Computed Status
-- Materialized snapshot of current aircraft intelligence state

CREATE TABLE aircraft_computed_status (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aircraft_id                 UUID NOT NULL REFERENCES aircraft(id) ON DELETE CASCADE,
  organization_id             UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Computed at timestamp
  computed_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Airframe time
  airframe_total_time         NUMERIC(8,1),   -- TTAF decimal hours, from latest maintenance_event
  airframe_time_source_date   DATE,           -- date of the entry that provided this time

  -- Engine state
  engine_time_since_new       NUMERIC(8,1),
  engine_time_since_overhaul  NUMERIC(8,1),   -- SMOH
  engine_last_overhaul_date   DATE,
  engine_last_overhaul_shop   TEXT,
  engine_tbo_hours            NUMERIC(8,1),   -- from aircraft profile or known TBO for this engine model
  engine_hours_to_tbo         NUMERIC(8,1),   -- computed: engine_tbo_hours - engine_time_since_overhaul

  -- Propeller state
  prop_time_since_new         NUMERIC(8,1),
  prop_time_since_overhaul    NUMERIC(8,1),
  prop_last_overhaul_date     DATE,

  -- Inspection currency (all dates are last-completed dates)
  last_annual_date            DATE,
  last_annual_aircraft_time   NUMERIC(8,1),
  annual_next_due_date        DATE,           -- computed: last_annual_date + 12 months
  annual_is_current           BOOLEAN,        -- computed: annual_next_due_date >= today

  last_100hr_date             DATE,
  last_100hr_aircraft_time    NUMERIC(8,1),
  next_100hr_due_time         NUMERIC(8,1),   -- computed: last_100hr_aircraft_time + 100

  last_elt_inspection_date    DATE,
  elt_next_due_date           DATE,           -- +24 months
  elt_is_current              BOOLEAN,

  last_transponder_test_date  DATE,
  transponder_next_due_date   DATE,           -- +24 months
  transponder_is_current      BOOLEAN,

  last_pitot_static_date      DATE,
  pitot_static_next_due_date  DATE,           -- +24 months
  pitot_static_is_current     BOOLEAN,

  last_altimeter_date         DATE,
  altimeter_next_due_date     DATE,
  altimeter_is_current        BOOLEAN,

  last_vor_check_date         DATE,
  vor_check_next_due_date     DATE,           -- +30 days
  vor_check_is_current        BOOLEAN,

  -- AD compliance summary
  total_applicable_ads        INTEGER DEFAULT 0,
  ads_complied                INTEGER DEFAULT 0,
  ads_open                    INTEGER DEFAULT 0,
  ads_unknown                 INTEGER DEFAULT 0,
  next_ad_due_date            DATE,           -- earliest upcoming recurring AD due date
  next_ad_number              TEXT,           -- which AD is due next

  -- Required document presence
  has_registration            BOOLEAN DEFAULT false,
  registration_expiry_date    DATE,
  has_airworthiness_cert      BOOLEAN DEFAULT false,
  has_weight_balance          BOOLEAN DEFAULT false,
  has_equipment_list          BOOLEAN DEFAULT false,

  -- Overall health score (0–100, computed)
  health_score                INTEGER,
  health_score_breakdown      JSONB,          -- component scores for display

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_computed_status_aircraft ON aircraft_computed_status(aircraft_id);
CREATE INDEX idx_computed_status_org ON aircraft_computed_status(organization_id);

-- RLS
ALTER TABLE aircraft_computed_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_members_read_computed_status" ON aircraft_computed_status
  FOR SELECT USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "service_role_all_computed_status" ON aircraft_computed_status
  FOR ALL USING (auth.role() = 'service_role');
```

### Migration 024 — record_findings

```sql
-- Migration 024: Record Findings
-- Output table for missing-record detection and discrepancy detection

CREATE TYPE finding_type AS ENUM (
  -- Missing record findings
  'missing_annual_gap',
  'missing_100hr_gap',
  'missing_elt_inspection',
  'missing_transponder_test',
  'missing_pitot_static_test',
  'missing_engine_log_continuity',
  'missing_prop_log_continuity',
  'missing_airframe_log_continuity',
  'missing_form_337',
  'missing_8130_for_component',
  'missing_back_to_birth',
  'missing_overhaul_documentation',
  'missing_ad_compliance_record',
  'missing_stc_documentation',
  'missing_registration',
  'missing_airworthiness_cert',
  'missing_weight_balance',
  'missing_equipment_list',
  'incomplete_return_to_service',
  'missing_mechanic_signature',
  'missing_mechanic_certificate',
  -- Discrepancy findings
  'time_regression',
  'time_gap_anomaly',
  'conflicting_overhaul_dates',
  'ad_compliance_conflict',
  'duplicate_entry_suspected',
  'unsigned_entry',
  'future_dated_entry',
  'implausible_time_jump'
);

CREATE TYPE finding_severity AS ENUM (
  'critical',   -- airworthiness risk, grounds aircraft if unresolved
  'warning',    -- significant gap, affects value/compliance
  'info'        -- minor gap, informational only
);

CREATE TABLE record_findings (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aircraft_id           UUID NOT NULL REFERENCES aircraft(id) ON DELETE CASCADE,
  organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  findings_run_id       UUID NOT NULL,   -- groups all findings from one detection run

  finding_type          finding_type NOT NULL,
  severity              finding_severity NOT NULL,

  title                 TEXT NOT NULL,   -- short display title, e.g. "Missing Annual 2018–2020"
  description           TEXT NOT NULL,   -- full human-readable explanation
  recommendation        TEXT,            -- what to do about it

  affected_date_start   DATE,            -- beginning of the affected period
  affected_date_end     DATE,            -- end of the affected period
  affected_component    TEXT,            -- 'airframe' | 'engine' | 'prop' | 'avionics' | specific component

  source_event_ids      UUID[],          -- maintenance_events that surfaced this finding
  source_document_ids   UUID[],          -- documents relevant to this finding

  -- Resolution tracking
  is_resolved           BOOLEAN DEFAULT false,
  resolved_at           TIMESTAMPTZ,
  resolved_by           UUID REFERENCES user_profiles(id),
  resolution_note       TEXT,

  -- Whether this finding was acknowledged (but not resolved) by a reviewer
  is_acknowledged       BOOLEAN DEFAULT false,
  acknowledged_at       TIMESTAMPTZ,
  acknowledged_by       UUID REFERENCES user_profiles(id),
  acknowledge_note      TEXT,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Track each detection run
CREATE TABLE findings_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aircraft_id     UUID NOT NULL REFERENCES aircraft(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  triggered_by    UUID REFERENCES user_profiles(id),
  trigger_source  TEXT NOT NULL DEFAULT 'manual',  -- manual | scheduled | post_ingest
  status          TEXT NOT NULL DEFAULT 'running', -- running | completed | failed
  findings_count  INTEGER DEFAULT 0,
  critical_count  INTEGER DEFAULT 0,
  warning_count   INTEGER DEFAULT 0,
  info_count      INTEGER DEFAULT 0,
  completed_at    TIMESTAMPTZ,
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_findings_aircraft ON record_findings(aircraft_id);
CREATE INDEX idx_findings_run ON record_findings(findings_run_id);
CREATE INDEX idx_findings_severity ON record_findings(severity) WHERE is_resolved = false;
CREATE INDEX idx_findings_runs_aircraft ON findings_runs(aircraft_id);

ALTER TABLE record_findings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_members_read_findings" ON record_findings
  FOR SELECT USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "org_members_update_findings" ON record_findings
  FOR UPDATE USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "service_role_all_findings" ON record_findings
  FOR ALL USING (auth.role() = 'service_role');

ALTER TABLE findings_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_members_read_runs" ON findings_runs
  FOR SELECT USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "service_role_all_runs" ON findings_runs
  FOR ALL USING (auth.role() = 'service_role');
```

### Migration 025 — report_jobs and report_outputs

```sql
-- Migration 025: Report Generation System

CREATE TYPE report_type AS ENUM (
  'aircraft_overview',
  'engine_prop_summary',
  'inspection_status',
  'maintenance_timeline',
  'missing_records',
  'prebuy_packet',
  'lender_packet',
  'insurer_packet'
);

CREATE TYPE report_status AS ENUM (
  'queued',
  'generating',
  'completed',
  'failed'
);

CREATE TABLE report_jobs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aircraft_id         UUID NOT NULL REFERENCES aircraft(id) ON DELETE CASCADE,
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  requested_by        UUID REFERENCES user_profiles(id),

  report_type         report_type NOT NULL,
  status              report_status NOT NULL DEFAULT 'queued',

  -- Options passed at generation time
  options             JSONB DEFAULT '{}',
  -- e.g. { "as_of_date": "2026-04-01", "include_timeline": true, "include_findings": true }

  -- For prebuy/lender/insurer packets — billing
  stripe_payment_intent_id   TEXT,
  is_paid                    BOOLEAN DEFAULT false,

  -- For share links
  share_token                TEXT UNIQUE,   -- UUID used in public share URL
  share_token_expires_at     TIMESTAMPTZ,
  share_accessed_count       INTEGER DEFAULT 0,

  -- Output
  storage_path        TEXT,           -- Supabase Storage path of generated PDF
  signed_url          TEXT,           -- short-lived signed URL for download
  signed_url_expires  TIMESTAMPTZ,
  page_count          INTEGER,
  file_size_bytes     INTEGER,

  -- Tracking
  generation_started_at   TIMESTAMPTZ,
  generation_completed_at TIMESTAMPTZ,
  error_message           TEXT,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_report_jobs_aircraft ON report_jobs(aircraft_id);
CREATE INDEX idx_report_jobs_org ON report_jobs(organization_id);
CREATE INDEX idx_report_jobs_share ON report_jobs(share_token) WHERE share_token IS NOT NULL;

ALTER TABLE report_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_members_read_reports" ON report_jobs
  FOR SELECT USING (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "org_members_insert_reports" ON report_jobs
  FOR INSERT WITH CHECK (organization_id = ANY(get_my_org_ids()));
CREATE POLICY "service_role_all_reports" ON report_jobs
  FOR ALL USING (auth.role() = 'service_role');
-- Public share access (no auth required — share_token acts as bearer token)
CREATE POLICY "public_share_access" ON report_jobs
  FOR SELECT USING (
    share_token IS NOT NULL
    AND share_token_expires_at > now()
  );
```

---

## 3. Feature A: Aircraft Computed Status

### Purpose

Aggregates all canonical maintenance events for an aircraft into a single current-state snapshot. This is the foundation for reports and the missing-record detection engine.

### File: `lib/intelligence/computeAircraftStatus.ts`

```typescript
import { createClient } from '@/lib/supabase/server'

export interface ComputedStatusInput {
  aircraftId: string
  organizationId: string
}

export async function computeAircraftStatus(
  input: ComputedStatusInput
): Promise<void> {
  const supabase = createClient()

  // 1. Pull all maintenance events for this aircraft, sorted chronologically
  const { data: events } = await supabase
    .from('maintenance_events')
    .select('*')
    .eq('aircraft_id', input.aircraftId)
    .order('entry_date', { ascending: true })

  if (!events) return

  // 2. Pull AD applicability data
  const { data: adRecords } = await supabase
    .from('aircraft_ad_applicability')
    .select('*')
    .eq('aircraft_id', input.aircraftId)

  // 3. Pull documents for required document checks
  const { data: documents } = await supabase
    .from('documents')
    .select('id, document_type, metadata')
    .eq('aircraft_id', input.aircraftId)

  // 4. Pull aircraft profile for TBO reference
  const { data: aircraft } = await supabase
    .from('aircraft')
    .select('*')
    .eq('id', input.aircraftId)
    .single()

  if (!aircraft) return

  // --- AIRFRAME TIME ---
  // Latest event with aircraft_total_time populated
  const latestWithTime = [...events]
    .reverse()
    .find(e => e.aircraft_total_time != null)

  const airframeTime = latestWithTime?.aircraft_total_time ?? null
  const airframeTimeSourceDate = latestWithTime?.entry_date ?? null

  // --- ENGINE TIME ---
  const engineOverhauls = events.filter(e =>
    ['engine_overhaul', 'engine_replacement'].includes(e.event_type)
  )
  const lastOverhaul = engineOverhauls[engineOverhauls.length - 1]
  const engineTimeSinceOverhaul = lastOverhaul && airframeTime
    ? airframeTime - lastOverhaul.aircraft_total_time
    : null

  // --- PROP TIME ---
  const propOverhauls = events.filter(e =>
    ['prop_overhaul', 'prop_replacement'].includes(e.event_type)
  )
  const lastPropOverhaul = propOverhauls[propOverhauls.length - 1]
  const propTimeSinceOverhaul = lastPropOverhaul && airframeTime
    ? airframeTime - lastPropOverhaul.aircraft_total_time
    : null

  // --- INSPECTION CURRENCY ---
  const annuals = events
    .filter(e => e.event_type === 'annual_inspection')
    .sort((a, b) => new Date(b.entry_date).getTime() - new Date(a.entry_date).getTime())
  const lastAnnual = annuals[0]
  const lastAnnualDate = lastAnnual?.entry_date ? new Date(lastAnnual.entry_date) : null
  const annualNextDue = lastAnnualDate
    ? new Date(lastAnnualDate.getFullYear() + 1, lastAnnualDate.getMonth(), lastAnnualDate.getDate())
    : null
  const annualIsCurrent = annualNextDue ? annualNextDue >= new Date() : false

  // ELT — last inspection event type 'elt_inspection'
  const lastElt = findLastByType(events, 'elt_inspection')
  const eltNextDue = addMonths(lastElt?.entry_date, 24)
  const eltIsCurrent = eltNextDue ? eltNextDue >= new Date() : false

  // Transponder — event type 'transponder_test'
  const lastXpdr = findLastByType(events, 'transponder_test')
  const xpdrNextDue = addMonths(lastXpdr?.entry_date, 24)
  const xpdrIsCurrent = xpdrNextDue ? xpdrNextDue >= new Date() : false

  // Pitot-static — event type 'pitot_static_test'
  const lastPitotStatic = findLastByType(events, 'pitot_static_test')
  const psNextDue = addMonths(lastPitotStatic?.entry_date, 24)
  const psIsCurrent = psNextDue ? psNextDue >= new Date() : false

  // Altimeter — event type 'altimeter_calibration'
  const lastAltimeter = findLastByType(events, 'altimeter_calibration')
  const altNextDue = addMonths(lastAltimeter?.entry_date, 24)
  const altIsCurrent = altNextDue ? altNextDue >= new Date() : false

  // VOR check — event type 'vor_check'
  const lastVor = findLastByType(events, 'vor_check')
  const vorNextDue = addDays(lastVor?.entry_date, 30)
  const vorIsCurrent = vorNextDue ? vorNextDue >= new Date() : false

  // --- AD SUMMARY ---
  const totalAds = adRecords?.length ?? 0
  const adsComplied = adRecords?.filter(a => a.compliance_status === 'complied').length ?? 0
  const adsOpen = adRecords?.filter(a => a.compliance_status === 'open').length ?? 0
  const adsUnknown = adRecords?.filter(a => a.compliance_status === 'unknown').length ?? 0

  // Next recurring AD due
  const upcomingAds = (adRecords ?? [])
    .filter(a => a.next_due_date != null)
    .sort((a, b) => new Date(a.next_due_date).getTime() - new Date(b.next_due_date).getTime())
  const nextAd = upcomingAds[0]

  // --- REQUIRED DOCUMENTS ---
  const hasRegistration = documents?.some(d => d.document_type === 'registration') ?? false
  const hasAirworthinessCert = documents?.some(d => d.document_type === 'airworthiness_cert') ?? false
  const hasWeightBalance = documents?.some(d => d.document_type === 'weight_balance') ?? false
  const hasEquipmentList = documents?.some(
    d => d.document_type === 'weight_balance' && d.metadata?.has_equipment_list === true
  ) ?? false

  // --- HEALTH SCORE ---
  const healthBreakdown = computeHealthScore({
    annualIsCurrent,
    eltIsCurrent,
    xpdrIsCurrent,
    psIsCurrent,
    adsOpen,
    totalAds,
    hasRegistration,
    hasAirworthinessCert,
    hasWeightBalance,
  })

  // --- UPSERT ---
  await supabase
    .from('aircraft_computed_status')
    .upsert({
      aircraft_id: input.aircraftId,
      organization_id: input.organizationId,
      computed_at: new Date().toISOString(),

      airframe_total_time: airframeTime,
      airframe_time_source_date: airframeTimeSourceDate,

      engine_time_since_overhaul: engineTimeSinceOverhaul,
      engine_last_overhaul_date: lastOverhaul?.entry_date ?? null,
      engine_last_overhaul_shop: extractOverhaulShop(lastOverhaul),

      prop_time_since_overhaul: propTimeSinceOverhaul,
      prop_last_overhaul_date: lastPropOverhaul?.entry_date ?? null,

      last_annual_date: lastAnnual?.entry_date ?? null,
      last_annual_aircraft_time: lastAnnual?.aircraft_total_time ?? null,
      annual_next_due_date: annualNextDue?.toISOString().split('T')[0] ?? null,
      annual_is_current: annualIsCurrent,

      last_elt_inspection_date: lastElt?.entry_date ?? null,
      elt_next_due_date: eltNextDue?.toISOString().split('T')[0] ?? null,
      elt_is_current: eltIsCurrent,

      last_transponder_test_date: lastXpdr?.entry_date ?? null,
      transponder_next_due_date: xpdrNextDue?.toISOString().split('T')[0] ?? null,
      transponder_is_current: xpdrIsCurrent,

      last_pitot_static_date: lastPitotStatic?.entry_date ?? null,
      pitot_static_next_due_date: psNextDue?.toISOString().split('T')[0] ?? null,
      pitot_static_is_current: psIsCurrent,

      last_altimeter_date: lastAltimeter?.entry_date ?? null,
      altimeter_next_due_date: altNextDue?.toISOString().split('T')[0] ?? null,
      altimeter_is_current: altIsCurrent,

      last_vor_check_date: lastVor?.entry_date ?? null,
      vor_check_next_due_date: vorNextDue?.toISOString().split('T')[0] ?? null,
      vor_check_is_current: vorIsCurrent,

      total_applicable_ads: totalAds,
      ads_complied: adsComplied,
      ads_open: adsOpen,
      ads_unknown: adsUnknown,
      next_ad_due_date: nextAd?.next_due_date ?? null,
      next_ad_number: nextAd?.ad_number ?? null,

      has_registration: hasRegistration,
      has_airworthiness_cert: hasAirworthinessCert,
      has_weight_balance: hasWeightBalance,
      has_equipment_list: hasEquipmentList,

      health_score: healthBreakdown.total,
      health_score_breakdown: healthBreakdown.breakdown,

      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'aircraft_id',
    })
}

// --- Helpers ---

function findLastByType(events: any[], type: string) {
  return [...events]
    .filter(e => e.event_type === type)
    .sort((a, b) => new Date(b.entry_date).getTime() - new Date(a.entry_date).getTime())[0]
}

function addMonths(dateStr: string | null | undefined, months: number): Date | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  d.setMonth(d.getMonth() + months)
  return d
}

function addDays(dateStr: string | null | undefined, days: number): Date | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d
}

function extractOverhaulShop(event: any): string | null {
  if (!event) return null
  // Try to extract shop name from work_description using simple heuristics
  const desc = event.work_description ?? ''
  const shopMatch = desc.match(/overhauled by ([^,.]+)/i) ?? desc.match(/at ([^,.]+) shop/i)
  return shopMatch?.[1]?.trim() ?? null
}

interface HealthScoreInput {
  annualIsCurrent: boolean
  eltIsCurrent: boolean
  xpdrIsCurrent: boolean
  psIsCurrent: boolean
  adsOpen: number
  totalAds: number
  hasRegistration: boolean
  hasAirworthinessCert: boolean
  hasWeightBalance: boolean
}

function computeHealthScore(input: HealthScoreInput): { total: number; breakdown: Record<string, number> } {
  const breakdown: Record<string, number> = {
    annual: input.annualIsCurrent ? 30 : 0,
    elt: input.eltIsCurrent ? 10 : 0,
    transponder: input.xpdrIsCurrent ? 10 : 0,
    pitot_static: input.psIsCurrent ? 10 : 0,
    ads: input.totalAds === 0 ? 20 : Math.round((1 - input.adsOpen / input.totalAds) * 20),
    registration: input.hasRegistration ? 10 : 0,
    airworthiness: input.hasAirworthinessCert ? 5 : 0,
    weight_balance: input.hasWeightBalance ? 5 : 0,
  }
  const total = Object.values(breakdown).reduce((sum, v) => sum + v, 0)
  return { total, breakdown }
}
```

### API Route: `app/api/aircraft/[id]/compute-status/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { computeAircraftStatus } from '@/lib/intelligence/computeAircraftStatus'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify user has access to this aircraft
  const { data: aircraft } = await supabase
    .from('aircraft')
    .select('id, organization_id')
    .eq('id', params.id)
    .single()

  if (!aircraft) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await computeAircraftStatus({
    aircraftId: aircraft.id,
    organizationId: aircraft.organization_id,
  })

  const { data: status } = await supabase
    .from('aircraft_computed_status')
    .select('*')
    .eq('aircraft_id', params.id)
    .single()

  return NextResponse.json({ status })
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: status } = await supabase
    .from('aircraft_computed_status')
    .select('*')
    .eq('aircraft_id', params.id)
    .single()

  return NextResponse.json({ status })
}
```

---

## 4. Feature B: Missing Record Detection Engine

### Purpose

Analyzes the canonical event stream and documents for an aircraft, detects gaps and missing records, and writes structured findings to `record_findings`.

### File: `lib/intelligence/detectMissingRecords.ts`

```typescript
import { createClient } from '@/lib/supabase/server'
import { v4 as uuidv4 } from 'uuid'

export interface DetectionInput {
  aircraftId: string
  organizationId: string
  triggeredBy: string | null
  triggerSource?: string
}

export async function detectMissingRecords(input: DetectionInput): Promise<string> {
  const supabase = createClient()
  const runId = uuidv4()

  // Create the run record
  const { data: run } = await supabase
    .from('findings_runs')
    .insert({
      id: runId,
      aircraft_id: input.aircraftId,
      organization_id: input.organizationId,
      triggered_by: input.triggeredBy,
      trigger_source: input.triggerSource ?? 'manual',
      status: 'running',
    })
    .select()
    .single()

  try {
    const findings: FindingRecord[] = []

    // Pull all source data
    const { data: events } = await supabase
      .from('maintenance_events')
      .select('*')
      .eq('aircraft_id', input.aircraftId)
      .order('entry_date', { ascending: true })

    const { data: documents } = await supabase
      .from('documents')
      .select('*')
      .eq('aircraft_id', input.aircraftId)

    const { data: aircraft } = await supabase
      .from('aircraft')
      .select('*')
      .eq('id', input.aircraftId)
      .single()

    const { data: adRecords } = await supabase
      .from('aircraft_ad_applicability')
      .select('*')
      .eq('aircraft_id', input.aircraftId)

    if (!events || !aircraft) throw new Error('Could not load aircraft data')

    // Run all detection rules
    findings.push(...detectAnnualGaps(events, aircraft))
    findings.push(...detectInspectionGaps(events))
    findings.push(...detectLogbookContinuityGaps(events))
    findings.push(...detectMissingEngineDocumentation(events, documents ?? []))
    findings.push(...detectMissingRequiredDocuments(documents ?? []))
    findings.push(...detectMissing337ForRepairs(events, documents ?? []))
    findings.push(...detectTimeDiscrepancies(events))
    findings.push(...detectAdComplianceGaps(adRecords ?? [], events))

    // Write all findings
    if (findings.length > 0) {
      await supabase.from('record_findings').insert(
        findings.map(f => ({
          ...f,
          aircraft_id: input.aircraftId,
          organization_id: input.organizationId,
          findings_run_id: runId,
        }))
      )
    }

    // Update run as completed
    await supabase.from('findings_runs').update({
      status: 'completed',
      findings_count: findings.length,
      critical_count: findings.filter(f => f.severity === 'critical').length,
      warning_count: findings.filter(f => f.severity === 'warning').length,
      info_count: findings.filter(f => f.severity === 'info').length,
      completed_at: new Date().toISOString(),
    }).eq('id', runId)

  } catch (err: any) {
    await supabase.from('findings_runs').update({
      status: 'failed',
      error_message: err?.message ?? 'Unknown error',
      completed_at: new Date().toISOString(),
    }).eq('id', runId)
    throw err
  }

  return runId
}

// --- Detection Rules ---

type FindingRecord = Omit<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  'id' | 'aircraft_id' | 'organization_id' | 'findings_run_id' | 'created_at'
>

/**
 * RULE: Annual Inspection Gaps
 * Checks for years with no annual inspection in the event timeline.
 * FAA 14 CFR 91.409: annual inspection required every 12 calendar months.
 */
function detectAnnualGaps(events: any[], aircraft: any): FindingRecord[] {
  const findings: FindingRecord[] = []
  const annuals = events
    .filter(e => e.event_type === 'annual_inspection')
    .sort((a, b) => new Date(a.entry_date).getTime() - new Date(b.entry_date).getTime())

  if (annuals.length === 0) {
    findings.push({
      finding_type: 'missing_annual_gap',
      severity: 'critical',
      title: 'No Annual Inspection Records Found',
      description: 'No annual inspection entries were found in the digitized records for this aircraft. Annual inspections are required every 12 calendar months under 14 CFR 91.409.',
      recommendation: 'Locate and upload all logbooks. If annual records are confirmed missing, consult an A&P/IA regarding regulatory status.',
      affected_component: 'airframe',
    })
    return findings
  }

  // Check gaps between annuals
  for (let i = 1; i < annuals.length; i++) {
    const prev = new Date(annuals[i - 1].entry_date)
    const curr = new Date(annuals[i].entry_date)
    const monthGap = (curr.getFullYear() - prev.getFullYear()) * 12 + (curr.getMonth() - prev.getMonth())

    if (monthGap > 14) { // Allow 2 months grace for calendar month rule
      const gapYears = Math.round(monthGap / 12)
      findings.push({
        finding_type: 'missing_annual_gap',
        severity: monthGap > 24 ? 'critical' : 'warning',
        title: `Annual Inspection Gap: ${formatDateShort(prev)} to ${formatDateShort(curr)}`,
        description: `There is a ${gapYears}-year gap between the annual inspection dated ${formatDate(prev)} and the next annual dated ${formatDate(curr)}. 14 CFR 91.409 requires an annual inspection every 12 calendar months.`,
        recommendation: 'Locate logbooks covering this period. If records are confirmed missing, document the gap and consult your IA.',
        affected_date_start: prev.toISOString().split('T')[0],
        affected_date_end: curr.toISOString().split('T')[0],
        affected_component: 'airframe',
        source_event_ids: [annuals[i - 1].id, annuals[i].id],
      })
    }
  }

  // Check if current annual is overdue
  const lastAnnual = annuals[annuals.length - 1]
  const lastAnnualDate = new Date(lastAnnual.entry_date)
  const nextDue = new Date(lastAnnualDate)
  nextDue.setFullYear(nextDue.getFullYear() + 1)
  if (nextDue < new Date()) {
    findings.push({
      finding_type: 'missing_annual_gap',
      severity: 'critical',
      title: 'Annual Inspection Overdue',
      description: `The most recent annual inspection was performed on ${formatDate(lastAnnualDate)}. The next annual was due by ${formatDate(nextDue)}, which is ${daysBetween(nextDue, new Date())} days ago.`,
      recommendation: 'Schedule an annual inspection with a licensed IA immediately. Aircraft may not be operated under 14 CFR Part 91.',
      affected_date_start: nextDue.toISOString().split('T')[0],
      affected_component: 'airframe',
      source_event_ids: [lastAnnual.id],
    })
  }

  return findings
}

/**
 * RULE: Recurring Inspection Gaps
 * ELT, Transponder, Pitot-Static, Altimeter — all 24-month.
 */
function detectInspectionGaps(events: any[]): FindingRecord[] {
  const findings: FindingRecord[] = []

  const inspectionChecks = [
    {
      eventType: 'elt_inspection',
      findingType: 'missing_elt_inspection' as const,
      label: 'ELT Inspection',
      regulation: '14 CFR 91.207',
      intervalMonths: 24,
      severity: 'warning' as const,
    },
    {
      eventType: 'transponder_test',
      findingType: 'missing_transponder_test' as const,
      label: 'Transponder Test',
      regulation: '14 CFR 91.413',
      intervalMonths: 24,
      severity: 'warning' as const,
    },
    {
      eventType: 'pitot_static_test',
      findingType: 'missing_pitot_static_test' as const,
      label: 'Pitot-Static System Test',
      regulation: '14 CFR 91.411',
      intervalMonths: 24,
      severity: 'warning' as const,
    },
  ]

  for (const check of inspectionChecks) {
    const inspections = events
      .filter(e => e.event_type === check.eventType)
      .sort((a, b) => new Date(b.entry_date).getTime() - new Date(a.entry_date).getTime())

    if (inspections.length === 0) {
      findings.push({
        finding_type: check.findingType,
        severity: check.severity,
        title: `No ${check.label} Records Found`,
        description: `No ${check.label} entries were found in the digitized records. ${check.regulation} requires this inspection every ${check.intervalMonths} calendar months.`,
        recommendation: `Check if records exist in undigitized logbooks. Ensure currency before IFR operations.`,
        affected_component: 'airframe',
      })
    } else {
      const last = inspections[0]
      const lastDate = new Date(last.entry_date)
      const nextDue = new Date(lastDate)
      nextDue.setMonth(nextDue.getMonth() + check.intervalMonths)
      if (nextDue < new Date()) {
        findings.push({
          finding_type: check.findingType,
          severity: check.severity,
          title: `${check.label} Overdue`,
          description: `Last ${check.label} was ${formatDate(lastDate)}. Next due: ${formatDate(nextDue)} (${daysBetween(nextDue, new Date())} days overdue). Required by ${check.regulation}.`,
          recommendation: `Schedule ${check.label} with a qualified shop.`,
          affected_date_start: nextDue.toISOString().split('T')[0],
          affected_component: 'airframe',
          source_event_ids: [last.id],
        })
      }
    }
  }

  return findings
}

/**
 * RULE: Engine Log Continuity
 * Looks for large time jumps in engine entries that suggest missing logbook pages.
 */
function detectLogbookContinuityGaps(events: any[]): FindingRecord[] {
  const findings: FindingRecord[] = []

  const engineEvents = events
    .filter(e => ['engine_log', 'engine_oil_change', 'compression_check', 'annual_inspection'].includes(e.event_type))
    .filter(e => e.aircraft_total_time != null)
    .sort((a, b) => a.aircraft_total_time - b.aircraft_total_time)

  for (let i = 1; i < engineEvents.length; i++) {
    const timeDelta = engineEvents[i].aircraft_total_time - engineEvents[i - 1].aircraft_total_time
    if (timeDelta > 500) {
      // 500+ hours between logged entries is a significant gap
      findings.push({
        finding_type: 'missing_engine_log_continuity',
        severity: 'warning',
        title: `Engine Log Gap: ${engineEvents[i - 1].aircraft_total_time}h to ${engineEvents[i].aircraft_total_time}h`,
        description: `There is a gap of ${Math.round(timeDelta)} hours between logged engine entries. This may indicate missing logbook pages or an undigitized maintenance book covering this period.`,
        recommendation: 'Verify that all engine logbooks have been scanned. If a gap exists in the physical records, note it in the aircraft file.',
        affected_component: 'engine',
        source_event_ids: [engineEvents[i - 1].id, engineEvents[i].id],
      })
    }
  }

  return findings
}

/**
 * RULE: Missing Engine Overhaul Documentation
 * If an overhaul event is present but no supporting Form 8130 or shop paperwork exists.
 */
function detectMissingEngineDocumentation(events: any[], documents: any[]): FindingRecord[] {
  const findings: FindingRecord[] = []

  const overhauls = events.filter(e =>
    ['engine_overhaul', 'engine_replacement'].includes(e.event_type)
  )

  const has8130 = documents.some(d => d.document_type === 'form_8130')
  const hasWorkOrder = documents.some(d => d.document_type === 'work_order')

  if (overhauls.length > 0 && !has8130 && !hasWorkOrder) {
    findings.push({
      finding_type: 'missing_overhaul_documentation',
      severity: 'warning',
      title: 'Engine Overhaul — Supporting Documentation Missing',
      description: `${overhauls.length} engine overhaul/replacement event(s) found in records, but no Form 8130-3 or shop work order documentation was found. Overhaul paperwork (8130, yellow tags, shop invoice) should accompany a factory or major overhaul.`,
      recommendation: 'Obtain copies of the overhaul work order, 8130-3 certificate, and any yellow tags from the overhaul shop.',
      affected_component: 'engine',
      source_event_ids: overhauls.map(o => o.id),
    })
  }

  return findings
}

/**
 * RULE: Missing Required Documents
 * Registration, Airworthiness Certificate, Weight & Balance.
 */
function detectMissingRequiredDocuments(documents: any[]): FindingRecord[] {
  const findings: FindingRecord[] = []

  const required = [
    {
      type: 'registration',
      findingType: 'missing_registration' as const,
      label: 'Aircraft Registration (FAA Form AC 8050-1)',
      regulation: '14 CFR 91.203(a)(1)',
      severity: 'critical' as const,
    },
    {
      type: 'airworthiness_cert',
      findingType: 'missing_airworthiness_cert' as const,
      label: 'Airworthiness Certificate',
      regulation: '14 CFR 91.203(a)(1)',
      severity: 'critical' as const,
    },
    {
      type: 'weight_balance',
      findingType: 'missing_weight_balance' as const,
      label: 'Current Weight and Balance',
      regulation: '14 CFR Part 23',
      severity: 'warning' as const,
    },
  ]

  for (const req of required) {
    const hasDoc = documents.some(d => d.document_type === req.type)
    if (!hasDoc) {
      findings.push({
        finding_type: req.findingType,
        severity: req.severity,
        title: `Missing: ${req.label}`,
        description: `No ${req.label} was found in the digitized aircraft records. This document is required to be carried aboard or on file per ${req.regulation}.`,
        recommendation: `Upload a copy of the ${req.label} to complete the aircraft record file.`,
        affected_component: 'airframe',
      })
    }
  }

  return findings
}

/**
 * RULE: Missing Form 337 for Major Repairs
 * If a maintenance entry describes a major repair/alteration but no Form 337 exists.
 */
function detectMissing337ForRepairs(events: any[], documents: any[]): FindingRecord[] {
  const findings: FindingRecord[] = []

  const majorRepairEvents = events.filter(e =>
    e.event_type === 'major_repair' || e.event_type === 'major_alteration'
  )
  const has337 = documents.some(d => d.document_type === 'form_337')

  if (majorRepairEvents.length > 0 && !has337) {
    findings.push({
      finding_type: 'missing_form_337',
      severity: 'critical',
      title: 'Major Repair/Alteration — No Form 337 Found',
      description: `${majorRepairEvents.length} major repair or alteration event(s) found in records, but no FAA Form 337 was found in the aircraft file. FAA Form 337 is required for all major repairs and alterations under 14 CFR Part 43.`,
      recommendation: 'Locate the original Form 337 from the performing A&P/IA or the FAA Aircraft Certification Office. Submit a copy to the FAA and retain the original in the aircraft records.',
      affected_component: 'airframe',
      source_event_ids: majorRepairEvents.map(e => e.id),
    })
  }

  return findings
}

/**
 * RULE: Time Discrepancies
 * Aircraft total time should never decrease between sequential entries.
 */
function detectTimeDiscrepancies(events: any[]): FindingRecord[] {
  const findings: FindingRecord[] = []

  const timedEvents = events
    .filter(e => e.aircraft_total_time != null)
    .sort((a, b) => new Date(a.entry_date).getTime() - new Date(b.entry_date).getTime())

  for (let i = 1; i < timedEvents.length; i++) {
    const prev = timedEvents[i - 1]
    const curr = timedEvents[i]
    if (curr.aircraft_total_time < prev.aircraft_total_time) {
      findings.push({
        finding_type: 'time_regression',
        severity: 'warning',
        title: `Time Regression Detected: ${prev.aircraft_total_time}h → ${curr.aircraft_total_time}h`,
        description: `Entry dated ${formatDate(new Date(curr.entry_date))} shows aircraft total time of ${curr.aircraft_total_time}h, which is less than the prior entry dated ${formatDate(new Date(prev.entry_date))} showing ${prev.aircraft_total_time}h. Aircraft total time should never decrease.`,
        recommendation: 'Review the original logbook pages for these entries. One of the times may be a transcription error.',
        affected_component: 'airframe',
        source_event_ids: [prev.id, curr.id],
      })
    }
  }

  return findings
}

/**
 * RULE: AD Compliance Gaps
 * ADs marked 'open' or 'unknown' should surface as findings.
 */
function detectAdComplianceGaps(adRecords: any[], events: any[]): FindingRecord[] {
  const findings: FindingRecord[] = []

  const openAds = adRecords.filter(a => a.compliance_status === 'open')
  const unknownAds = adRecords.filter(a => a.compliance_status === 'unknown')

  if (openAds.length > 0) {
    findings.push({
      finding_type: 'missing_ad_compliance_record',
      severity: 'critical',
      title: `${openAds.length} Open Airworthiness Directive(s)`,
      description: `${openAds.length} applicable Airworthiness Directive(s) are marked as open (not complied with): ${openAds.map(a => a.ad_number).join(', ')}. Aircraft may not be operated with open ADs.`,
      recommendation: 'Review each open AD with a licensed A&P/IA and comply as required.',
      affected_component: 'airframe',
    })
  }

  if (unknownAds.length > 0) {
    findings.push({
      finding_type: 'missing_ad_compliance_record',
      severity: 'warning',
      title: `${unknownAds.length} AD(s) With Unknown Compliance Status`,
      description: `${unknownAds.length} applicable AD(s) do not have a verified compliance record in the aircraft file: ${unknownAds.map(a => a.ad_number).join(', ')}.`,
      recommendation: 'Search the logbooks for compliance entries for each AD. If no record exists, consult an A&P/IA.',
      affected_component: 'airframe',
    })
  }

  return findings
}

// --- Date formatting helpers ---
function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}
function formatDateShort(d: Date): string {
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short' })
}
function daysBetween(a: Date, b: Date): number {
  return Math.floor(Math.abs(b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24))
}
```

### API Route: `app/api/aircraft/[id]/detect-findings/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { detectMissingRecords } from '@/lib/intelligence/detectMissingRecords'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: aircraft } = await supabase
    .from('aircraft')
    .select('id, organization_id')
    .eq('id', params.id)
    .single()

  if (!aircraft) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const runId = await detectMissingRecords({
    aircraftId: aircraft.id,
    organizationId: aircraft.organization_id,
    triggeredBy: user.id,
    triggerSource: 'manual',
  })

  return NextResponse.json({ run_id: runId })
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Get latest findings run for this aircraft
  const { data: latestRun } = await supabase
    .from('findings_runs')
    .select('*')
    .eq('aircraft_id', params.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!latestRun) return NextResponse.json({ findings: [], run: null })

  const { data: findings } = await supabase
    .from('record_findings')
    .select('*')
    .eq('findings_run_id', latestRun.id)
    .eq('is_resolved', false)
    .order('severity', { ascending: true }) // critical first

  return NextResponse.json({ findings, run: latestRun })
}
```

---

## 5. Feature C: Discrepancy Detection

This runs as part of the detection engine above via `detectTimeDiscrepancies()` and can be extended with additional AI-powered analysis via the following route.

### API Route: `app/api/aircraft/[id]/analyze-discrepancies/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Pull last 50 maintenance events for AI analysis
  const { data: events } = await supabase
    .from('maintenance_events')
    .select('entry_date, event_type, aircraft_total_time, work_description, certifying_mechanic_cert')
    .eq('aircraft_id', params.id)
    .order('entry_date', { ascending: true })
    .limit(50)

  if (!events?.length) return NextResponse.json({ discrepancies: [] })

  const eventSummary = events.map(e =>
    `${e.entry_date} | ${e.event_type} | TTAF: ${e.aircraft_total_time ?? 'N/A'} | Cert: ${e.certifying_mechanic_cert ?? 'N/A'} | "${e.work_description?.substring(0, 100)}"`
  ).join('\n')

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{
      role: 'system',
      content: `You are an aviation records analyst with expertise in FAA regulations and aircraft logbook standards.
      Analyze the following aircraft maintenance log entries for discrepancies, inconsistencies, or red flags.
      Focus on: time anomalies, missing signatures, conflicting information, regulatory compliance gaps, and anything unusual.
      Return a JSON array of findings with fields: type, severity (critical/warning/info), title, description.
      Be specific and cite the dates/times involved.`
    }, {
      role: 'user',
      content: `Analyze these maintenance log entries for discrepancies:\n\n${eventSummary}`
    }],
    response_format: { type: 'json_object' },
    max_tokens: 1500,
  })

  const result = JSON.parse(completion.choices[0].message.content ?? '{"findings":[]}')

  return NextResponse.json({ discrepancies: result.findings ?? [] })
}
```

---

## 6. Feature D: Report Generation System

### Architecture

Reports are generated asynchronously. The flow is:
1. Client calls `POST /api/reports` → creates a `report_jobs` record in `queued` state
2. The API immediately triggers report generation in the background
3. Report is generated by `lib/intelligence/generateReport.ts`
4. PDF is written to Supabase Storage
5. `report_jobs` updated to `completed` with storage path and signed URL
6. Client polls `GET /api/reports/[jobId]` or uses realtime subscription

### File: `lib/intelligence/generateReport.ts`

```typescript
import { createClient } from '@/lib/supabase/server'
import { generateAircraftOverviewReport } from './reports/aircraftOverview'
import { generateEngineReport } from './reports/engineReport'
import { generateInspectionReport } from './reports/inspectionReport'
import { generateTimelineReport } from './reports/timelineReport'
import { generateMissingRecordsReport } from './reports/missingRecordsReport'
import { generatePrebuyPacket } from './reports/prebuyPacket'

export type ReportType =
  | 'aircraft_overview'
  | 'engine_prop_summary'
  | 'inspection_status'
  | 'maintenance_timeline'
  | 'missing_records'
  | 'prebuy_packet'
  | 'lender_packet'
  | 'insurer_packet'

export async function generateReport(jobId: string): Promise<void> {
  const supabase = createClient()

  const { data: job } = await supabase
    .from('report_jobs')
    .select('*, aircraft:aircraft_id(*)')
    .eq('id', jobId)
    .single()

  if (!job) throw new Error(`Report job ${jobId} not found`)

  await supabase.from('report_jobs').update({
    status: 'generating',
    generation_started_at: new Date().toISOString(),
  }).eq('id', jobId)

  try {
    let pdfBuffer: Buffer

    switch (job.report_type as ReportType) {
      case 'aircraft_overview':
        pdfBuffer = await generateAircraftOverviewReport(job.aircraft_id, job.options)
        break
      case 'engine_prop_summary':
        pdfBuffer = await generateEngineReport(job.aircraft_id, job.options)
        break
      case 'inspection_status':
        pdfBuffer = await generateInspectionReport(job.aircraft_id, job.options)
        break
      case 'maintenance_timeline':
        pdfBuffer = await generateTimelineReport(job.aircraft_id, job.options)
        break
      case 'missing_records':
        pdfBuffer = await generateMissingRecordsReport(job.aircraft_id, job.options)
        break
      case 'prebuy_packet':
      case 'lender_packet':
      case 'insurer_packet':
        pdfBuffer = await generatePrebuyPacket(job.aircraft_id, job.report_type, job.options)
        break
      default:
        throw new Error(`Unknown report type: ${job.report_type}`)
    }

    // Store PDF
    const fileName = `reports/${job.aircraft_id}/${jobId}.pdf`
    const { error: uploadError } = await supabase.storage
      .from('aircraft-reports')
      .upload(fileName, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      })

    if (uploadError) throw uploadError

    // Create signed URL (valid 7 days)
    const { data: { signedUrl } } = await supabase.storage
      .from('aircraft-reports')
      .createSignedUrl(fileName, 60 * 60 * 24 * 7)

    await supabase.from('report_jobs').update({
      status: 'completed',
      storage_path: fileName,
      signed_url: signedUrl,
      signed_url_expires: new Date(Date.now() + 60 * 60 * 24 * 7 * 1000).toISOString(),
      file_size_bytes: pdfBuffer.length,
      generation_completed_at: new Date().toISOString(),
    }).eq('id', jobId)

  } catch (err: any) {
    await supabase.from('report_jobs').update({
      status: 'failed',
      error_message: err?.message ?? 'Generation failed',
      generation_completed_at: new Date().toISOString(),
    }).eq('id', jobId)
    throw err
  }
}
```

### File: `lib/intelligence/reports/aircraftOverview.ts`

```typescript
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { renderReportToPDF } from '@/lib/intelligence/reports/pdfRenderer'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function generateAircraftOverviewReport(
  aircraftId: string,
  options: Record<string, unknown> = {}
): Promise<Buffer> {
  const supabase = createClient()

  const [
    { data: aircraft },
    { data: status },
    { data: events },
    { data: findings },
  ] = await Promise.all([
    supabase.from('aircraft').select('*').eq('id', aircraftId).single(),
    supabase.from('aircraft_computed_status').select('*').eq('aircraft_id', aircraftId).single(),
    supabase.from('maintenance_events').select('*').eq('aircraft_id', aircraftId).order('entry_date', { ascending: false }).limit(20),
    supabase.from('record_findings').select('*').eq('aircraft_id', aircraftId).eq('is_resolved', false).order('severity'),
  ])

  // Build narrative summary with GPT-4o
  const narrativePrompt = `
You are writing an Aircraft Overview Report for ${aircraft?.make} ${aircraft?.model} (${aircraft?.tail_number}).
Aircraft data: Serial ${aircraft?.serial_number}, Engine: ${aircraft?.engine_make} ${aircraft?.engine_model}.
Current total time: ${status?.airframe_total_time ?? 'Unknown'}h.
Annual status: ${status?.annual_is_current ? 'Current' : 'OVERDUE'}, last annual: ${status?.last_annual_date ?? 'Unknown'}.
Engine time since overhaul: ${status?.engine_time_since_overhaul ?? 'Unknown'}h.
AD compliance: ${status?.ads_complied ?? 0} complied, ${status?.ads_open ?? 0} open, ${status?.ads_unknown ?? 0} unknown.
Recent maintenance summary: ${events?.slice(0, 5).map(e => `${e.entry_date}: ${e.event_type}`).join('; ')}.
Findings: ${findings?.length ?? 0} open issues (${findings?.filter(f => f.severity === 'critical').length ?? 0} critical).

Write a concise 2-3 paragraph executive summary of this aircraft's maintenance status.
Be factual. Note the overall health, key dates, and any significant concerns.
Write for an aircraft owner or buyer — not a mechanic.
`
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: narrativePrompt }],
    max_tokens: 500,
  })

  const narrative = completion.choices[0].message.content ?? ''

  // Assemble report data structure
  const reportData = {
    reportType: 'Aircraft Overview Report',
    generatedAt: new Date().toISOString(),
    aircraft: {
      tailNumber: aircraft?.tail_number,
      makeModel: `${aircraft?.make} ${aircraft?.model}`,
      year: aircraft?.year,
      serialNumber: aircraft?.serial_number,
      engineMakeModel: `${aircraft?.engine_make} ${aircraft?.engine_model}`,
      engineSerial: aircraft?.engine_serial,
    },
    narrative,
    status: {
      airframeTotalTime: status?.airframe_total_time,
      annualIsCurrent: status?.annual_is_current,
      annualNextDue: status?.annual_next_due_date,
      engineTimeSinceOverhaul: status?.engine_time_since_overhaul,
      eltIsCurrent: status?.elt_is_current,
      transponderIsCurrent: status?.transponder_is_current,
      adsOpen: status?.ads_open,
      adsComplied: status?.ads_complied,
      healthScore: status?.health_score,
    },
    findings: findings?.map(f => ({
      severity: f.severity,
      title: f.title,
      description: f.description,
      recommendation: f.recommendation,
    })),
    recentMaintenance: events?.slice(0, 10).map(e => ({
      date: e.entry_date,
      type: e.event_type,
      summary: e.work_summary,
      mechanic: e.certifying_mechanic_name,
    })),
  }

  return renderReportToPDF(reportData, 'aircraft_overview')
}
```

### File: `lib/intelligence/reports/pdfRenderer.ts`

```typescript
// PDF rendering using puppeteer-core + @sparticuz/chromium for Vercel compatibility
// Install: npm install puppeteer-core @sparticuz/chromium

import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'

export async function renderReportToPDF(
  data: Record<string, unknown>,
  template: string
): Promise<Buffer> {
  const html = buildReportHTML(data, template)

  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  })

  const page = await browser.newPage()
  await page.setContent(html, { waitUntil: 'networkidle0' })

  const pdf = await page.pdf({
    format: 'Letter',
    printBackground: true,
    margin: { top: '0.75in', right: '0.75in', bottom: '0.75in', left: '0.75in' },
  })

  await browser.close()
  return Buffer.from(pdf)
}

function buildReportHTML(data: Record<string, unknown>, template: string): string {
  const aircraft = data.aircraft as any
  const status = data.status as any
  const findings = (data.findings as any[]) ?? []
  const recentMaintenance = (data.recentMaintenance as any[]) ?? []

  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11pt; color: #111; line-height: 1.5; }
  .header { background: #0f172a; color: white; padding: 24px 32px; margin-bottom: 24px; }
  .header h1 { font-size: 20pt; margin: 0 0 4px 0; }
  .header .subtitle { font-size: 10pt; opacity: 0.7; }
  .section { margin-bottom: 24px; padding: 0 32px; }
  .section h2 { font-size: 13pt; font-weight: 600; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; margin-bottom: 14px; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .stat-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 16px; }
  .stat-label { font-size: 9pt; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; }
  .stat-value { font-size: 14pt; font-weight: 700; color: #0f172a; margin-top: 2px; }
  .finding { border-left: 4px solid #94a3b8; padding: 10px 14px; margin-bottom: 8px; background: #f8fafc; border-radius: 0 4px 4px 0; }
  .finding.critical { border-left-color: #ef4444; background: #fef2f2; }
  .finding.warning { border-left-color: #f59e0b; background: #fffbeb; }
  .finding-title { font-weight: 600; font-size: 10pt; }
  .finding-desc { font-size: 9.5pt; color: #374151; margin-top: 3px; }
  .status-ok { color: #16a34a; font-weight: 600; }
  .status-warn { color: #d97706; font-weight: 600; }
  .status-bad { color: #dc2626; font-weight: 600; }
  .timeline-row { display: grid; grid-template-columns: 110px 1fr; gap: 12px; padding: 8px 0; border-bottom: 1px solid #f1f5f9; }
  .timeline-date { font-size: 9pt; color: #64748b; }
  .narrative { background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 6px; padding: 14px 18px; font-size: 10.5pt; line-height: 1.6; margin-bottom: 24px; }
  .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 12px 32px; font-size: 8pt; color: #94a3b8; margin-top: 32px; }
  .health-score { display: inline-block; background: #0f172a; color: white; border-radius: 50%; width: 56px; height: 56px; text-align: center; line-height: 56px; font-size: 16pt; font-weight: 700; }
  @media print { body { margin: 0; } }
</style>
</head>
<body>

<div class="header">
  <h1>${aircraft?.tailNumber ?? 'Aircraft'} — ${data.reportType}</h1>
  <div class="subtitle">${aircraft?.makeModel} · S/N ${aircraft?.serialNumber} · Generated ${new Date(data.generatedAt as string).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
</div>

${data.narrative ? `<div class="section"><div class="narrative">${data.narrative}</div></div>` : ''}

<div class="section">
  <h2>Aircraft Status</h2>
  <div class="grid-2">
    <div class="stat-box">
      <div class="stat-label">Aircraft Total Time</div>
      <div class="stat-value">${status?.airframeTotalTime ? `${status.airframeTotalTime.toLocaleString()}h` : '—'}</div>
    </div>
    <div class="stat-box">
      <div class="stat-label">Engine SMOH</div>
      <div class="stat-value">${status?.engineTimeSinceOverhaul ? `${status.engineTimeSinceOverhaul.toLocaleString()}h` : '—'}</div>
    </div>
    <div class="stat-box">
      <div class="stat-label">Annual Inspection</div>
      <div class="stat-value ${status?.annualIsCurrent ? 'status-ok' : 'status-bad'}">
        ${status?.annualIsCurrent ? '✓ Current' : '✗ OVERDUE'}
      </div>
    </div>
    <div class="stat-box">
      <div class="stat-label">Open ADs</div>
      <div class="stat-value ${(status?.adsOpen ?? 0) > 0 ? 'status-bad' : 'status-ok'}">
        ${status?.adsOpen ?? 0} Open
      </div>
    </div>
    <div class="stat-box">
      <div class="stat-label">Transponder</div>
      <div class="stat-value ${status?.transponderIsCurrent ? 'status-ok' : 'status-warn'}">
        ${status?.transponderIsCurrent ? '✓ Current' : '⚠ Check'}
      </div>
    </div>
    <div class="stat-box">
      <div class="stat-label">Record Health Score</div>
      <div class="stat-value">
        <span class="health-score">${status?.healthScore ?? '—'}</span>
      </div>
    </div>
  </div>
</div>

${findings.length > 0 ? `
<div class="section">
  <h2>Open Findings (${findings.length})</h2>
  ${findings.map(f => `
    <div class="finding ${f.severity}">
      <div class="finding-title">${f.severity.toUpperCase()}: ${f.title}</div>
      <div class="finding-desc">${f.description}</div>
      ${f.recommendation ? `<div class="finding-desc" style="margin-top:4px;font-style:italic;">→ ${f.recommendation}</div>` : ''}
    </div>
  `).join('')}
</div>
` : ''}

${recentMaintenance.length > 0 ? `
<div class="section">
  <h2>Recent Maintenance</h2>
  ${recentMaintenance.map(e => `
    <div class="timeline-row">
      <div class="timeline-date">${e.date}</div>
      <div>${e.summary ?? e.type}${e.mechanic ? ` <span style="color:#94a3b8">— ${e.mechanic}</span>` : ''}</div>
    </div>
  `).join('')}
</div>
` : ''}

<div class="footer">
  Generated by MyAircraft · myaircraft.us · This report is based on digitized records and should be verified against original source documents. Not a substitute for an FAA-recognized inspection.
</div>
</body>
</html>`
}
```

### API Route: `app/api/reports/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateReport } from '@/lib/intelligence/generateReport'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { aircraft_id, report_type, options } = body

  if (!aircraft_id || !report_type) {
    return NextResponse.json({ error: 'aircraft_id and report_type required' }, { status: 400 })
  }

  // Verify access
  const { data: aircraft } = await supabase
    .from('aircraft')
    .select('id, organization_id')
    .eq('id', aircraft_id)
    .single()

  if (!aircraft) return NextResponse.json({ error: 'Aircraft not found' }, { status: 404 })

  // Create the job
  const { data: job } = await supabase
    .from('report_jobs')
    .insert({
      aircraft_id,
      organization_id: aircraft.organization_id,
      requested_by: user.id,
      report_type,
      options: options ?? {},
      status: 'queued',
    })
    .select()
    .single()

  if (!job) return NextResponse.json({ error: 'Failed to create job' }, { status: 500 })

  // Trigger generation (fire-and-forget — do not await in the request handler)
  // In production, use a Supabase Edge Function or background job queue
  // For now, use waitUntil pattern with Vercel
  generateReport(job.id).catch(err => {
    console.error(`Report generation failed for job ${job.id}:`, err)
  })

  return NextResponse.json({ job_id: job.id, status: 'queued' })
}

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const aircraftId = searchParams.get('aircraft_id')

  const query = supabase
    .from('report_jobs')
    .select('*')
    .order('created_at', { ascending: false })

  if (aircraftId) query.eq('aircraft_id', aircraftId)

  const { data: jobs } = await query
  return NextResponse.json({ jobs })
}
```

### API Route: `app/api/reports/[jobId]/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  req: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const supabase = createClient()

  // Allow public access via share token
  const { searchParams } = new URL(req.url)
  const shareToken = searchParams.get('share_token')

  let job: any

  if (shareToken) {
    const { data } = await supabase
      .from('report_jobs')
      .select('*')
      .eq('id', params.jobId)
      .eq('share_token', shareToken)
      .gt('share_token_expires_at', new Date().toISOString())
      .single()
    job = data

    if (job) {
      // Increment access counter
      await supabase
        .from('report_jobs')
        .update({ share_accessed_count: job.share_accessed_count + 1 })
        .eq('id', params.jobId)
    }
  } else {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data } = await supabase
      .from('report_jobs')
      .select('*')
      .eq('id', params.jobId)
      .single()
    job = data
  }

  if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Refresh signed URL if it's expiring soon (< 1 day)
  if (job.status === 'completed' && job.storage_path) {
    const expiresAt = new Date(job.signed_url_expires)
    if (expiresAt.getTime() - Date.now() < 86400000) {
      const supabaseAdmin = createClient() // use service role for storage
      const { data: { signedUrl } } = await supabaseAdmin.storage
        .from('aircraft-reports')
        .createSignedUrl(job.storage_path, 60 * 60 * 24 * 7)
      await supabaseAdmin.from('report_jobs').update({
        signed_url: signedUrl,
        signed_url_expires: new Date(Date.now() + 60 * 60 * 24 * 7 * 1000).toISOString(),
      }).eq('id', params.jobId)
      job.signed_url = signedUrl
    }
  }

  return NextResponse.json({ job })
}
```

---

## 7. Feature E: Prebuy / Lender / Insurer Packet

### Overview

The prebuy packet is a premium product sold as a one-time purchase. It generates a comprehensive, professionally formatted PDF summary designed for aircraft buyers, lenders, or insurance underwriters who need a quick but thorough assessment of an aircraft's records.

### File: `lib/intelligence/reports/prebuyPacket.ts`

```typescript
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { renderReportToPDF } from './pdfRenderer'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export type PacketAudience = 'prebuy_packet' | 'lender_packet' | 'insurer_packet'

export async function generatePrebuyPacket(
  aircraftId: string,
  audience: PacketAudience,
  options: Record<string, unknown> = {}
): Promise<Buffer> {
  const supabase = createClient()

  const [
    { data: aircraft },
    { data: status },
    { data: events },
    { data: findings },
    { data: adRecords },
    { data: documents },
  ] = await Promise.all([
    supabase.from('aircraft').select('*').eq('id', aircraftId).single(),
    supabase.from('aircraft_computed_status').select('*').eq('aircraft_id', aircraftId).single(),
    supabase.from('maintenance_events').select('*').eq('aircraft_id', aircraftId).order('entry_date', { ascending: true }),
    supabase.from('record_findings').select('*').eq('aircraft_id', aircraftId).eq('is_resolved', false).order('severity'),
    supabase.from('aircraft_ad_applicability').select('*').eq('aircraft_id', aircraftId),
    supabase.from('documents').select('id, document_type, title').eq('aircraft_id', aircraftId),
  ])

  // Identify major events
  const majorRepairs = events?.filter(e => ['major_repair', 'major_alteration'].includes(e.event_type)) ?? []
  const engineOverhauls = events?.filter(e => ['engine_overhaul', 'engine_replacement'].includes(e.event_type)) ?? []
  const propOverhauls = events?.filter(e => ['prop_overhaul', 'prop_replacement'].includes(e.event_type)) ?? []
  const annuals = events?.filter(e => e.event_type === 'annual_inspection') ?? []

  // Detect damage history indicators (major repairs to primary structure)
  const damageIndicators = majorRepairs.filter(e => {
    const desc = (e.work_description ?? '').toLowerCase()
    return desc.includes('damage') || desc.includes('bent') || desc.includes('fire') ||
           desc.includes('ground loop') || desc.includes('prop strike') || desc.includes('gear collapse')
  })

  // Build audience-specific executive summary
  const audienceContext = {
    prebuy_packet: 'You are preparing a prebuy inspection summary for an aircraft buyer. Focus on airworthiness risks, value-affecting issues, and what a buyer should know.',
    lender_packet: 'You are preparing a collateral assessment for an aircraft lender. Focus on document completeness, compliance status, and factors affecting the aircraft as loan security.',
    insurer_packet: 'You are preparing an underwriting summary for an aviation insurance company. Focus on maintenance history, accident/incident indicators, compliance status, and risk factors.',
  }

  const executiveSummaryPrompt = `
${audienceContext[audience]}

Aircraft: ${aircraft?.make} ${aircraft?.model} (${aircraft?.tail_number}), S/N ${aircraft?.serial_number}, Year ${aircraft?.year}
Engine: ${aircraft?.engine_make} ${aircraft?.engine_model}
Total Time: ${status?.airframe_total_time ?? 'Unknown'}h
Engine SMOH: ${status?.engine_time_since_overhaul ?? 'Unknown'}h
Annual Status: ${status?.annual_is_current ? 'Current' : 'OVERDUE'}, last ${status?.last_annual_date}
AD Status: ${status?.ads_complied} complied, ${status?.ads_open} open, ${status?.ads_unknown} unknown
Major Repairs: ${majorRepairs.length}
Damage Indicators: ${damageIndicators.length}
Open Findings: ${findings?.length ?? 0} (${findings?.filter(f => f.severity === 'critical').length ?? 0} critical)

Write a concise 3-4 paragraph executive summary for this aircraft. Be specific, accurate, and clear about any risks or concerns.
Flag the most important issues in the first paragraph.
`

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: executiveSummaryPrompt }],
    max_tokens: 600,
  })
  const executiveSummary = completion.choices[0].message.content ?? ''

  // Risk rating
  const criticalCount = findings?.filter(f => f.severity === 'critical').length ?? 0
  const warningCount = findings?.filter(f => f.severity === 'warning').length ?? 0
  const openAdCount = status?.ads_open ?? 0
  const damageCount = damageIndicators.length

  let riskRating: 'Low' | 'Medium' | 'High' | 'Critical'
  let riskColor: string
  if (criticalCount > 2 || openAdCount > 0 || damageCount > 1) {
    riskRating = 'High'; riskColor = '#dc2626'
  } else if (criticalCount > 0 || warningCount > 3 || damageCount > 0) {
    riskRating = 'Medium'; riskColor = '#d97706'
  } else {
    riskRating = 'Low'; riskColor = '#16a34a'
  }

  const reportData = {
    reportType: audience === 'prebuy_packet' ? 'Prebuy Summary Packet'
      : audience === 'lender_packet' ? 'Lender Collateral Summary'
      : 'Insurance Underwriting Summary',
    generatedAt: new Date().toISOString(),
    audience,
    aircraft: {
      tailNumber: aircraft?.tail_number,
      makeModel: `${aircraft?.make} ${aircraft?.model}`,
      year: aircraft?.year,
      serialNumber: aircraft?.serial_number,
      engineMakeModel: `${aircraft?.engine_make} ${aircraft?.engine_model}`,
      engineSerial: aircraft?.engine_serial,
    },
    executiveSummary,
    riskRating,
    riskColor,
    status: {
      airframeTotalTime: status?.airframe_total_time,
      engineTimeSinceOverhaul: status?.engine_time_since_overhaul,
      propTimeSinceOverhaul: status?.prop_time_since_overhaul,
      annualIsCurrent: status?.annual_is_current,
      annualNextDue: status?.annual_next_due_date,
      lastAnnualDate: status?.last_annual_date,
      eltIsCurrent: status?.elt_is_current,
      transponderIsCurrent: status?.transponder_is_current,
      pitotStaticIsCurrent: status?.pitot_static_is_current,
      adsComplied: status?.ads_complied,
      adsOpen: status?.ads_open,
      adsUnknown: status?.ads_unknown,
      hasRegistration: status?.has_registration,
      hasAirworthinessCert: status?.has_airworthiness_cert,
      hasWeightBalance: status?.has_weight_balance,
      healthScore: status?.health_score,
    },
    majorEvents: {
      annualCount: annuals.length,
      lastAnnual: annuals[annuals.length - 1],
      engineOverhauls: engineOverhauls.map(e => ({
        date: e.entry_date,
        aircraftTime: e.aircraft_total_time,
        summary: e.work_summary,
      })),
      propOverhauls: propOverhauls.map(e => ({
        date: e.entry_date,
        summary: e.work_summary,
      })),
      majorRepairs: majorRepairs.map(e => ({
        date: e.entry_date,
        summary: e.work_summary,
        description: e.work_description,
      })),
      damageIndicators: damageIndicators.map(e => ({
        date: e.entry_date,
        summary: e.work_summary,
        description: e.work_description,
      })),
    },
    findings: findings?.map(f => ({
      severity: f.severity,
      title: f.title,
      description: f.description,
      recommendation: f.recommendation,
    })),
    adSummary: {
      total: adRecords?.length ?? 0,
      complied: status?.ads_complied ?? 0,
      open: status?.ads_open ?? 0,
      unknown: status?.ads_unknown ?? 0,
      openAds: adRecords?.filter(a => a.compliance_status === 'open').map(a => a.ad_number),
    },
    documentChecklist: {
      hasRegistration: status?.has_registration,
      hasAirworthinessCert: status?.has_airworthiness_cert,
      hasWeightBalance: status?.has_weight_balance,
      hasForm337s: documents?.some(d => d.document_type === 'form_337'),
      hasEngineLogbooks: documents?.some(d => d.document_type === 'engine_log'),
      hasAirframeLogbooks: documents?.some(d => d.document_type === 'airframe_log'),
      hasPropLogbooks: documents?.some(d => d.document_type === 'prop_log'),
    },
  }

  return renderReportToPDF(reportData, 'prebuy_packet')
}
```

### API Route: `app/api/reports/share/route.ts`

```typescript
// Generates a shareable link for a completed report (for prebuy/lender/insurer packets)
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { v4 as uuidv4 } from 'uuid'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { job_id, expires_days = 30 } = await req.json()

  const { data: job } = await supabase
    .from('report_jobs')
    .select('id, status, aircraft_id')
    .eq('id', job_id)
    .single()

  if (!job || job.status !== 'completed') {
    return NextResponse.json({ error: 'Report not ready' }, { status: 400 })
  }

  const shareToken = uuidv4()
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + expires_days)

  await supabase.from('report_jobs').update({
    share_token: shareToken,
    share_token_expires_at: expiresAt.toISOString(),
  }).eq('id', job_id)

  const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL}/reports/${job_id}?share_token=${shareToken}`

  return NextResponse.json({ share_url: shareUrl, expires_at: expiresAt.toISOString() })
}
```

---

## 8. API Routes Reference

Complete list of new routes added by Layer B.

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| `GET` | `/api/aircraft/[id]/compute-status` | Org member | Get current computed status |
| `POST` | `/api/aircraft/[id]/compute-status` | Org member | Recompute and refresh status |
| `GET` | `/api/aircraft/[id]/detect-findings` | Org member | Get latest findings run results |
| `POST` | `/api/aircraft/[id]/detect-findings` | Org member | Run missing-record detection |
| `POST` | `/api/aircraft/[id]/analyze-discrepancies` | Org member | AI-powered discrepancy analysis |
| `GET` | `/api/reports` | Org member | List report jobs for org |
| `POST` | `/api/reports` | Org member | Queue a new report |
| `GET` | `/api/reports/[jobId]` | Org member or share token | Get report job status + download URL |
| `POST` | `/api/reports/share` | Org member | Generate shareable link |

---

## 9. UI Components and Pages

### Page: `app/(dashboard)/aircraft/[id]/intelligence/page.tsx`

This is the main Layer B dashboard tab for an aircraft. Add it alongside the existing aircraft detail tabs.

```typescript
// The Intelligence tab shows:
// 1. Health Score badge and breakdown
// 2. Computed Status cards (time, currency, AD status)
// 3. Open Findings list (with resolve/acknowledge actions)
// 4. Report generation panel (generate any of the 6 report types)
// 5. Generated reports history with download links
```

**Sections to build in this page:**

**Status Cards Row** — Use `aircraft_computed_status` data. Show: TTAF, Engine SMOH, Annual status (with days-to-expiry or days-overdue), ELT/Transponder/Pitot-Static currency badges. Color-coded: green = current, amber = within 60 days, red = overdue.

**Health Score Widget** — A circular score out of 100 with a breakdown tooltip showing each component (annual, ELT, transponder, ADs, required docs). Use a ring chart (Recharts `RadialBarChart`).

**Findings Panel** — Grouped by severity. Each finding card shows: severity badge, title, description, recommendation, and Resolve / Acknowledge action buttons. Show count of critical/warning/info at top.

**Report Generator** — A panel with a grid of report type buttons (Aircraft Overview, Engine & Prop, Inspection Status, Maintenance Timeline, Missing Records, Prebuy Packet). Clicking one queues the job. Show a spinner while generating. When complete, show a Download PDF button.

**Generated Reports History** — Table of past reports with type, date generated, and download link.

### Component: `components/intelligence/FindingCard.tsx`

```typescript
// Props: finding (RecordFinding), onResolve, onAcknowledge
// Renders a finding with severity-based styling
// Resolve button → opens a modal asking for resolution note
// Acknowledge button → marks as acknowledged without resolving (reviewer is aware, can't fix it)
```

### Component: `components/intelligence/ReportGeneratorPanel.tsx`

```typescript
// Props: aircraftId, existingReports
// Shows grid of report type buttons
// On click: POST /api/reports, show progress
// Polls GET /api/reports/[jobId] every 3 seconds until status === 'completed'
// On complete: shows Download button with signed URL
// For prebuy/lender/insurer: triggers payment modal before generation (Feature 10)
```

### Component: `components/intelligence/ComputedStatusGrid.tsx`

```typescript
// Props: status (AircraftComputedStatus)
// Shows the full set of currency indicators
// Each item: label, last done date, next due date, status badge
// Recompute button → POST /api/aircraft/[id]/compute-status
```

---

## 10. Stripe Billing Extensions

### New Products to Create in Stripe

Create these as one-time price products (not subscriptions) in your Stripe dashboard:

| Product | Price | Stripe Product ID (set in env) |
|---------|-------|-------------------------------|
| Prebuy Summary Packet | $99 | `STRIPE_PRODUCT_PREBUY` |
| Lender Collateral Report | $149 | `STRIPE_PRODUCT_LENDER` |
| Insurance Underwriting Summary | $149 | `STRIPE_PRODUCT_INSURER` |

### API Route: `app/api/billing/report-checkout/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-04-10' })

const PRODUCT_MAP: Record<string, string> = {
  prebuy_packet: process.env.STRIPE_PRODUCT_PREBUY!,
  lender_packet: process.env.STRIPE_PRODUCT_LENDER!,
  insurer_packet: process.env.STRIPE_PRODUCT_INSURER!,
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { aircraft_id, report_type } = await req.json()
  const priceId = PRODUCT_MAP[report_type]
  if (!priceId) return NextResponse.json({ error: 'Invalid report type for purchase' }, { status: 400 })

  const { data: org } = await supabase
    .from('organizations')
    .select('stripe_customer_id, name')
    .eq('id', (await supabase.from('aircraft').select('organization_id').eq('id', aircraft_id).single()).data?.organization_id)
    .single()

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer: org?.stripe_customer_id,
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: {
      aircraft_id,
      report_type,
      user_id: user.id,
    },
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/aircraft/${aircraft_id}/intelligence?report_purchased=true&report_type=${report_type}`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/aircraft/${aircraft_id}/intelligence`,
  })

  return NextResponse.json({ checkout_url: session.url })
}
```

### Stripe Webhook Handler — Add to existing `app/api/webhooks/stripe/route.ts`

```typescript
// Add this case to the existing Stripe webhook handler
// Inside the switch(event.type) block:

case 'checkout.session.completed': {
  const session = event.data.object as Stripe.Checkout.Session
  const { aircraft_id, report_type, user_id } = session.metadata ?? {}

  if (aircraft_id && report_type && user_id) {
    // Create the report job, marked as paid
    const { data: job } = await supabase.from('report_jobs').insert({
      aircraft_id,
      organization_id: (await supabase.from('aircraft').select('organization_id').eq('id', aircraft_id).single()).data?.organization_id,
      requested_by: user_id,
      report_type,
      is_paid: true,
      stripe_payment_intent_id: session.payment_intent as string,
      status: 'queued',
    }).select().single()

    if (job) {
      // Trigger generation
      generateReport(job.id).catch(console.error)
    }
  }
  break
}
```

---

## 11. TypeScript Types Reference

### File: `types/intelligence.ts`

```typescript
export interface AircraftComputedStatus {
  id: string
  aircraft_id: string
  organization_id: string
  computed_at: string

  airframe_total_time: number | null
  airframe_time_source_date: string | null

  engine_time_since_new: number | null
  engine_time_since_overhaul: number | null
  engine_last_overhaul_date: string | null
  engine_last_overhaul_shop: string | null
  engine_tbo_hours: number | null
  engine_hours_to_tbo: number | null

  prop_time_since_new: number | null
  prop_time_since_overhaul: number | null
  prop_last_overhaul_date: string | null

  last_annual_date: string | null
  last_annual_aircraft_time: number | null
  annual_next_due_date: string | null
  annual_is_current: boolean

  last_elt_inspection_date: string | null
  elt_next_due_date: string | null
  elt_is_current: boolean

  last_transponder_test_date: string | null
  transponder_next_due_date: string | null
  transponder_is_current: boolean

  last_pitot_static_date: string | null
  pitot_static_next_due_date: string | null
  pitot_static_is_current: boolean

  last_altimeter_date: string | null
  altimeter_next_due_date: string | null
  altimeter_is_current: boolean

  last_vor_check_date: string | null
  vor_check_next_due_date: string | null
  vor_check_is_current: boolean

  total_applicable_ads: number
  ads_complied: number
  ads_open: number
  ads_unknown: number
  next_ad_due_date: string | null
  next_ad_number: string | null

  has_registration: boolean
  registration_expiry_date: string | null
  has_airworthiness_cert: boolean
  has_weight_balance: boolean
  has_equipment_list: boolean

  health_score: number
  health_score_breakdown: Record<string, number>

  created_at: string
  updated_at: string
}

export interface RecordFinding {
  id: string
  aircraft_id: string
  organization_id: string
  findings_run_id: string

  finding_type: string
  severity: 'critical' | 'warning' | 'info'

  title: string
  description: string
  recommendation: string | null

  affected_date_start: string | null
  affected_date_end: string | null
  affected_component: string | null

  source_event_ids: string[] | null
  source_document_ids: string[] | null

  is_resolved: boolean
  resolved_at: string | null
  resolved_by: string | null
  resolution_note: string | null

  is_acknowledged: boolean
  acknowledged_at: string | null
  acknowledged_by: string | null
  acknowledge_note: string | null

  created_at: string
}

export interface FindingsRun {
  id: string
  aircraft_id: string
  organization_id: string
  triggered_by: string | null
  trigger_source: string
  status: 'running' | 'completed' | 'failed'
  findings_count: number
  critical_count: number
  warning_count: number
  info_count: number
  completed_at: string | null
  error_message: string | null
  created_at: string
}

export interface ReportJob {
  id: string
  aircraft_id: string
  organization_id: string
  requested_by: string | null

  report_type: 'aircraft_overview' | 'engine_prop_summary' | 'inspection_status' | 'maintenance_timeline' | 'missing_records' | 'prebuy_packet' | 'lender_packet' | 'insurer_packet'
  status: 'queued' | 'generating' | 'completed' | 'failed'

  options: Record<string, unknown>

  stripe_payment_intent_id: string | null
  is_paid: boolean

  share_token: string | null
  share_token_expires_at: string | null
  share_accessed_count: number

  storage_path: string | null
  signed_url: string | null
  signed_url_expires: string | null
  file_size_bytes: number | null

  generation_started_at: string | null
  generation_completed_at: string | null
  error_message: string | null

  created_at: string
  updated_at: string
}
```

---

## 12. Build Order and Dependencies

Build these features in the following order. Each phase is a mergeable unit of work.

### Phase 1 — Foundation (no UI, pure backend)

1. Apply migrations 023, 024, 025
2. Build `lib/intelligence/computeAircraftStatus.ts`
3. Add `app/api/aircraft/[id]/compute-status/route.ts`
4. Run compute status manually via API for all existing aircraft to seed data
5. Add `types/intelligence.ts`

**Test:** Call `POST /api/aircraft/{id}/compute-status` for a real aircraft. Verify `aircraft_computed_status` is populated correctly. Spot-check annual dates, engine time, AD counts.

### Phase 2 — Detection Engine

1. Build `lib/intelligence/detectMissingRecords.ts`
2. Add `app/api/aircraft/[id]/detect-findings/route.ts`
3. Build `app/api/aircraft/[id]/analyze-discrepancies/route.ts`
4. Run detection for all existing aircraft

**Test:** Run detection against an aircraft with known gaps (e.g., N262EE). Verify findings are logical, well-described, and correctly severity-rated.

### Phase 3 — PDF Infrastructure

1. Install: `npm install puppeteer-core @sparticuz/chromium`
2. Build `lib/intelligence/reports/pdfRenderer.ts`
3. Create Supabase Storage bucket `aircraft-reports` with private access
4. Build `lib/intelligence/generateReport.ts` (dispatcher)
5. Build `app/api/reports/route.ts` (queue + list)
6. Build `app/api/reports/[jobId]/route.ts` (status + signed URL)

**Test:** Queue an `aircraft_overview` report and verify the PDF is generated, stored, and accessible via the signed URL.

### Phase 4 — All Report Types

1. Build `lib/intelligence/reports/aircraftOverview.ts`
2. Build `lib/intelligence/reports/engineReport.ts`
3. Build `lib/intelligence/reports/inspectionReport.ts`
4. Build `lib/intelligence/reports/timelineReport.ts`
5. Build `lib/intelligence/reports/missingRecordsReport.ts`

**Test:** Generate all five free report types. Verify content accuracy and PDF formatting.

### Phase 5 — Prebuy Packet + Billing

1. Build `lib/intelligence/reports/prebuyPacket.ts`
2. Build `app/api/reports/share/route.ts`
3. Create Stripe products for three packet types
4. Build `app/api/billing/report-checkout/route.ts`
5. Update Stripe webhook handler
6. Add `STRIPE_PRODUCT_PREBUY`, `STRIPE_PRODUCT_LENDER`, `STRIPE_PRODUCT_INSURER` to env

**Test:** Complete a test purchase for a prebuy packet. Verify report is generated after payment webhook, share link works without auth.

### Phase 6 — UI (Intelligence Tab)

1. Build `components/intelligence/ComputedStatusGrid.tsx`
2. Build `components/intelligence/FindingCard.tsx`
3. Build `components/intelligence/ReportGeneratorPanel.tsx`
4. Build `app/(dashboard)/aircraft/[id]/intelligence/page.tsx`
5. Add Intelligence tab to aircraft detail navigation

**Test:** Full user flow — navigate to aircraft, view intelligence tab, run detection, view findings, generate a report, download PDF, generate prebuy packet (test mode payment).

### Phase 7 — Automation

1. Add post-canonicalization trigger: after `POST /api/ocr/canonicalize` completes successfully, automatically trigger `computeAircraftStatus` and `detectMissingRecords` for the affected aircraft
2. Add Supabase cron job (pg_cron) to recompute status for all aircraft nightly
3. Add UI indicator showing "Last analyzed: X hours ago" with a manual Reanalyze button

---

## Environment Variables (additions to existing .env)

```bash
# Prebuy / Report Billing (Stripe one-time products)
STRIPE_PRODUCT_PREBUY=price_...
STRIPE_PRODUCT_LENDER=price_...
STRIPE_PRODUCT_INSURER=price_...

# Puppeteer / Chromium (Vercel-compatible PDF rendering)
# @sparticuz/chromium is self-contained — no additional env vars needed
# but ensure Vercel function timeout is set to 60s for report generation routes
```

### Vercel Function Configuration (`vercel.json` additions)

```json
{
  "functions": {
    "app/api/reports/route.ts": {
      "maxDuration": 60
    },
    "app/api/reports/[jobId]/route.ts": {
      "maxDuration": 30
    },
    "app/api/aircraft/[id]/detect-findings/route.ts": {
      "maxDuration": 30
    }
  }
}
```

---

*End of Layer B Implementation Handoff — MyAircraft Records Intelligence*
*Generated April 2026 · myaircraft.us*
