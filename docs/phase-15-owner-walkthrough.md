# Phase 15 — Sprint 15.2: Owner Persona Walkthrough

**Tester:** Claude (Chrome MCP)
**Account:** info@myaircraft.us (platform admin + Owner persona active)
**Date:** 2026-05-09
**Org tier:** beta · billing_disabled=true · 2 aircraft (N8202L, N123QA)

## Pages walked

| Route | Result | Notes |
|---|---|---|
| /my-aircraft | ✅ Renders | Owner home with greeting + 2 aircraft cards |
| /aircraft | ✅ Renders | Fleet list, 2 aircraft, click-through works |
| /aircraft/[id] | ✅ Renders | Tabs: Overview/Maintenance/Documents/Intelligence/Assignments + Ask/Upload/Economics action buttons |
| /documents | ✅ Renders | Phase 13.2 PersonaAwareUploadButton visible top-right + filter chips |
| /documents (Upload modal) | ✅ Phase 13.2 modal works | SLA banner shown ("Beta tier · Real-time"); Aircraft Records category locked; 10 owner-appropriate doc types; Operations category shows only Photo + Receipt; no mechanic-only types leak |
| /compliance | ✅ Renders | 4 metric cards, empty state copy good ("Nothing overdue or due-soon. Nice.") |
| /inspections | ✅ Renders | Empty state + Scan sheet / New inspection actions |
| /continued | ✅ Renders | "Continued Items" + "Nothing deferred. Clean fleet." empty state |
| /approvals | 🟡 Renders but persona-leak | Shows shop-perspective ("Send quoted work to customers... + New approval"). Owner should see "Pending my approval" view |
| /costs | 🟡 Renders | Internal "(sprint 7.2 / 7.3)" copy leak in subtitle |
| /ask | ✅ Renders | "Ask Your Aircraft - Owner mode" — Owner/Mechanic toggle, query history, 6 owner-appropriate examples |
| /admin | 🔴 Redirects to /dashboard | Owner persona should redirect to /my-aircraft per contract; /dashboard is legacy multi-tenant home |
| /scheduler | 🔴 Renders | Should be DISALLOWED per persona contract |
| /work-orders | 🔴 Renders | Should be DISALLOWED per persona contract; full create/view/edit access shown |
| /clock | 🔴 Renders | Should be DISALLOWED per persona contract |

## Findings

### 🔴 P0: Owner persona reaches mechanic-only routes (/scheduler, /work-orders, /clock)

- **Symptom**: Logged in as Owner, can navigate directly to `/scheduler`, `/work-orders`, `/clock` and see full mechanic UI including write actions ("+ New shift", "+ New" work order).
- **Expected per persona contract**: `owner` persona should be redirected to `/my-aircraft`.
- **Likely root cause**: Account has `is_platform_admin = true` which may bypass persona-strict middleware guards. If so, the override is by design but undocumented — the test plan should be amended OR platform admin should still respect active persona for UI purposes.
- **Remediation path**: 
  - **Option A** (defensive): Persona-strict guards run BEFORE `is_platform_admin` short-circuit, so admin still sees persona-strict UI when persona switcher is active.
  - **Option B** (documented bypass): Add a banner ("Platform admin — persona checks bypassed") + log to `phase-15-qa-report.md` that this only affects platform admins.
- **Severity**: P0 if non-admin owners can also reach these routes; P2 if it's only platform admin override (need a non-admin test user to confirm — currently impossible per Phase 15 constraint "no test users with those roles").

### 🔴 P0: /admin redirects to /dashboard, not persona-strict /my-aircraft

- **Symptom**: navigating to `/admin` lands on `/dashboard` (legacy multi-tenant home), not `/my-aircraft` (Phase 13 owner home).
- **Expected**: For an Owner persona, EVERY redirect should land on `/my-aircraft`.
- **Same-root-cause suspicion**: probably the `is_platform_admin` short-circuit picking the legacy dashboard for admins.

### 🟡 P2: /approvals shows shop-perspective for Owner

- **Current**: Page heading "Customer Approvals — Send quoted work to customers for per-line approval. They approve, deny, or defer each item via a public link." + "+ New approval" button.
- **Expected**: For Owner persona, page should be framed as "Approvals waiting on me" (work-order quotes / line-items the owner needs to approve), not as the shop's send-quote UI.
- **Source**: `apps/web/app/approvals/page.tsx` — likely needs persona branch.

### 🟡 P2: Aircraft Detail Upload button still uses legacy /documents/upload route

- **Symptom**: Clicking "Upload" from `/aircraft/[id]` opens the LEGACY `/documents/upload` page instead of the Phase 13.2 PersonaAwareUploadModal (overlay).
- **Expected**: Same modal as `/documents` "Upload Aircraft Document" button — server-side persona × document_type matrix, SLA banner, aircraft selector pre-populated.
- **Source**: `apps/web/app/aircraft/[id]/page.tsx` or its action-bar component still wires the Upload button to `/documents/upload` redirect.

### 🟡 P2: No SLA banner on legacy upload page

- The `/documents/upload` legacy page has no Phase 14 tier SLA banner. Once the action is rewired to the Phase 13.2 modal (above), this resolves automatically.

### 🟡 P3: Banner "Add a payment method to start your 30-day Mechanic trial" confusing for Owner

- The yellow banner across the top says "Add a payment method to start your 30-day **Mechanic** trial. Card on file required — not charged today."
- For an Owner persona, the trial banner should reference "Owner" not "Mechanic".
- Likely persona-aware copy in `apps/web/components/billing/BillingBanner.tsx`.

### 🟡 P3: Empty state copy for Hobbs/Tach on aircraft cards

- Aircraft cards show `Hobbs: —` and `Tach: —` with no explanation.
- Add hover tooltip or muted label "Not yet recorded".

### 🟡 P3: /costs subtitle leaks internal sprint terminology

- Subtitle: "Operating costs ledger. Forward bills via email or upload receipts — AI extracts the rest **(sprint 7.2 / 7.3)**."
- Drop the parenthetical; users don't care about sprint numbers.

## Auto-fix candidates (Sprint 15.7)

- 🟡 P3: BillingBanner persona-aware copy (Owner vs Mechanic trial)
- 🟡 P3: /costs subtitle drop "(sprint 7.2 / 7.3)"
- 🟡 P3: aircraft card Hobbs/Tach tooltip

## Log-only (Sprint 15.7 backlog)

- 🔴 P0: Persona-strict middleware × `is_platform_admin` interaction (needs design call)
- 🔴 P0: /admin → /dashboard redirect for owner persona
- 🟡 P2: /approvals owner-perspective branch
- 🟡 P2: aircraft detail Upload button → Phase 13.2 modal

## What worked

- Phase 13.2 PersonaAwareUploadModal: server-side persona × document_type matrix enforced; owner sees only Aircraft Records (10 types) + Operations (Photo, Receipt) + Other; NO mechanic-only types like Maintenance Manual / Service Bulletin / Form 337 leak through.
- Phase 14 SLA banner copy: "Beta tier · Real-time · Documents are processed in real-time during beta."
- Owner-mode /ask page with persona toggle + 6 owner-appropriate query examples.
- Clean empty states on /compliance, /inspections, /continued.
- Persona switcher (Owner / Mechanic toggle) visible top-left and persists across pages.

## Production state at end of walkthrough

- Org has 1 In-Progress work order (WO-2026-DEMO, $605.00 on N8202L) — visible from /work-orders even as Owner persona.
- 0 documents indexed.
- 0 inspections, 0 compliance items, 0 continued items, 0 approvals, 0 costs.
- Trial banner shows "14 days left in your Aircraft Owner trial" + confusing Mechanic trial CTA.
