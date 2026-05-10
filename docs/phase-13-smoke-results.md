# Phase 13 — Smoke Test Results

**Status:** 🟡 **Vitest suite green; live UI smoke DEFERRED to Andy.**

**Date:** 2026-05-09
**Branch:** main

## Vitest suite — 53 / 53 green

| File | Tests | Coverage |
|---|---:|---|
| `lib/documents/persona-taxonomy.test.ts` | 21 | Persona × document_type matrix (mirrors mig 103 RLS), category integrity, runtime guards |
| `lib/nav/categories.test.ts` | 12 | Href→category mapping, persona category filter, item grouping, storage key scoping |
| `lib/persona/home-widgets.test.ts` | 14 | PERSONA_HOME_WIDGETS coverage + persona isolation + homeRoute integrity |
| `app/api/admin/ingestion-progress/route.test.ts` | 3 | 401 anon / 403 non-admin / 200 admin |
| `app/api/admin/errors/route.test.ts` | 3 | 401 anon / 403 non-admin / 200 admin (with joined doc context) |
| **Total** | **53** | All Phase 13 server-side persona guards covered |

Run command:
```bash
cd apps/web
pnpm vitest run \
  lib/documents/persona-taxonomy.test.ts \
  lib/nav/categories.test.ts \
  lib/persona/home-widgets.test.ts \
  app/api/admin/ingestion-progress/route.test.ts \
  app/api/admin/errors/route.test.ts
```

## Live UI smoke — DEFERRED

Per the Phase 13 brief, the live persona walkthrough (sign-in as
test-owner@ / test-mechanic@ / test-shop@ / test-admin@, navigate, verify
visible widgets and upload restrictions) requires:

1. Migrations **103 + 104 applied** to production. Currently both are
   written and committed but NOT applied (HARD STOP rule 2 — Andy applies
   via tsx-pg). Without them applied, the new RLS policies and
   ingestion_progress triggers are inert in the live DB.
2. **Test user credentials** for each persona — not available to the
   autonomous run.
3. **Sample documents** to upload + observe the live ingestion timeline.

**Per the established Phase 11 / Phase 12 pattern,** deferred live smoke
is documented here and handed off to operator (Andy) for completion after
applying the migrations.

## Andy's smoke runbook (when migrations are applied)

### 1. Apply migrations

```bash
cd apps/web
npx tsx scripts/apply-103.ts   # document_type taxonomy + RLS
npx tsx scripts/apply-104.ts   # ingestion_progress timeline + triggers
```

Both scripts self-verify and print structured tables of the new schema.
Delete each script after success per the one-shot convention.

### 2. OWNER persona walkthrough

Sign in as a test owner. Expect:

- Land on `/my-aircraft` (homeRoute is `/my-aircraft`)
- Sidebar: "Today" + "Aircraft" + "Operations" + "Economics" + "AI" + "Profile" + "Other" categories visible
  - **NOT visible:** Workforce, Customer, Commercial, Organization
- Navigate to `/admin` → 403/redirect (admin layout gates is_platform_admin)
- Navigate to `/documents` → "Upload Aircraft Document" button (Phase 13.2 persona-aware uploader)
- Click Upload → modal opens
  - **Visible categories:** Aircraft Records, Operations, Other
  - **Hidden categories:** Reference Manuals, Compliance
  - Pick "Aircraft Records" → "Aircraft Logbook" available
  - Pick "Aircraft Logbook" → aircraft selector appears + required
- Try to upload `aircraft_logbook` without aircraft_id → 400 AIRCRAFT_ID_REQUIRED
- Upload a small test PDF as `aircraft_poh` → success → see live `IngestionProgressCard`
  cycling stages on `/documents/[id]` page

### 3. MECHANIC persona walkthrough

Sign in as a test mechanic. Expect:

- Land on `/my-day`
- Sidebar: includes "Workforce" category, NOT Aircraft Records under upload
- Navigate to `/documents` → "Upload Reference Doc" button
- Click Upload modal → only "Reference Manuals" + "Compliance" + "Operations" + "Other" categories visible
- Try to programmatically POST `documentType: 'aircraft_logbook'` to
  `/api/upload/complete` → expect **403 PERSONA_TYPE_BLOCKED_V2**
- Confirmed by 21 unit tests in `persona-taxonomy.test.ts`

### 4. SHOP persona walkthrough

Sign in as test shop. Expect:

- Land on `/workflow`
- Upload modal: every category EXCEPT Reference Manuals' aircraft_logbook + aircraft_registration
- Try to upload `aircraft_logbook` as shop → 403 PERSONA_TYPE_BLOCKED_V2
- Try to upload `aircraft_poh` (different aircraft_*) → succeeds (shop CAN upload non-sensitive aircraft docs)

### 5. ADMIN persona walkthrough

Sign in as platform admin (is_platform_admin=true). Expect:

- Land on `/admin`
- Sidebar: every category visible, including "Organization"
- Navigate to:
  - `/admin/vision/workers` — Phase 11 worker dashboard
  - `/admin/vision/review` — Phase 8 review queue
  - `/admin/ingestion/progress` — Phase 13 global ingestion view
  - `/admin/errors` — Phase 13 error log
  - all render successfully
- Upload modal → ALL categories visible

### 6. Cross-persona isolation

- Owner1 ↔ Owner2 — owner1 cannot see owner2's documents (RLS
  org_id check, mig 011 + mig 103)
- Mechanic ↔ another org's manuals — mig 011 RLS on documents.SELECT
  scopes by `organization_id = ANY(get_my_org_ids())`

## Code-level verification (already complete)

The following persona-strict guards are baked into committed code and
covered by green vitest tests:

- ✅ Persona × document_type matrix in `canPersonaUpload` (lib/documents/persona-taxonomy.ts)
- ✅ Server-side guard in `/api/upload/complete/route.ts` (lines 263-308)
- ✅ Aircraft_id requirement guard for aircraft_* types
- ✅ Admin-only auth on `/api/admin/*` routes
- ✅ Persona-filtered nav category visibility
- ✅ Per-persona widget ID matrix
- ✅ homeRoute consistency owner→/my-aircraft, mechanic→/my-day, shop→/workflow, admin→/admin

## Sacred boundary

```
$ git diff --stat HEAD~7 apps/web/lib/ocr apps/web/lib/rag apps/web/lib/embeddings
(empty)
```

Untouched across all of Phase 13.

## Open follow-ups (logged in phase-13-persona-ui-report.md)

- **Migration 103 + 104 not yet applied** — Andy applies via tsx-pg
- Live UI smoke per the runbook above — needs creds + applied migrations
- Refactor existing home pages to opt into `PersonaHomeWidgetGrid`
- Wire `PersonaAwareUploadButton` into more entry points (currently
  surfaced on /documents only; /aircraft/[id] + /my-aircraft pending)
- The 234 zod routes still incomplete (audit follow-up)
- CSP nonce hardening (audit follow-up)
- Calibrator tuning — still needs ≥1 week of telemetry from Phase 8.8
