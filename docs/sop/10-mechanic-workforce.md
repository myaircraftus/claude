---
sop_id: "SOP-10"
title: "Mechanic & Workforce Management"
module: "workforce"
version: "1.0.0"
status: "active"
last_updated: "2026-05-21"
faa_refs: ["14 CFR 65", "14 CFR 65.81", "14 CFR 65.85", "14 CFR 65.87", "14 CFR 43.3"]
source_file: "mark downs/manuals/SOP-WRK-001_Workforce_Suite.docx"
---

# myaircraft.us Mechanic & Workforce Management — SOP and Product Specification

**Audience:** shop owners, lead mechanics, IAs, admins, product engineers building the Workforce suite.
**Purpose:** the contract for how the platform models mechanics, their certificates, their authorizations, their time, and their work assignments. Every other operational module (work orders, squawks, logbook entries, estimates) depends on the workforce model being correct.

---

## 1. Executive Summary

A maintenance shop's most regulated asset is its mechanics. Each one carries an FAA certificate with specific ratings (Airframe, Powerplant, IA), each one has personally signed off on aircraft work that the platform must preserve as an immutable record, and each one is subject to recurrent training and currency requirements.

The Workforce module is the **system of record** for:

- Who works at the shop, what role and certificate they hold
- What aircraft they are authorized to work on (per shop policy)
- Who can supervise whom (apprentice → A&P → IA hierarchy)
- Who clocked in for which job, for how long, at what billable rate
- Who signed which logbook entry, with full audit trail
- When certificates expire, when training is due, when medicals lapse

Doing this well unlocks the rest of the platform: work orders auto-route to qualified mechanics, logbook signatures are correctly attributed, payroll reports compute themselves, and FAA audits become a one-click report. Doing it badly creates compliance liability — an apprentice signs an annual, an IA's authorization lapses unnoticed, time entries don't reconcile to invoices.

This SOP defines the data model, the roles, the workflows, and the compliance checks.

---

## 2. Persona definitions

The platform recognizes the following workforce personas. Each has a corresponding `organization_memberships.role` value.

| Persona | Role | FAA basis | Typical authority |
|---|---|---|---|
| **Apprentice** | `apprentice` | Under-supervision per 14 CFR 65.85 | Can perform work but cannot sign |
| **A&P Mechanic** | `mechanic` | Airframe + Powerplant per 14 CFR 65.81 | Sign maintenance work within scope |
| **IA (Inspection Authorization)** | `ia` | 14 CFR 65.91 | Sign annual inspections + major repairs/alterations |
| **Lead Tech / Shop Foreman** | `lead` | Internal designation | Approve apprentice work; assign jobs; review WOs |
| **Service Writer / Admin** | `admin` | Internal | Customer-facing — quotes, invoices, scheduling |
| **Parts / Inventory Specialist** | `parts` | Internal | Receive, issue, audit parts |
| **Billing / AP-AR** | `billing` | Internal | Read-only on operational, full on financial |

A single user MAY hold multiple personas in different organizations. Within ONE organization, a user holds exactly ONE primary role at any time.

### 2.1 Special permissions overlays

Independent of the primary role, a mechanic record may carry boolean flags:
- `is_active` — currently employed
- `can_sign_logbook` — derived from role (mechanic / ia / lead) and certificate validity
- `can_sign_annual` — IA only; further gated on IA renewal date
- `can_supervise_apprentices` — A&P+ only
- `accepts_walk_in_work` — used by the WO auto-routing logic

---

## 3. Mechanic master record (data model)

### 3.1 `mechanics` table

```sql
CREATE TABLE mechanics (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         UUID NOT NULL REFERENCES organizations(id),
  user_id                 UUID REFERENCES auth.users(id),       -- NULL if mechanic doesn't have a portal login
  membership_id           UUID REFERENCES organization_memberships(id),
  full_name               TEXT NOT NULL,
  display_name            TEXT,
  email                   TEXT,
  phone                   TEXT,

  -- FAA certificate identity
  faa_certificate_number  TEXT,                                  -- '3712461' (the printed number)
  faa_first_name          TEXT,                                  -- as printed on certificate
  faa_last_name           TEXT,
  faa_date_of_birth       DATE,
  airman_certificate_url  TEXT,                                  -- signed URL to uploaded image

  -- Ratings & authorizations
  rating_airframe         BOOLEAN NOT NULL DEFAULT FALSE,
  rating_powerplant       BOOLEAN NOT NULL DEFAULT FALSE,
  rating_inspection_auth  BOOLEAN NOT NULL DEFAULT FALSE,        -- IA holder
  rating_ia_issued_date   DATE,
  rating_ia_renewal_due   DATE,                                  -- IAs renew annually
  repairman_authorization TEXT,                                  -- if applicable

  -- Employment metadata
  hire_date               DATE,
  termination_date        DATE,
  is_active               BOOLEAN NOT NULL DEFAULT TRUE,
  billable_rate_cents     INTEGER,                               -- shop default; override per WO
  cost_rate_cents         INTEGER,                               -- internal cost basis
  default_authority       TEXT,                                  -- 'apprentice' | 'mechanic' | 'ia' | 'lead'

  -- Compliance
  next_recurrent_training_due DATE,
  drug_test_last_passed   DATE,
  medical_class           TEXT,                                  -- if applicable
  medical_expiration      DATE,

  notes                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mechanics_org    ON mechanics(organization_id);
CREATE INDEX idx_mechanics_active ON mechanics(organization_id, is_active);
CREATE INDEX idx_mechanics_user   ON mechanics(user_id) WHERE user_id IS NOT NULL;
```

**Why a separate `mechanics` table vs reusing `user_profiles`:** not every mechanic in the system has a portal login. Some shops onboard their crew as records-only (their actual day-to-day login is paper or a different tool). Others have all hands in the portal. The separation lets us link via `user_id` when present and stand alone otherwise.

### 3.2 `mechanic_certificate_history` table

Every certificate update is logged immutably:

```sql
CREATE TABLE mechanic_certificate_history (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mechanic_id         UUID NOT NULL REFERENCES mechanics(id),
  changed_field       TEXT NOT NULL,                              -- 'rating_inspection_auth' | 'rating_ia_renewal_due' | ...
  old_value           TEXT,
  new_value           TEXT,
  changed_by_user_id  UUID NOT NULL,
  changed_by_role     TEXT NOT NULL,
  reason              TEXT,                                       -- 'IA renewal completed' | 'FAA revoke notice' | ...
  evidence_url        TEXT,                                       -- link to uploaded proof
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

This is the SOC2-grade audit trail required to prove that an IA designation was added on a date with valid evidence (the renewal certificate PDF).

### 3.3 `mechanic_aircraft_qualification` table

Some shops restrict who can work on which aircraft (training, type-club requirements, customer preferences):

```sql
CREATE TABLE mechanic_aircraft_qualification (
  mechanic_id       UUID NOT NULL REFERENCES mechanics(id),
  aircraft_id       UUID NOT NULL REFERENCES aircraft(id),
  qualified         BOOLEAN NOT NULL DEFAULT TRUE,
  reason            TEXT,                                         -- 'Cessna Caravan transition course completed' | ...
  approved_by       UUID,
  approved_at       TIMESTAMPTZ,
  PRIMARY KEY (mechanic_id, aircraft_id)
);
```

By default, a mechanic CAN work on any aircraft in the shop. This table is an explicit deny-list when set with `qualified=false` or an explicit allow-list when the shop has opted into a strict-qualification policy.

---

## 4. Onboarding a mechanic

### 4.1 Invitation flow

Lead / admin opens `/admin/users` → "Invite mechanic" button → fills a form:

- Full name (required)
- Email (required, becomes their login)
- Initial role: apprentice / mechanic / ia / lead (admin picks)
- Optional: billable rate, hire date

System creates:
1. `user_invite` row with a magic-link token
2. `mechanics` row stub (just name + email + org)
3. Sends email with the magic link

### 4.2 First-login flow

Mechanic clicks the magic link → lands on `/onboarding/mechanic`:

1. **Verify identity** — confirm name, set password
2. **Upload FAA airman certificate** — drag-drop image or PDF
3. **Auto-fill ratings** — OCR reads the certificate, pre-populates `rating_airframe`, `rating_powerplant`, `rating_inspection_auth`, `faa_certificate_number`
4. **Confirm ratings** — mechanic verifies; lead must approve before ratings go live
5. **Complete acknowledgments** — shop SOPs, NDA, payroll forms (if required)
6. **Set personal preferences** — display name, time zone, notification preferences

Until step 4 is confirmed by a lead, the mechanic has role `apprentice` regardless of what they uploaded.

### 4.3 Lead approval

Lead reviews the certificate upload at `/admin/users/[id]/verify`. Side-by-side: certificate image + the auto-filled ratings form. Lead can:
- **Approve** — flips ratings live; logs to `mechanic_certificate_history`
- **Request correction** — sends mechanic back to step 3 with a note
- **Reject** — closes the invite; the mechanic's account remains in `apprentice` mode

---

## 5. Certificate currency & alerts

The platform monitors certificate-related deadlines and surfaces them in the lead's dashboard.

### 5.1 IA renewal

IAs renew annually by March 31 (FAA rule). 90 days before expiration → notification to lead + IA. 30 days before → urgent banner in IA's dashboard. After expiration → `can_sign_annual` flips to false automatically; the IA can still sign non-annual work as a regular A&P.

### 5.2 Recurrent training

If `next_recurrent_training_due` is set, the system alerts 60 days out. Not currently FAA-mandated for all maintenance personnel but commonly required by repair stations under their own PMI-approved manuals.

### 5.3 Drug testing (DOT 49 CFR Part 121, where applicable)

For shops that hold a Part 145 certificate, drug-test currency is tracked. Out-of-currency flags the mechanic as unable to sign any safety-sensitive maintenance until cleared.

---

## 6. Time tracking (Clock In / Clock Out)

### 6.1 The clock-in surface

A persistent "Clock In" button in the topbar (only visible to roles `mechanic`, `ia`, `lead`, `apprentice`). Clicking opens a modal:

- **Clock in to:** dropdown of open work orders assigned to this mechanic, plus "shop time" (general non-WO labor) and "training" (non-billable)
- **Optional:** select an aircraft (auto-populated from the chosen WO)
- **Optional:** notes

The mechanic clicks "Start." The platform creates a `clock_event` row with `started_at=NOW()`.

### 6.2 Clock out

Same button (now showing the running timer). Click → modal with elapsed time + a notes field + "Stop" button.

### 6.3 `clock_events` table

```sql
CREATE TABLE clock_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID NOT NULL REFERENCES organizations(id),
  mechanic_id         UUID NOT NULL REFERENCES mechanics(id),
  user_id             UUID NOT NULL,                              -- redundant with mechanic_id, kept for fast user lookups
  work_order_id       UUID REFERENCES work_orders(id),            -- NULL for shop time / training
  aircraft_id         UUID REFERENCES aircraft(id),
  activity_type       TEXT NOT NULL                                -- 'wo_labor' | 'shop_time' | 'training' | 'break' | 'travel'
                        DEFAULT 'wo_labor',
  started_at          TIMESTAMPTZ NOT NULL,
  ended_at            TIMESTAMPTZ,
  duration_minutes    INTEGER GENERATED ALWAYS AS (
                        CASE WHEN ended_at IS NULL THEN NULL
                             ELSE GREATEST(0, EXTRACT(EPOCH FROM (ended_at - started_at))::INT / 60)
                        END
                      ) STORED,
  billable            BOOLEAN NOT NULL DEFAULT TRUE,
  billable_rate_cents INTEGER,                                     -- snapshot of rate at clock-in
  notes               TEXT,
  void                BOOLEAN NOT NULL DEFAULT FALSE,
  voided_by           UUID,
  voided_reason       TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_clock_events_mechanic_active ON clock_events(mechanic_id) WHERE ended_at IS NULL;
CREATE INDEX idx_clock_events_wo               ON clock_events(work_order_id) WHERE work_order_id IS NOT NULL;
CREATE INDEX idx_clock_events_org_date         ON clock_events(organization_id, started_at);
```

### 6.4 Rules

- **One open clock per mechanic.** If a mechanic clocks in to WO-A and clicks Clock In again on WO-B, the system MUST close the WO-A clock first.
- **Auto-closing.** If `started_at` is more than 16 hours ago and `ended_at` is NULL, a nightly cron auto-closes with a `notes` flag "auto-closed: forgot to clock out" and notifies the mechanic + lead.
- **Void rather than delete.** Mistaken clock entries are voided, never deleted. Voided rows are kept for audit.
- **Rate snapshot.** `billable_rate_cents` is snapshotted at clock-in. If the mechanic's shop rate changes mid-week, the running clock keeps the old rate for that entry — fairer to the customer and to the mechanic.

### 6.5 Adjustments

A lead can edit a clock entry's `started_at` / `ended_at` / `notes` for up to 14 days after the clock closed. After 14 days, only an admin can edit, and the edit is recorded in an audit log. The original values are never overwritten — they're moved to a `clock_event_history` row.

---

## 7. Work order assignment

### 7.1 Assignment rules

When a work order is created, the system auto-suggests an assignee:

1. If the WO references a specific aircraft and only one mechanic in the shop is `qualified` for that aircraft → assign to them
2. Else: rank by current open WOs (least loaded), filter by required ratings (annual → IA only), pick top
3. Lead can always override

### 7.2 Skills filter

WOs may carry a `required_authority` field (`apprentice` / `mechanic` / `ia`). Assignment respects it:
- `required_authority=ia` → only IA-rated mechanics
- `required_authority=mechanic` → A&P or higher
- `required_authority=apprentice` → anyone

### 7.3 Reassignment

Lead can reassign at any time. The previous assignee's open clock (if any) closes automatically with a system note "reassigned to {new mechanic}".

---

## 8. Logbook signatures

### 8.1 Who can sign what

| Entry type | Required role |
|---|---|
| Annual inspection | `ia` (and `rating_inspection_auth=true` AND `rating_ia_renewal_due > today`) |
| 100-hour inspection | `mechanic` (A&P) |
| AD compliance | `mechanic` (A&P) |
| Major repair / Major alteration | `ia` |
| Routine maintenance | `mechanic` (A&P) |
| Preventive maintenance | `mechanic` (A&P) — owner-permissive items per 14 CFR Part 43 App A can be signed by certificated pilot owner; the platform doesn't yet model that |

The signing UI enforces this: the "Sign" button is disabled with a tooltip if the current user's role/ratings don't permit it.

### 8.2 Apprentice work

An apprentice CAN perform work but CANNOT sign. The workflow:

1. Apprentice clocks in to WO and performs tasks
2. Apprentice marks tasks complete with their notes
3. Supervising A&P / IA reviews the work
4. Supervising mechanic signs the logbook entry — the entry carries BOTH names: "Work performed by {apprentice}, supervised and signed by {A&P}"

This is the `entry_signed_by` field plus an `entry_performed_by` array on logbook_entries.

### 8.3 Signature evidence

Every signed logbook entry produces a row in `e_signature_audit` (see SOP-07 for the logbook entry detail). For workforce purposes the relevant fields:

- `signer_user_id`
- `signer_mechanic_id`
- `signer_role_at_sign_time` (snapshot — if the mechanic was an IA at signing, that's recorded even if they later lose IA)
- `signer_cert_number`
- `signature_timestamp`
- `signer_ip`
- `device_fingerprint`

Snapshotting the signer's role at sign time is critical for compliance — a 2026 annual signed by an IA must remain a "signed by IA" record forever, even if that IA's authorization later lapses.

---

## 9. Reports and payroll

### 9.1 Hours-by-mechanic-by-week

Lead-accessible report. Sums `clock_events.duration_minutes` grouped by mechanic, filtered by `started_at` range. Subdivided by activity type so the lead sees "X hours WO labor, Y hours shop, Z hours training."

### 9.2 Hours-by-aircraft

For owners and for cost-tracking. Sums all WO-labor clock entries on each aircraft.

### 9.3 Billable vs cost margin

Internal-only report. For each WO: sum of clock_events × billable_rate vs sum × cost_rate vs invoiced amount. Surfaces over/under-billing.

### 9.4 Payroll export

CSV export of clock entries with `mechanic_id`, `started_at`, `duration_minutes`, `cost_rate_cents`, activity_type, void status. Compatible with Gusto/Rippling/QuickBooks payroll formats.

---

## 10. Permissions matrix

| Action | Apprentice | Mechanic | IA | Lead | Admin | Billing |
|---|---|---|---|---|---|---|
| View own mechanic profile | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Edit own profile (limited) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Upload certificate | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Approve another mechanic's certificate | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ |
| Clock in/out (self) | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Adjust own clock entry (within 14 days) | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ |
| Adjust another's clock entry (within 14 days) | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ |
| Adjust clock entry > 14 days old | ❌ | ❌ | ❌ | ❌ | ✅ (audited) | ❌ |
| View any mechanic's profile | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Edit another mechanic's billable rate | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Invite a new mechanic | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ |
| Deactivate a mechanic | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Sign routine maintenance | ❌ | ✅ | ✅ | ✅ | — | ❌ |
| Sign annual inspection | ❌ | ❌ | ✅ (if current) | ❌ | — | ❌ |
| View payroll reports | ❌ | ❌ | ❌ | ✅ (own + reports) | ✅ | ✅ |

---

## 11. Compliance and audit

### 11.1 14 CFR §65 references

- §65.81 — General privileges and limitations
- §65.85 — Airframe rating; additional privileges (supervising apprentices)
- §65.87 — Powerplant rating; additional privileges
- §65.91 — Inspection authorization
- §65.93 — IA renewal requirements
- §65.95 — Inspection authorization limitations

### 11.2 14 CFR §43.3 — Persons authorized to perform maintenance

The platform's role gating is the codification of §43.3. The mechanic's certificate must support the work being performed; the platform's permission check is the operational enforcement.

### 11.3 Audit trail

Every mutation to a `mechanics` row produces a `mechanic_certificate_history` row. Every mutation to a `clock_events` row writes a `clock_event_history` row (NULL on initial insert; one row per subsequent edit). These tables are append-only — no UPDATE / DELETE statements allowed at the application layer.

### 11.4 Retention

Mechanic records, certificate history, clock events, and signature audits are retained **forever**. Deactivating a mechanic sets `is_active=false` but the row stays. The FAA can audit work performed years after a mechanic has left the shop.

---

## 12. Acceptance criteria

1. A lead can invite a mechanic via email; the mechanic receives a working magic link.
2. A first-login mechanic can upload their FAA airman certificate; OCR pre-fills ratings.
3. A lead can approve ratings; ratings go live and a `mechanic_certificate_history` row is written.
4. An apprentice cannot sign any logbook entry; the "Sign" button is disabled with a tooltip.
5. An A&P can sign routine maintenance but the "Sign Annual" affordance is hidden.
6. An IA whose `rating_ia_renewal_due` is in the past cannot sign an annual; the affordance is disabled with the reason "IA renewal expired YYYY-MM-DD".
7. A mechanic can clock in to a specific WO; the timer persists across navigation.
8. Clocking in while already clocked in to another WO auto-closes the prior clock.
9. A mechanic who is clocked in for > 16 hours has the clock auto-closed by the nightly cron with a `notes` flag.
10. A lead can adjust a clock entry within 14 days; the prior values are preserved in `clock_event_history`.
11. Mechanic-by-week hours report sums clock_events.duration_minutes correctly.
12. Voiding a clock entry sets `void=true` and excludes it from reports but does not delete it.
13. A signed logbook entry's `signer_role_at_sign_time` is immutable even if the signer's role later changes.
14. Deactivating a mechanic (`is_active=false`) hides them from assignment dropdowns but does not lose any history.
15. The mechanic_aircraft_qualification table can be used to deny a mechanic from a specific aircraft.
16. RLS isolates `clock_events`, `mechanics`, and `mechanic_certificate_history` per `organization_id`.
17. Payroll export CSV contains every non-voided clock entry in the requested period with rate snapshots.

---

## 13. Out-of-scope notes (deferred to future SOPs)

- **Multi-rate mechanics** (different rate per aircraft type) — would require a `mechanic_rate_override` table.
- **Mechanic scheduling / shift planning** — currently lead-managed manually.
- **Apprentice OJT tracking** (formal logging of supervised hours toward A&P eligibility) — a real shop feature but defer to Workforce Suite v2.
- **Multi-shop mechanics** (an A&P who works at two different shops) — already supported via multiple memberships, but the UI doesn't surface cross-shop visibility.

---

## 14. References

- 14 CFR Part 65 — Certification: Airmen Other Than Flight Crewmembers: https://www.ecfr.gov/current/title-14/chapter-I/subchapter-D/part-65
- 14 CFR §43.3 — Persons authorized to perform maintenance: https://www.ecfr.gov/current/title-14/chapter-I/subchapter-C/part-43/section-43.3
- FAA AC 65-2D — Air Worthiness Inspection Authorization
- DOT 49 CFR Part 121 — Drug & alcohol testing (Part 145 shops only)

---

**Document control:**
- SOP ID: SOP-10
- Version: 1.0.0
- Status: active
- Last updated: 2026-05-21
- Authors: Claude (Opus 4.7) — derived from `SOP-WRK-001_Workforce_Suite.docx` and platform codebase
- Next review: 2026-08-21
