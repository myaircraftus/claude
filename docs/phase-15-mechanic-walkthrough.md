# Phase 15 — Sprint 15.3: Mechanic Persona Walkthrough

**Tester:** Claude (Chrome MCP)
**Account:** info@myaircraft.us (platform admin · Owner persona active in switcher)
**Date:** 2026-05-09
**Test approach:** Direct URL navigation to mechanic-allowed routes (persona switch
to "Mechanic" triggered Phase 14 cross-persona upsell paywall — declined to
preserve production data integrity per Phase 15 brief).

## Important context

- Clicking the **Mechanic** persona switcher fired the Phase 14 cross-persona
  paywall:
  - Modal title: "Unlock the A&P Mechanic side"
  - Body: "Work orders, invoicing, customer portal, parts catalog"
  - CTAs: "Start 30-day A&P Mechanic trial" (primary) · "Subscribe to A&P
    Mechanic — $79/mo" · "Get the bundle — $99/mo" (highlighted)
  - "Not now" dismiss link
- ✅ This means Phase 14 cross-persona upsell is correctly wired.
- ❗ Because info@myaircraft.us only has Owner entitlement, I clicked "Not now"
  and tested mechanic UIs by direct URL nav (which works for platform admin —
  the persona-strict middleware doesn't block reads when `is_platform_admin = true`).

## Pages walked

| Route | Result | Notes |
|---|---|---|
| /my-day | 🟡 Renders but generic | Title says "My Day" but body is owner-flavored ("Add an aircraft to start tracking compliance, expirations, and flights"). Says "0 aircraft" despite N8202L + N123QA being in fleet. Phase 13.5 page expected mechanic-flavored copy ("Today's work orders / your shifts"). |
| /work-orders | ✅ Renders | List view with WO-2026-DEMO (In Progress, $605). Tabs: Work Orders / Estimates / Invoices / Logbook. "+ New" works. |
| /work-orders/[id] | ✅ Renders | Detail view with full mechanic UI: tabs Activity / Checklist / Line Items / Media / AI Summary / Owner View / AD-SB / Tools / Logbook / Invoice. Bottom action bar Start Timer / Add Part / Add Labor. Activity feed shows 4 messages. |
| /scheduler | ✅ Renders | Shift calendar with month/week toggle, Today button, "+ New shift" + Your Shifts / Shift Covers tabs. |
| /tools | ✅ Renders | "Calibration cycle tracking. Overdue tools block new WO uses." Filter tabs All / Due in 30/60 / Overdue / Checked out. Empty state. |
| /parts | ✅ Renders | "Parts Inventory — Local shop inventory. Decrement on use, increment when POs arrive. Low-stock parts surface as AI Inbox cards." 4 metric cards. Empty state. |
| /vendors | ✅ Renders | "Master list of suppliers, OSR shops, freight, and service vendors." 4 metric cards. Empty state. |
| /manuals | ✅ Renders | Filter tabs Parts Catalog / Maintenance Manual / Service Manual / Service Bulletins / AD Reference / Other. "+ Upload Manual" works. |
| /manuals (Upload modal) | 🟡 Works but missing SLA banner | Modal title "Upload Manual — Tag the aircraft + manual type so it lands in the right shelf". 6 manual types as buttons. Aircraft selector. NO Phase 14 tier SLA banner here (unlike /documents Phase 13.2 modal which has it). |
| /time-off | ✅ Renders | "PTO requests. Manager approves. Scheduler shows blocked days." Tabs My Requests / Team Requests / Calendar overlay. "+ Request time off" works. |

## Findings

### 🟡 P1: /my-day shows owner-flavored copy + "0 aircraft"

- **Symptom**: `/my-day` is the mechanic homeRoute per persona contract, but the
  page renders owner-style content:
  - Heading: "Good morning, Andy."
  - Body: "Add an aircraft to start tracking compliance, expirations, and flights."
  - Section: "Your aircraft · 0 — No aircraft yet — Add your first aircraft from
    the Aircraft page."
- **Expected**: Mechanic-style content like "Today's work orders / your shifts /
  parts on order / time-clock state".
- **Note on the "0 aircraft"**: this might be because `/my-day` filters
  aircraft to those the user MAINTAINS (assignments table), not aircraft they
  OWN. If Andy is owner of N8202L+N123QA but has no mechanic assignments,
  zero is correct — but copy needs to clarify ("No aircraft assigned to you").
- **Source**: `apps/web/app/my-day/page.tsx`.
- **Severity**: P1 — Phase 13.5 mechanic homeRoute is in production but isn't
  serving mechanic-appropriate content.

### 🟡 P2: /manuals upload modal missing Phase 14 SLA banner

- **Current**: Modal has no "Beta tier · Real-time" / "Standard tier · 24h SLA"
  copy that the /documents Phase 13.2 modal has.
- **Expected**: Same SLA banner so mechanics know when their uploaded manuals
  will be searchable.
- **Source**: `apps/web/components/manuals/upload-manual-modal.tsx` (likely)
  or wherever the /manuals upload modal is defined.
- **Fix**: Import + render `<TierSlaBanner />` like
  `apps/web/components/documents/persona-aware-upload-modal.tsx`.

### 🟡 P3: Work order detail tab title is wrong

- **Symptom**: `/work-orders/[id]` page has tab title "myaircraft.us — Ask your
  aircraft anything".
- **Expected**: "WO-2026-DEMO — N8202L | myaircraft.us" or similar.
- **Source**: `apps/web/app/work-orders/[id]/page.tsx` is missing a
  `generateMetadata` function; likely inheriting layout default.

### 🔴 P0 (carried from 15.2): mechanic-only routes accessible to Owner persona

Same finding as Sprint 15.2 — the `is_platform_admin` flag bypasses persona-strict
guards. Same remediation paths apply. Confirmed during 15.3 by reaching every
mechanic-allowed route while Owner persona is active.

## What worked

- Phase 14 cross-persona upsell paywall fires correctly when Owner clicks the
  Mechanic switcher tab. CTAs and pricing match `pricing-config.ts`
  (Mechanic $79/mo · Bundle $99/mo).
- /work-orders detail view is a rich, mechanic-grade UI (tabs, line items,
  AD/SB tracking, invoice, logbook, activity feed).
- /scheduler renders a real month-view calendar with shift management.
- /tools, /parts, /vendors all render with proper empty states + filter chips.
- /manuals filter taxonomy matches mechanic upload taxonomy (Parts Catalog,
  Maintenance Manual, Service Manual, Service Bulletins, AD Reference, Other).
- /time-off has manager approval workflow scaffolding.

## Cannot test (blocked by entitlement gate)

- True Mechanic persona experience (would require starting a 30-day Mechanic
  trial against production org — declined per Phase 15 brief).
- Persona switcher locked-state feedback for non-admin users.
- Mechanic-only navigation rendering (sidebar items hidden vs Owner — currently
  Owner persona's sidebar shows EVERYTHING because of platform admin).

## Recommendations for Sprint 15.6 (cross-persona)

- Synthetic mechanic test entitlement via tsx-pg one-shot:
  - INSERT a temporary `persona_entitlement` row for Andy with `persona='mechanic'`
    and `valid_until=NOW()+'2 hours'`.
  - Run mechanic walkthrough.
  - DELETE in finally — explicit cleanup.
- This stays inside the "synthetic data only" Phase 15 constraint while
  unblocking real persona testing.
