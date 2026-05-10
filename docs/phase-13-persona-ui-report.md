# Phase 13 — Persona-Strict UI Refactor Report

**Status:** 🟢 **All 8 sprints shipped.** Migrations 103+104 written but
NOT applied (HARD STOP rule 2 — Andy applies via tsx-pg). Live UI smoke
deferred to Andy per the established pattern.

**Date:** 2026-05-09
**Branch:** main
**Commits:** `24b9e01` (13.1) → `f598dca` (13.2) → `6d15c30` (13.3) → `239a69c` (13.4) → `66c350a` (13.5) → `33fd091` (13.6) → `19abab7` (13.7) → this report (13.8)

## TL;DR

Phase 13 made every page persona-aware:

- **Owners** see aircraft documents + reference manuals (read-only) and can
  upload only their own aircraft records.
- **Mechanics** see reference manuals (and upload them) but cannot upload
  aircraft-specific records.
- **Shop** sees everything except logbooks/registrations (those stay
  owner-only by policy).
- **Admins** see everything — including a new error log surface
  (`/admin/errors`) and global ingestion progress (`/admin/ingestion/progress`).

The DB enforces who can upload what via RLS (mig 103); the UI enforces it
via persona-filtered upload modals; the server enforces it via re-checks
in `/api/upload/complete` so users get clean 403s instead of opaque RLS
denials.

A new collapsible nav with 10 persona-filtered categories (mig brief Phase 2
deferred — closed) keeps each persona focused on their relevant surfaces.
Live ingestion progress (mig 104) gives uploaders real-time feedback as
their docs traverse the OCR → text-embed → vision-render → vision-embed →
indexed pipeline.

## Sprint outcomes

### Sprint 13.1 — Document type taxonomy + RLS upload permissions (`24b9e01`) ✅

- ✅ `supabase/migrations/103_document_types.sql` (NOT applied)
  - `documents.document_type` TEXT (23-value taxonomy with CHECK constraint)
  - `documents.uploaded_by_persona` TEXT (4-value CHECK)
  - SQL helper `user_persona_in_org(uuid)` mirrors `lib/persona/server.ts`
    fallback (is_platform_admin → membership.persona → profile.persona → 'owner')
  - Replaces `documents_insert` RLS policy with persona × type matrix
  - 3 new indexes (org+type, org+aircraft, persona)
  - Backfill maps legacy `doc_type` → new `document_type` for existing rows
  - Service-role inserts bypass RLS (ingestion/auto-dispatch unaffected)
- ✅ `apps/web/lib/documents/persona-taxonomy.ts` — DOCUMENT_TYPES const,
  meta map, canPersonaUpload, getAllowedUploadTypes, getAllowedCategories,
  requiresAircraftId, isDocumentType, inferDocumentTypeFromLegacy
- ✅ `apps/web/lib/documents/schemas.ts` — zod schemas for upload metadata
- ✅ `apps/web/lib/documents/persona-taxonomy.test.ts` — 21 tests (catalog
  integrity, aircraft_id requirement, persona × type matrix, runtime guards)
- ✅ `apps/web/scripts/apply-103.ts` — verifies columns, CHECK constraints,
  indexes, RLS policy, helper function, backfill distribution

### Sprint 13.2 — Persona-scoped upload UI + server guard (`f598dca`) ✅

- ✅ `apps/web/components/documents/persona-aware-upload-modal.tsx` —
  lightweight modal that renders only the categories + types the active
  persona is allowed to upload. Aircraft selector appears only for
  `requiresAircraftId` types and locks when launched from a per-aircraft
  page.
- ✅ `apps/web/components/documents/persona-aware-upload-button.tsx` —
  trigger with persona-derived label ("Upload Aircraft Document" / "Upload
  Reference Doc" / "Upload Document" / "Upload Any") + pass-through for
  org + aircraft context.
- ✅ `apps/web/app/api/upload/complete/route.ts` patched — accepts new
  fields `documentType` + `uploadedByPersona`; validates persona × type
  via the new taxonomy and returns:
  - `403 PERSONA_TYPE_BLOCKED_V2` on persona × type mismatch
  - `400 AIRCRAFT_ID_REQUIRED` when requiresAircraftId(type) without aircraft_id
  - Inserts both legacy `doc_type` AND new `document_type` +
    `uploaded_by_persona` columns so RLS in mig 103 + downstream
    classification both work.
- ✅ Older clients that don't send the new fields auto-infer from `doc_type`
- ✅ `/documents` page surfaces the new uploader as the primary action;
  legacy `/documents/upload` page demoted to "Advanced" outline button

### Sprint 13.3 — Live ingestion progress (`6d15c30`) ✅

- ✅ `supabase/migrations/104_ingestion_progress.sql` (NOT applied)
  - Timeline table (`uploaded → ocr → chunking → text_embedding →
    vision_render → vision_embedding → indexed | failed`)
  - 3 indexes (doc, org, active-only filtered)
  - RLS: org-scoped SELECT only; INSERT/UPDATE service-role only
  - Three triggers wire it up WITHOUT touching sacred /lib/ocr or /lib/rag:
    1. `AFTER INSERT ON documents` → emit 'uploaded'
    2. `AFTER UPDATE OF parsing_status` → mirror to ocr/chunking/text_embedding/indexed/failed
    3. `AFTER INSERT/UPDATE ON vision_pages` → emit vision_render/vision_embedding
       (idempotent: one row per (doc, stage) regardless of page count)
  - `updated_at` trigger
  - Stage transitions auto-close prior open rows so the timeline shows clean handoffs
- ✅ `apps/web/components/documents/ingestion-progress-card.tsx` —
  realtime-subscribed timeline. Auto-hides 5s after 'indexed'; shows
  error_message with persona-aware redaction (admin sees full err, others
  see friendly message) on 'failed'.
- ✅ Card mounted at top of `/documents/[id]` detail page
- ✅ `apps/web/app/(app)/admin/ingestion/progress/` — admin-only global view.
  SSR pre-loads 500 rows, client polls `/api/admin/ingestion-progress`
  every 30s with active/failed/all filter.
- ✅ `apps/web/app/api/admin/ingestion-progress/route.ts` — gated via
  is_platform_admin, 3 unit tests covering 401/403/200 paths
- ✅ `apps/web/scripts/apply-104.ts` — verifies table, indexes, triggers, RLS

### Sprint 13.4 — Admin-only views + /admin/* gating (`239a69c`) ✅

- ✅ `apps/web/app/(app)/admin/errors/page.tsx` + `error-log-client.tsx` —
  lists every doc with stage='failed' from ingestion_progress, joined
  with documents for title + uploader persona context. Filters: open / all.
  Polls `/api/admin/errors` every 60s.
- ✅ `apps/web/app/api/admin/errors/route.ts` — GET feed, is_platform_admin
  gated. 3 unit tests covering 401/403/200 paths.
- ✅ `apps/web/app/api/admin/errors/retry/route.ts` — POST re-enqueues
  into vision_index_jobs via Phase 12 `enqueueDocumentForVision` (idempotent).
- ✅ `apps/web/app/api/admin/errors/resolve/route.ts` — POST sets
  `metadata.resolved=true` on the progress row so resolved errors drop
  out of the default view.
- ✅ AppLayout's `adminNavItems` gets two new entries — "Ingestion Progress"
  + "Errors". Both routes are inside `/admin/*` so the layout's
  is_platform_admin gate applies; non-admin personas don't render this nav array.

**Audit findings (already gated, no changes needed):**
- /api/admin/marketing-content    — gated ✅
- /api/admin/feedback             — gated ✅
- /api/admin/support              — gated ✅
- /api/admin/settings             — gated ✅ (requirePlatformAdmin helper)
- /api/admin/classify-backfill    — gated ✅
- /api/admin/ingestion-health     — gated ✅
- /api/admin/marketing-assets     — gated ✅
- /api/admin/test-query           — internal-secret gated ✅
- /api/admin/ingestion-progress   — gated ✅ (Sprint 13.3)
- /api/admin/errors               — gated ✅ (Sprint 13.4)

All admin pages live under `/admin/*` so the layout already covers the
page-level gate (two-tier check: org admin/owner role + is_platform_admin).

### Sprint 13.5 — Collapsible nav categories (`66c350a`) ✅

- ✅ `apps/web/lib/nav/categories.ts` — canonical 10-category structure +
  href→category lookup + persona filter. 12 unit tests green.
- ✅ AppLayout wraps existing nav-item rendering with category headers
  - Collapsible disclosure with Motion 200ms rotate (ChevronRight)
  - localStorage persistence per user via `/api/me` → `profile.id`
  - Active-route auto-expands its parent category
  - Defaults match `category.defaultExpanded` on first paint
  - Collapsed-sidebar mode skips category headers (keeps icons-only UX)
  - aria-expanded + aria-controls wired up

**Sacred boundary kept:** no rewrites to the per-persona arrays themselves —
the new categorization is a presentation-layer overlay. The mechanic-
permissions logic in `buildMechanicNav` continues to gate fine-grained
items inside the Operations / Workforce categories.

### Sprint 13.6 — Persona homeRoute + landing widgets (`33fd091`) ✅

- ✅ `apps/web/lib/persona/home-widgets.ts`
  - WidgetId enum (20 stable IDs across 4 personas)
  - PERSONA_HOME_WIDGETS — owner / mechanic / shop / admin matrices,
    matches the brief byte-for-byte
  - WIDGET_LABELS for UI/analytics
  - widgetsForPersona / personaHasWidget helpers
- ✅ 14 tests covering coverage, persona isolation, homeRoute integrity
- ✅ `apps/web/components/home/persona-home-widget-grid.tsx` — declarative
  grid consumer. Pages provide a registry of WidgetId → render functions;
  unmapped widgets show a "Coming soon" placeholder so config drift
  surfaces visibly.

**Audit:** only one residual `persona === 'X'` branch in the entire
(app)/* tree (a placeholder string in `documents/expiring/expiring-doc-form.tsx`)
— homepage logic was already well-encapsulated via PERSONA_CONFIG.

### Sprint 13.7 — Smoke (`19abab7`) ✅

- ✅ 53 / 53 vitest tests green across all Phase 13 server-side persona guards
- 🟡 Live UI walkthrough deferred to Andy (needs migrations applied + creds)
- ✅ `docs/phase-13-smoke-results.md` ships with operator runbook

### Sprint 13.8 — Final report (this commit) ✅

## Migrations status

| Migration | Status | Notes |
|---|---|---|
| 103_document_types.sql | 🟡 NOT APPLIED | Andy applies via `apps/web/scripts/apply-103.ts` |
| 104_ingestion_progress.sql | 🟡 NOT APPLIED | Andy applies via `apps/web/scripts/apply-104.ts` |

## Document type taxonomy (final)

23 values across 5 categories. Mirrors mig 103 CHECK constraint.

| document_type | Category | Aircraft ID | Owner | Mechanic | Shop | Admin |
|---|---|:-:|:-:|:-:|:-:|:-:|
| aircraft_logbook | Aircraft Records | ✓ | ✅ | ❌ | ❌ | ✅ |
| aircraft_registration | Aircraft Records | ✓ | ✅ | ❌ | ❌ | ✅ |
| aircraft_airworthiness | Aircraft Records | ✓ | ✅ | ❌ | ✅ | ✅ |
| aircraft_insurance | Aircraft Records | ✓ | ✅ | ❌ | ✅ | ✅ |
| aircraft_poh | Aircraft Records | ✓ | ✅ | ❌ | ✅ | ✅ |
| aircraft_afm | Aircraft Records | ✓ | ✅ | ❌ | ✅ | ✅ |
| aircraft_weight_balance | Aircraft Records | ✓ | ✅ | ❌ | ✅ | ✅ |
| aircraft_prebuy | Aircraft Records | ✓ | ✅ | ❌ | ✅ | ✅ |
| aircraft_annual | Aircraft Records | ✓ | ✅ | ❌ | ✅ | ✅ |
| aircraft_100hr | Aircraft Records | ✓ | ✅ | ❌ | ✅ | ✅ |
| maintenance_manual | Reference Manuals | — | ❌ | ✅ | ✅ | ✅ |
| parts_catalog | Reference Manuals | — | ❌ | ✅ | ✅ | ✅ |
| service_bulletin | Compliance | — | ❌ | ✅ | ✅ | ✅ |
| airworthiness_directive | Compliance | — | ❌ | ✅ | ✅ | ✅ |
| wiring_diagram | Reference Manuals | — | ❌ | ✅ | ✅ | ✅ |
| service_letter | Compliance | — | ❌ | ✅ | ✅ | ✅ |
| tcds | Compliance | — | ❌ | ✅ | ✅ | ✅ |
| training_manual | Reference Manuals | — | ❌ | ✅ | ✅ | ✅ |
| photo | Operations | — | ✅ | ✅ | ✅ | ✅ |
| receipt | Operations | — | ✅ | ✅ | ✅ | ✅ |
| invoice | Operations | — | ❌ | ✅ | ✅ | ✅ |
| work_order_attachment | Operations | — | ❌ | ✅ | ✅ | ✅ |
| other | Other | — | ✅ | ✅ | ✅ | ✅ |

## Nav category structure (final)

10 top-level categories, persona-filtered. Empty categories auto-hide.

| Category | Personas | Default expanded |
|---|---|:-:|
| Today | owner, mechanic, shop, admin | yes |
| Aircraft | owner, mechanic, shop, admin | yes |
| Operations | owner, mechanic, shop, admin | yes |
| Workforce | mechanic, shop, admin | no |
| Customer | shop, admin | no |
| Economics | owner, admin | no |
| Commercial | shop, admin | no |
| AI | owner, mechanic, shop, admin | no |
| Organization | admin | no |
| Profile | owner, mechanic, shop, admin | no |
| Other | (always visible) | yes |

## Persona homeRoute + widgets (final)

| Persona | homeRoute | Widget set |
|---|---|---|
| owner | `/my-aircraft` | fleet-summary, maintenance-status, ingestion-progress-mine, ask-aircraft, economics-snapshot |
| mechanic | `/my-day` | my-wos-today, time-clock, scheduler-agenda, parts-shortages, recent-manuals |
| shop | `/workflow` | wo-queue, scheduler-overview, billing-summary, customer-approvals, low-stock |
| admin | `/admin` | cross-org-metrics, error-log, worker-health, review-queue-stats, recent-uploads-global |

## Test coverage

53 / 53 green:

```
✓ lib/nav/categories.test.ts                          (12 tests)
✓ lib/documents/persona-taxonomy.test.ts              (21 tests)
✓ lib/persona/home-widgets.test.ts                    (14 tests)
✓ app/api/admin/errors/route.test.ts                  (3 tests)
✓ app/api/admin/ingestion-progress/route.test.ts      (3 tests)
```

## Sacred boundary verification

```
$ git diff --stat HEAD~10 apps/web/lib/ocr apps/web/lib/rag
(empty — no changes touched the sacred OCR/RAG pipeline across Phase 13)
```

## Activation steps for Andy

1. **Apply migration 103:**
   ```bash
   cd apps/web
   npx tsx scripts/apply-103.ts
   ```
   Verifies 3 columns, 2 CHECK constraints, 3 indexes, the RLS policy, and the
   `user_persona_in_org()` helper. Delete the script post-success.

2. **Apply migration 104:**
   ```bash
   cd apps/web
   npx tsx scripts/apply-104.ts
   ```
   Verifies the table, 3 indexes, 4 triggers, RLS state. Delete the script
   post-success.

3. **Run live persona smoke per `docs/phase-13-smoke-results.md`** — the
   runbook covers owner/mechanic/shop/admin walkthroughs with expected
   behaviors per persona.

4. **Optional Phase 13.5 enhancement** — wire `PersonaAwareUploadButton`
   into `/aircraft/[id]/documents` and `/my-aircraft` per the brief's
   "persona-specific entry points" list. Currently surfaced on
   `/documents` only.

## Open follow-ups

- **Migration 103 + 104 not yet applied** — Andy applies via tsx-pg
- **Live UI smoke** — needs creds + applied migrations
- **Refactor existing home pages to opt into `PersonaHomeWidgetGrid`** —
  config + grid component shipped; pages opt in incrementally
- **Wire `PersonaAwareUploadButton` into more entry points** — currently
  surfaced on `/documents` only; `/aircraft/[id]` + `/my-aircraft` pending
- **The 234 zod routes still incomplete** (audit follow-up — pre-existing)
- **CSP nonce hardening** (audit follow-up — pre-existing)
- **Calibrator tuning** — still needs ≥1 week of telemetry from Phase 8.8
- **Multi-aircraft UI for fleet operators (>10 aircraft)** — Phase 14 candidate

## Related docs

- `/docs/phase-13-smoke-results.md` — operator smoke runbook
- `/docs/persona-contracts.md` — Phase 1 audit (still authoritative)
- `/docs/phase-12-activation-report.md` — preceding hybrid activation
- `/docs/phase-11-hybrid-architecture-report.md` — vision-RAG architecture

## Commit table

| Sprint | Commit | Description |
|---|---|---|
| 13.1 | `24b9e01` | doc taxonomy + RLS upload permissions |
| 13.2 | `f598dca` | persona-scoped upload UI + server guard |
| 13.3 | `6d15c30` | live ingestion progress |
| 13.4 | `239a69c` | admin error log + /admin/* gating |
| 13.5 | `66c350a` | collapsible nav categories |
| 13.6 | `33fd091` | persona-strict landing widgets |
| 13.7 | `19abab7` | smoke (53/53 tests, runbook for live) |
| 13.8 | this  | final report |
