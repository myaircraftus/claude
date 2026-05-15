# Codex Audit Report

**Date:** 2026-05-14
**Branch audited:** `codex/work-order-universal-flow` (NOT merged) vs `main` (production)
**Production deploy:** `myaircraft01-6tzic8o27-horf.vercel.app` (commit `42159bd`, plus the in-flight build of `e206e55` SOP Library)
**Reviewer:** Claude Opus 4.7 (1M context)

---

## Executive Summary

The brief assumed Codex's 7-migration / 113-file workflow sprint was "merged and live." **It is not.** All four Codex commits (`b643081`, `40addb7`, `dbf4f8e`, `8c3bcd4`) sit on the `codex/work-order-universal-flow` branch only — `main` is 4 commits behind and production builds from `main`. None of Codex's seven new migrations have been applied to the live Supabase database (verified by REST probes — all new tables 404).

Three biggest risks:

1. **Codex branch unmerged.** The Parts & Inventory workspace, Squawks workspace, Invoice/Logbook workflow boards, Aircraft Workspace v2, and JASC/ATA taxonomy seed exist only on the codex branch. The user believes they are live; they are not.
2. **TypeScript surface is broken on `main`.** `tsc --noEmit` produces 80+ errors, almost all from the Phase 18 persona 4→3 collapse (`mechanic` still referenced in 20+ files). The app only builds because `typescript.ignoreBuildErrors: true` is set in `next.config.mjs`. This will silently catch up.
3. **AI Parts Search is intact on `main` but inaccessible per Phase 18 guards.** The existing `PartSearchPanel` + `/api/parts/search` are still in place and SerpAPI/eBay/OpenAI env vars are present in production. The complaint "Codex broke it" appears to be a misattribution: the underlying code is fine. The likely user-facing breakage is that `/parts` now enforces shop/admin persona (Sprint 18.4 guard) so owners get redirected away — and the Codex routes at `/parts-inventory/*` don't exist on `main` at all.

---

## 1. Migration Status

| Migration (file) | File exists on codex | File exists on main | Applied to prod DB | Tables verified |
|------------------|----------------------|---------------------|---------------------|-----------------|
| `20260514131428_aircraft_workspace_v2.sql` | ✅ | ❌ | ❌ | n/a |
| `20260514152339_squawks_discrepancy_intake.sql` | ✅ | ❌ | ❌ | n/a |
| `20260514165207_estimates_deposits_owner_approvals.sql` | ✅ | ❌ | ❌ | n/a |
| `20260514173512_invoices_payments_source_of_truth.sql` | ✅ | ❌ | ❌ (probed `payment_proofs`, `invoice_receipts`, `invoice_versions` → 404) | n/a |
| `20260514195159_logbook_entries_signed_records.sql` | ✅ | ❌ | ❌ (probed `logbook_source_bundles`, `logbook_entry_revisions` → 404) | n/a |
| `20260514211325_parts_inventory_source_of_truth.sql` | ✅ | ❌ | ❌ (probed `part_master`, `inventory_transactions`, `rx_receipts` → 404) | n/a |
| `120_jasc_ata_maintenance_taxonomy.sql` | ✅ | ❌ | ❌ (probed `ata_chapters`, `jasc_codes` → 404) | n/a |
| `119_merge_mechanic_into_shop.sql` (Phase 18) | n/a (on main) | ✅ | **Backfill effect already present** (0 `mechanic` persona rows in `organization_memberships` or `user_profiles`; 1 `shop` row, 1 `owner` row) | ✅ |

**Probe methodology:** PostgREST `GET /rest/v1/<table>?select=count&limit=1` with the service-role key against `https://ygrqinxkeqvikpfmjqiz.supabase.co`. 200 = table exists, 404 = not found.

### Migrations applied during this session

**None.** The Supabase MCP is scoped to a different project ("Collective Archive", id `sliqabzkuqojtodgkdbr`) and refuses operations against the actual production project (`ygrqinxkeqvikpfmjqiz`). Direct `pg` connection via `tsx` continues to wedge silently on `client.connect()` — same toolchain hang pattern from prior sessions. `psql` is not installed locally.

**Recommended apply path:** Open the Supabase SQL editor and paste each migration file from `codex/work-order-universal-flow` in order:

```
1. 120_jasc_ata_maintenance_taxonomy.sql
2. 20260514131428_aircraft_workspace_v2.sql
3. 20260514152339_squawks_discrepancy_intake.sql
4. 20260514165207_estimates_deposits_owner_approvals.sql
5. 20260514173512_invoices_payments_source_of_truth.sql
6. 20260514195159_logbook_entries_signed_records.sql
7. 20260514211325_parts_inventory_source_of_truth.sql
```

But — **DO NOT apply these until the Codex branch is merged.** The migrations create tables the codex code reads from; applying without merging would leave us with schema-only support and no code paths.

### Mechanic vs shop role split

There is **no separate `mechanic` role column** distinguishing mechanic from shop_owner / admin. Recap of the current model (post Phase 18):

- **Persona** (`user_profiles.persona`, `organization_memberships.persona`): owner | shop | admin. `mechanic` was merged into `shop` in mig 119.
- **Org role** (`organization_memberships.role`): owner | admin | mechanic | pilot. This is the *personnel* role and is orthogonal to persona. The `mechanic` value still exists here.

So the SOP's "mechanic vs shop" distinction is currently expressed as **same persona (shop), different role**. The sidebar can branch on `role` but does not — see §2 below.

---

## 2. Sidebar / Persona Separation

### Current state on `main` (production)

- One nav builder `buildMechanicNav(perm: MechanicPermissions)` builds the entire shop/mechanic surface.
- `perm` is sourced from `activeMechanic.permissions` — a permissions matrix loaded from the membership.
- Nav items are then categorized through `lib/nav/categories.ts` and rendered as collapsible groups.
- Active persona is shown via `<PersonaSwitcher>` (Phase 18 Sprint 18.2) above the nav — but the switcher only handles `owner | shop`, and admin lives in the footer.
- Header reads "myaircraft" (logo) — no persona-aware label.

### `buildMechanicNav` items on `main`

```
AI Inbox · AI Command Center (if perm) · My Day (if dashboard perm) ·
Aircraft (tab=aircraft, if perm) · Workflow · Parts · Manuals ·
Logbook (tab=logbook, if perm) · Compliance · Expirations ·
Inspections · Continued · Approvals · Parts · Purchase orders ·
Vendors · Tools · Time clock · …
```

Same function builds the nav whether the active persona is `mechanic` (legacy) or `shop`. Items are filtered by `perm.*` flags, not by persona.

### `buildMechanicNav` on the codex branch (NOT merged)

```
Dashboard (if dashboard or aiCommandCenter perm) ·
Aircraft · Squawks · Work Orders · Estimates · Invoices · Logbook ·
Parts & Inventory ▾
  ├── Dashboard
  ├── AI Parts Search
  ├── Inventory
  ├── Vendors
  ├── Purchase Orders
  ├── RX Receipts
  ├── Returns
  └── Analytics
Reports · Settings · Taxonomy · Compliance · Expirations ·
Inspections · Continued · Approvals · Tools · Time clock · …
```

This **is** structurally closer to what the SOPs require, but it's still the same nav for mechanic and shop — there's no `role`-driven filter that hides financials from mechanics. A `perm.invoices` check exists, but no SOP-anchored mapping ties role=mechanic → `perm.invoices=false`.

### Gap vs SOP requirement

Per the SOPs:
- **Mechanic** should see: Dashboard, Aircraft, Work Orders, Squawks, Logbook, Parts & Inventory.
- **Shop (owner/admin)** should see ALL of the above PLUS Estimates, Invoices, Reports, Settings, and financial/billing data.

Neither `main` nor codex enforces this split server-side. Both run a single nav builder and rely on `MechanicPermissions` flags that aren't pinned to the SOP boundaries. Active persona is shown (via the switcher chip) but the header label and the navlist itself don't visually telegraph "you are in Mechanic mode" vs "you are in Shop mode."

**Recommendation (deferred per brief):** Once the codex branch lands, introduce a `roleNavProfile(role: OrgRole)` helper that maps `mechanic | apprentice | tech` → the SOP's reduced surface and `lead | ia | shop_owner | admin` → the full surface. Gate at the nav-build level AND at the route-guard level (Phase 18 Sprint 18.4's `requirePersona` should be widened to `requirePersonaAndRole`).

---

## 3. AI Parts Search

**Status:** WORKING on `main` (existing pre-Codex code path), but unreachable from the codex-branch UI without that branch being merged.

### What's on `main` (live in production)

- `apps/web/app/api/parts/search/route.ts` — full implementation calling `searchParts()` which fans out to OpenAI resolution → SerpAPI → eBay.
- `apps/web/app/api/parts/click/route.ts` — telemetry.
- `apps/web/app/(app)/parts/components/part-search-panel.tsx` — the working UI component:
  - Line 72:  `fetch('/api/aircraft/${id}')` — pulls aircraft context.
  - Line 111: `fetch('/api/parts/search', { … })` — runs the search.
  - Line 133: `fetch('/api/parts/click', { … })` — telemetry.
- Production env vars present and valid: `SERPAPI_API_KEY`, `EBAY_APP_ID`, `EBAY_CERT_ID`, `EBAY_DEV_ID`, `EBAY_ENV`, `OPENAI_API_KEY`. (Verified via `vercel env ls production`.)

### Codex changes (NOT merged)

- New route `/parts-inventory/ai-parts-search` (file `apps/web/app/(app)/parts-inventory/ai-parts-search/page.tsx`) renders `<PartsInventoryPage view="ai-search" />`.
- `parts-inventory-workspace.tsx` imports the **existing** `PartSearchPanel` from `@/app/(app)/parts/components/part-search-panel` — i.e., reuses the working component, doesn't replace it. Codex's BUILD_PROGRESS.md explicitly states: *"the existing working AI Parts Search flow is preserved."*

### Why the user thinks it's broken

Three plausible causes, in order of likelihood:

1. **Phase 18 Sprint 18.4 added a persona guard to `/parts`.** Owners hitting `/parts` get redirected to `/my-aircraft`. If the user has been switching to `view_as=owner` (Sprint 18.6 admin view-as), they'd see the redirect and assume the route is broken.
2. **They're testing against the codex branch routes** (`/parts-inventory/ai-parts-search`) which don't exist on `main` — that produces a 404 that looks like "Codex broke it."
3. **The Aircraft selector inside the panel** needs an authenticated aircraft list. If the test session lost its membership, the panel falls back to a blank state.

### Root cause

Not a code regression. The user wants the *old working flow* — aircraft picker → part selector → AI parts results — restored. **That flow IS on main right now** and is reachable via `/parts` as a shop or admin persona. The fix is either:

- Document the right URL and persona for testing (`/parts`, persona=shop or admin), OR
- Merge the codex branch so `/parts-inventory/ai-parts-search` ALSO becomes valid (it reuses the same panel).

The deferred fix mentioned in the brief — "going back again like it worked before" — does not require new code. It requires the user navigate to the correct URL.

---

## 4. Vendor Module

**Status:** PARTIAL on `main`, MORE on codex (NOT merged).

What exists on `main` (live):

- `apps/web/app/(app)/vendors/page.tsx` — the legacy flat vendors list.
- `vendors` Postgres table exists (verified: REST `count` returned 200).
- No `/vendors/[id]/` detail page, no purchase-order-from-vendor flow.

What's on the codex branch (NOT merged):

- `apps/web/app/(app)/parts-inventory/vendors/page.tsx` — renders `<PartsInventoryPage view="vendors" />`.
- `apps/web/components/parts-inventory/parts-inventory-workspace.tsx` — new Vendors view inside the canonical workspace.
- `apps/web/app/api/parts-inventory/actions/route.ts` — new actions endpoint.
- Codex migration 7 adds `part_vendor_offers`, `part_search_events`, vendor lifecycle columns on `inventory_parts`, `purchase_orders`, etc.

### Missing (even on codex)

- Vendor detail page (1099 / W-9 metadata, contact CRUD, ratings).
- Vendor-scoped reports (margin per vendor, on-time rate).
- Vendor merge/dedupe workflow.

---

## 5. Invoices

**Status:** PARTIAL on main, codex covers all 4 entry paths but is unmerged.

### Main (live)

- `/invoices` list + `/invoices/[id]` detail exist.
- API routes: `[id]/route.ts`, `[id]/lines/route.ts`, `[id]/payments/route.ts`, `[id]/pdf/route.ts` ✅, `[id]/send/route.ts`.
- `/api/invoices/[id]/pdf/route.ts` exists on main (PDF route is wired).

### Codex branch (NOT merged)

- `apps/web/components/invoices/invoice-workflow-board.tsx` — full 4-source picker:
  - `work_order` — "Best for maintenance billing. Pulls approved actual labor, installed parts, deposits, and WO source reference."
  - `aircraft` — "Aircraft and owner are locked first. Then choose work order, estimate, or custom invoice."
  - `estimate` — "Use with caution; planned quote lines require review."
  - `custom` — "Manual labor, parts sale, adjustment, or correction. Aircraft and payee are still required."
- 4-stage swimlane: Choose Source → Auto Map → Collect Payment → Close Out.
- All 4 entry paths wired in the source selector via `SOURCE_CARDS`.

### Gaps

- On main: no entry path picker — defaults to manual creation.
- Codex source picker is built but: invoice creation API hasn't been confirmed to round-trip all 4 path types end-to-end against the database (codex DB schema isn't applied).
- Deposit credit reconciliation (Stripe webhook ↔ invoice line) was Phase 17 — confirmed live on main.

---

## 6. Logbook

**Status:** Codex implementation extensive and aligned with SOP, but unmerged + schema not applied.

### Main (live)

- `/logbook-entries` page + `[id]` detail exist.
- API: `route.ts`, `[id]/route.ts`, `[id]/sign/route.ts` ✅ — sign endpoint is present.
- `signature_certificates` table exists.

### Codex branch (NOT merged)

- **Component targets** in `apps/web/lib/logbook/constants.ts`: `airframe | engine | propeller | avionics | appliance` — all 5 match SOP §7.
- **Sign route** (`[id]/sign/route.ts`):
  - Requires `mechanic_name` and `mechanic_cert_number`.
  - Returns 401 (unauth), 403 (insufficient permissions), 400 (validation).
  - Calls `buildLogbookHash()` to produce an immutable PDF hash.
  - Inserts a `signature_certificates` row with the cert metadata.
- **Workflow board** (`components/logbook/logbook-workflow-board.tsx`, 587 lines) — Choose Source → Source Mapping → Component Targets → AI Draft Review → Sign → Print/Publish.
- Migration adds `logbook_source_bundles`, `logbook_entry_revisions`, `logbook_output_events`, plus extensive signature certificate columns.

### Issues

- FAA refs (`14 CFR 43.9, 43.11, 91.417, AC 43-9D, AC 120-78`) are *not* hard-anchored in workflow.ts — they appear only in the SOP frontmatter. The Sign button doesn't display the legal basis to the signer at the point of action. Minor UX gap; not a correctness gap.
- Sign route depends on `signature_certificates` columns the unapplied migration adds; signing today will partially work (basic columns exist) but the new audit fields won't persist.

---

## 7. TypeScript Errors

**Count on `main`:** 80+ errors visible in the first 80 lines of `tsc --noEmit` output (truncated — total likely >120).

**Top error families (root cause: Phase 18 persona collapse not fully propagated):**

| Family | Count (approx) | Example file |
|--------|----------------|--------------|
| `Type '"mechanic"' is not assignable to type 'Persona'` | ~20 | `app/api/billing/start-trial/route.ts:33`, `app/api/customers/route.ts:142`, `app/api/work-orders/route.ts:57`, `components/redesign/AppLayout.tsx:1006`, `components/documents/upload-dropzone.tsx:489` |
| `Property 'shop' does not exist on type 'BillingClientStatus'` (Persona widened, billing types not) | ~6 | `components/billing/BillingBanner.tsx:24`, `components/billing/BillingProvider.tsx:62`, `components/billing/CrossPersonaUpsell.tsx:30`, `components/redesign/AppLayout.tsx:601,972` |
| Missing `@testing-library/react` types | ~10 | `components/admin/AdminFooterLink.test.tsx`, `components/persona/PersonaSwitcher.test.tsx` |
| Other (Persona-tour, etc.) | ~10 | `components/redesign/LoginPage.tsx:30`, `app/demo/_components/DemoShell.tsx:17,31` |

Build still succeeds in production because `next.config.mjs` has `typescript.ignoreBuildErrors: true`. The errors don't crash runtime, but they prevent any meaningful local type-checking and will mask future regressions.

**Recommendation:** A dedicated cleanup sprint to (a) finish the `mechanic` → `shop` rename in the 20+ remaining files, (b) widen `BillingClientStatus` to a `Record<Persona, …>` shape, (c) install `@testing-library/react` and `@testing-library/jest-dom` types or move the two test files out of `tsc` scope. Estimated effort: 4–6 hours.

---

## 8. SOP Files Seeded

All nine files seeded verbatim from `mark downs/manuals/` with the brief's required frontmatter:

| File | Lines | Status |
|------|-------|--------|
| `docs/sop/01-dashboard-create-menu.md` | 757 | ✅ |
| `docs/sop/02-aircraft-master-workspace.md` | 972 | ✅ |
| `docs/sop/03-squawks.md` | 610 | ✅ |
| `docs/sop/04-estimates-deposits-approvals.md` | 822 | ✅ |
| `docs/sop/05-work-order-execution.md` | 770 | ✅ |
| `docs/sop/06-invoices-payments.md` | 459 | ✅ |
| `docs/sop/07-logbook-entries.md` | 357 | ✅ |
| `docs/sop/08-reports-global-search.md` | 443 | ✅ |
| `docs/sop/09-parts-inventory.md` | 412 | ✅ |

Total: 5,602 lines of canonical SOP content. The earlier scaffolded versions (from the SOP Library hub commit `e206e55`) were overwritten with the authoritative manuals.

Note: my earlier file `02-aircraft-master-record.md` was deleted in favor of the brief's filename `02-aircraft-master-workspace.md` (sourced from the "final new one" workspace UI SOP, not the older master-record SOP). The SOP Library hub already auto-discovers any file matching `docs/sop/*.md` so no code change is needed.

---

## 9. Priority Fix List (ranked)

1. **Merge `codex/work-order-universal-flow` into `main`.** This is the umbrella fix. The user's belief that it's live is the root of nearly every "this doesn't work" report. The merge will have conflicts in `apps/web/components/redesign/AppLayout.tsx` (codex's nav refactor vs my SOP Library link), `apps/web/lib/nav/categories.ts`, and a few API routes touched by both Phase 18 and Codex. Plan a focused merge sprint with conflict resolution + a CI build smoke before pushing.

2. **Apply the 7 Codex migrations** in order via Supabase SQL editor IMMEDIATELY after the merge. Order: `120` → `20260514131428` → `…152339` → `…165207` → `…173512` → `…195159` → `…211325`. Run a smoke probe (REST `count` on `part_master`, `jasc_codes`, `logbook_source_bundles`) before declaring done.

3. **Apply migration `119_merge_mechanic_into_shop.sql`** (Phase 18). Backfill is already done effectively (no `mechanic` persona rows), but the CHECK constraint widening + `documents_insert` RLS policy rewrite + `tier_history` audit row aren't confirmed applied. Worth running for completeness.

4. **Type-cleanup sprint.** Finish the Phase 18 persona rename across the 20+ files still referencing `mechanic` as a Persona value. Widen `BillingClientStatus`. Install or scope-out `@testing-library/react` types. Goal: `tsc --noEmit` exits clean enough to flip `typescript.ignoreBuildErrors` back to `false` and get real CI guards.

5. **Persona-role nav split (post-merge).** Implement `roleNavProfile(role: OrgRole)` so the SOP-mandated mechanic ⊂ shop visibility actually renders. Today, mechanics see financial items they shouldn't (Estimates, Invoices, Reports) because nav is `perm`-driven not `role`-driven. Pair with a server-side route guard widening (`requirePersonaAndRole`).
