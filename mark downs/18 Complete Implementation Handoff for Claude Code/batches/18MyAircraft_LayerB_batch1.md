<!-- ================================================================
  MyAircraft — Layer B: Records Intelligence
  BATCH 1 of 3  |  1004 lines
  Covers: Sections 1–4 (Overview, DB Migrations 023–025, Feature A: computeAircraftStatus, Feature B: detectMissingRecords — through detectMissingEngineDocumentation)
  ================================================================ -->

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
