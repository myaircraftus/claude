# aircraft.us — Project Context (Claude Code persistent memory)

_This file is read by Claude Code at the start of every session. Keep it under ~600 lines. Update it at the end of every sprint. Never delete history — append._

---

## 1. The product (one paragraph)

aircraft.us is the Tesla/Apple of aviation maintenance. AI-first, telemetry-synced, multi-location, persona-aware. Three personas: **Owner · Mechanic · Shop**. Three differentiators: **(1) tach time is never typed** — comes from Airbly hardware, FlightSchedule Pro, or ADSB inference automatically; **(2) the AI is the home screen** — action cards, not dashboards; **(3) one app, three personas** — same data, completely different UI per role.

## 2. Stack (don't fight it)

- React 18 + TypeScript + Tailwind v4 + Motion (Framer Motion) + Lucide React + Sonner toasts
- Routing: React Router (Data Mode) in `/src/app/routes.tsx`
- App shell: `/src/app/components/AppLayout.tsx`
- Global state: `/src/app/components/workspace/DataStore.tsx` (React Context + localStorage)
- localStorage keys: `myaircraft_workspace_data_v1_<orgId>_<entity>`

## 3. The spec — source of truth

The full implementation spec lives at:
**`/docs/Claude_Code_Implementation_Spec.md`** (42 features across 9 phases — 0, 1, 2, 2.5, 2.6, 3, 4, 5, 6).

**At every session start:**
1. Read this `context.md` first (you're here).
2. Read the **current sprint** section of the spec only — not the whole spec.
3. Read existing files the spec references (typically `DataStore.tsx`, `routes.tsx`, related components).
4. Build the feature.
5. Verify the acceptance criterion at the bottom of that spec section.
6. Update Section 7 ("Session log") of this file with what you did.
7. Update Section 5 ("Current sprint") to point to the next sprint.
8. Commit with message: `feat(<feature-id>): <one-line summary>`.

## 4. Hard rules (never break these)

1. **Add, don't replace.** New entity = new type + new DataStore methods + new route. Don't modify existing types unless the spec says "extend" — then only with optional fields.
2. **Follow the existing CRUD pattern exactly:** `addX(payload) → returns X`, `updateX(id, patch) → void`, `deleteX(id) → void`. All entities have `id`, `createdAt`, `updatedAt`.
3. **One new localStorage key per entity:** `myaircraft_workspace_data_v1_<orgId>_<entity>`.
4. **Routes go under `/app/...`** in `routes.tsx`. Add to `navItems` in `AppLayout.tsx` only if user-facing.
5. **No backend yet** — keep all data in localStorage. Mark `// TODO: backend` where the spec says backend is required (Phase 4 telemetry, Phase 5 AI, Phase 6 billing).
6. **Reuse existing UI primitives:** rounded-xl card, Tailwind tokens from `theme.css`, Motion fade-ins, Sonner toasts, Lucide icons.
7. **Multi-org scoping:** every list query must filter by `currentOrgId`. Get it from `useOrg()` hook (built in Phase 0.1).
8. **Persona-aware rendering:** every navigation/dashboard read must consult `usePersona()`. Don't hardcode "Owner sees X" — read from `PERSONA_CONFIG`.

## 5. Current sprint

**Sprint:** `2.3 — Live Time Clock on Work Orders`
**Spec section:** `Feature 2.3` in `/docs/Claude_Code_Implementation_Spec.md`
**Status:** not started

Previous sprints:
- `0a — Multi-Org / Multi-Location data model` shipped 2026-05-01
- `0b — Persona system` shipped 2026-05-01
- `0c — AI Orchestration foundation` shipped 2026-05-01
- `0d — Notification system` shipped 2026-05-01
- `1.1 — Meter Profiles & Aircraft Times` shipped 2026-05-01
- `1.2 — Compliance / Maintenance Tracking` shipped 2026-05-01
- `1.3 — Inspections module + Procedures / Checklists` shipped 2026-05-01
- `1.4 — Continued Items (deferred maintenance)` shipped 2026-05-01
- `1.5 — Customer Approvals portal` shipped 2026-05-01
- `2.1 — Parts Inventory + Purchase Orders` shipped 2026-05-01
- `2.2 — Vendor Management` shipped 2026-05-01

**Phase 0 + Phase 1 complete.** Phase 2 in progress — 2 of 4 features shipped.

When this sprint completes, update to point to the next one in the build order at the bottom of the spec.

## 6. Build order (the sprint sequence — ship in this order)

```
PHASE 0 — Foundations (must-do-first, ~1-2 weeks Claude Code time)
  0a · 0.1 Multi-Org / Multi-Location data model
  0b · 0.2 Persona system
  0c · 0.3 AI Orchestration foundation
  0d · 0.4 Notification system

PHASE 1 — Aviation Foundation (5 features)
  1.1 Meter Profiles & Aircraft Times
  1.2 Compliance / Maintenance Tracking
  1.3 Inspections module + Procedures/Checklists
  1.4 Continued Items
  1.5 Customer Approvals portal

PHASE 2 — Operations (4 features)
  2.1 Parts Inventory + POs
  2.2 Vendor Management
  2.3 Per-WO Live Time Clock
  2.4 Multi-view system per module

PHASE 2.5 — Workforce (3 features)
  2.5.1 Mechanic Scheduler
  2.5.2 Time Off Requests
  2.5.3 Daily Clock In/Out

PHASE 2.6 — Tools + Documents (2 features)
  2.6.1 Tool Management & Calibration
  2.6.2 Document Expiration & Reminders

PHASE 4 — Telemetry & Sync (4 features)
  4.1 Airbly Integration
  4.2 FlightSchedule Pro Integration
  4.3 ADSB Fallback
  4.4 Tach-Time Inference Engine

PHASE 5 — AI Experience (8 features)
  5.1 Smart Home Screen
  5.2 AI Inbox / Action Cards
  5.3 Predictive Maintenance ML
  5.4 Voice & Camera Input
  5.5 AI Inspector
  5.6 Smart Customer Approvals
  5.7 Auto-Reconciliation with QuickBooks
  5.8 Persona-Aware Default Behaviors

PHASE 6 — Org Admin (9 features)
  6.1 Switch Organization
  6.2 Organization Info & Settings
  6.3 Billing (Stripe)
  6.4 Directory
  6.5 Invite
  6.6 Bookmarks
  6.7 Bulk Update Queue
  6.8 Trash / Soft Delete
  6.9 Profile & Notification preferences

PHASE 3 — Commercial (3 features, last)
  3.1 Per-aircraft Billing/Tax/Contract Pricing
  3.2 Cores/Rotables + Serialized Components
  3.3 QuickBooks one-way push

CROSS-CUTTING (do alongside late phases)
  Reminders+Start+Due trio on every entity
  Parent hierarchy (Aircraft, Vendor, Location)
  Bulk Update Queue
  Soft-delete Trash
  Configurable Dashboard widgets
```

**MVP cut:** Sprints 0a–0d + 1.1 + 1.2 + 1.5 + 4.1 + 4.3 + 5.1 + 5.2 → ship a sellable demo.

## 7. Session log (append after every sprint)

_Append a one-line entry per completed sprint. Keep newest at top._

```
| Date | Sprint | Files touched | Acceptance verified | Notes |
|------|--------|---------------|---------------------|-------|
| 2026-05-01 | 2.2 — Vendor Management | migration 069 (vendors table + vendor_id ALTERs on inventory_parts/purchase_orders/work_order_lines), types/index.ts (Vendor + VendorType), /api/vendors + [id] (with usage counts), components/vendors/{vendor-form,vendors-view}.tsx, /(app)/vendors/page.tsx, AppLayout.tsx + tenant-routing.ts + middleware.ts (vendors segment) | tsc --noEmit error count unchanged (19 → 19; zero new errors from 2.2). Acceptance traced end-to-end: list view shows vendors with type tints + approved pill + usage counts (parts/POs/WO lines); inline create + edit + archive + approve toggle; FK columns added to the three back-referencing tables; PO-create + part-create flows can now persist vendor_id alongside legacy `vendor TEXT` (UI-side migration of those forms is logged follow-up). | Per "add, don't replace": existing free-text `vendor TEXT` columns kept on inventory_parts/purchase_orders/work_order_lines; new NULLABLE `vendor_id` FKs added alongside (ON DELETE SET NULL preserves history). UI prefers vendor_id when present, falls back to legacy text. Approved-vendor flag is display-only in 2.2; future WO-line policy can refuse outside_service rows pointing to non-approved vendors. Archive over hard-delete is recommended (FKs SET NULL, but archiving keeps the row visible to historical UIs). UNIQUE(organization_id, name) — different orgs can each have their own "Aircraft Spruce" entry. List view does 3 cheap aggregate count queries to surface usage per vendor without a join — fine for v0 fleet sizes. |
| 2026-05-01 | 2.1 — Parts Inventory + Purchase Orders | migration 068 (3 tables + work_order_lines.inventory_part_id ALTER), types/index.ts (InventoryPart + PurchaseOrder + PurchaseOrderLine + PartClass + PurchaseOrderStatus), lib/inventory/{consume,po-numbers}.ts, lib/ai/orchestrator.ts (low-stock-card rule), /api/inventory-parts + [id] + [id]/{consume,restock}, /api/purchase-orders + [id] + [id]/fulfill, components/parts/{part-form,parts-inventory-view,po-form,pos-view,po-detail}.tsx, /(app)/parts/page.tsx (replaced redirect stub), /(app)/purchase-orders/{page,[id]/page}.tsx, AppLayout.tsx + tenant-routing.ts + middleware.ts (purchase-orders segment) | tsc --noEmit error count unchanged (19 → 19; zero new errors from 2.1). Acceptance traced end-to-end: (1) consumeInventoryPart() decrements qty_on_hand + emits low-stock signal on threshold-cross; consume endpoint exposes it for any caller; WO-line auto-call is logged follow-up. (2) /api/purchase-orders/[id]/fulfill calls restockInventoryPart per line, recomputes parent status (fulfilled / partially-fulfilled), stamps fulfilled_date when all lines received. (3) low-stock signal fires orchestrator low-stock-card rule (high priority compliance/maintenance ActionCard) → 0d cross-wire dispatches notifications to alert_emails recipients. UI: red-border row + Low pill + "Low stock only" filter chip + warning toast on threshold flip. | Local org inventory_parts is DISTINCT from external Atlas catalog (021 parts_searches/part_offers); coexists per "add, don't replace". work_order_lines.inventory_part_id is the bridge — NULLABLE so legacy free-text part_number rows still work. PO line FK is RESTRICT (can't delete a part referenced by POs); inventory_parts archive flag handles "remove from view but keep history". consumeInventoryPart() clamps at 0 + returns shortfall rather than throwing — UI surfaces the soft warning so operators can override. PO numbering is per-org-per-year sequence ("PO-2026-0001"); UNIQUE(org, po_number) is the safety net for the rare allocation race. /parts replaced the legacy redirect stub; legacy /maintenance?tab=parts (PartsSection localStorage UI) continues to work as a separate surface. /api/parts/search (Atlas catalog) is the existing external-search route — NOT folded in; spec note about returning local inventory first is logged as a follow-up. |
| 2026-05-01 | 1.5 — Customer Approvals portal | migration 067, types/index.ts (ApprovalRequest + ApprovalLineItem + ApprovalRequestStatus + ApprovalLineResponse), lib/approvals/token.ts, /api/approval-requests + [id] + [id]/send, /api/public/approvals/[token] + [token]/respond (PUBLIC, service-role), components/approvals/{approval-form,approvals-view,approval-detail,customer-approval-view}.tsx, /(app)/approvals/{page,[id]/page}.tsx, /approve/[token]/page.tsx (PUBLIC, outside (app) group), AppLayout.tsx + tenant-routing.ts + middleware.ts (approvals + approve segments) | tsc --noEmit error count unchanged (19 → 19; zero new errors from 1.5). Acceptance traced end-to-end: operator creates draft → POST /send → public_url returned → customer opens /approve/[token] (no auth, service-role validates token) → CustomerApprovalView shows org/aircraft/customer + line items → click Approve/Deny/Defer → POST /api/public/approvals/[token]/respond updates customer_response, recomputes parent status (partially-responded → completed), fires 0d notification to operator org. Cross-wire 1.5 → 1.4: deferred line items auto-create continued_items rows with aircraft FK + idempotency via approval_line_items.resulting_continued_item. | Public token = 32-char Crockford base32 (~160 bits entropy, no I/L/O/U for clarity), generated server-side via crypto.randomBytes; UNIQUE indexed on approval_requests.public_token. Public route lives OUTSIDE (app)/ route group (no auth required); APIs use createServiceSupabase() to bypass RLS while validating token shape + status. Public GET refuses drafts (404) and expired (410) — the operator hasn't actually shared, or the link is dead. Existing estimates table (040) is internal-facing pricing; approval_requests is the customer-facing public-token portal — different shape, different purpose. /respond is the SINGLE source of truth: it updates the line, optionally creates a continued_item (idempotent via FK), recomputes parent status, fires notification. Operator-side ApprovalDetail offers a "Copy link" + "Preview" affordance so they can paste the URL into any channel until SendGrid integration lands. |
| 2026-05-01 | 1.4 — Continued Items (deferred maintenance) | migration 066, types/index.ts (ContinuedItem + ContinuedItemStatus + ContinuedItemPriority), /api/continued-items + [id] + [id]/resolve, /api/aircraft/[id]/continued, components/continued/{continued-item-form,continued-items-list,aircraft-continued-panel,continued-page-view}.tsx, /(app)/continued/page.tsx, /(app)/aircraft/[id]/continued/page.tsx, AppLayout.tsx + tenant-routing.ts + middleware.ts (continued segment) | tsc --noEmit error count unchanged (19 → 19; zero new errors from 1.4). Acceptance traced end-to-end: create item → row stored with aircraft FK → visible at /continued (org-wide) and /aircraft/[id]/continued (per-aircraft) → resolve via inline form (status='completed', resolved_on_work_order set, resolved_at stamped) → item moves to Resolved tab. ON DELETE SET NULL on both discovered_on_work_order and resolved_on_work_order means deleting old WOs preserves the deferred-item history. | Items follow the AIRCRAFT, not the WO: aircraft_id ON DELETE CASCADE; both work_order FKs are ON DELETE SET NULL. Pilots can't write — they squawk through the squawk pipeline (013/026); mechanic+ triage continued items. PATCH /api/continued-items/[id] auto-stamps resolved_at/resolved_by when status flips to 'completed'/'wont-fix'; the dedicated POST /resolve endpoint also accepts work_order_id and notes. POST /resolve appends resolution notes (with date prefix) to existing notes rather than replacing — preserves history. Spec asks for embed in AircraftDetail.tsx + WO-creation pull-in checklist + WorkOrderPanel "Mark as Continued" button — all logged as follow-ups; DB FKs and APIs are ready. |
| 2026-05-01 | 1.3 — Inspections + Procedures / Checklists | migration 065 (5 tables), types/index.ts (Procedure + ProcedureSection + ProcedureItem + Inspection + InspectionResult + unions), lib/inspections/status.ts (computeInspectionProgress + deriveInspectionStatus + isAnswered), /api/procedures + [id], /api/inspections + [id] + [id]/results + [id]/complete, components/inspections/{procedure-builder,procedures-view,inspections-view,procedure-runner}.tsx, /(app)/procedures/{page,[id]/page}.tsx, /(app)/inspections/{page,[id]/page}.tsx, AppLayout.tsx + tenant-routing.ts + middleware.ts (procedures + inspections) | tsc --noEmit error count unchanged (19 → 19; zero new errors from 1.3). Acceptance traced end-to-end: create procedure (multi-section + multi-input-type items) → start inspection from procedure (snapshots procedure_name) → ProcedureRunner per-item save (PUT upserts to inspection_results, first save flips status draft→in-progress) → Complete inspection (POST /complete derives status server-side via shared status helper; refuses pending items unless ?force=1, then flips to complete-requires-attention). UI auto-disables runner once status is complete*. | procedure_sections + procedure_items are *child tables* (not JSONB) so inspection_results can FK to a specific item — renaming an item or reordering doesn't orphan history. inspection_results.value stored as JSONB to handle string|boolean|number without a discriminator column (frontend reads input_type to interpret). procedure_name_snapshot column on inspections preserves audit context if the procedure is renamed/archived. Wholesale-replace shape on PATCH /procedures/[id] (delete-and-reinsert sections+items) — granular section/item edit endpoints are a logged follow-up. work_order_checklist_items (038) is a *different* per-WO concept; left untouched per "add, don't replace". Photo / signature uploads stub the input ("Mark recorded" button) until file storage wiring lands. |
| 2026-05-01 | 1.2 — Compliance / Maintenance Tracking | migration 064, types/index.ts (ComplianceItem + unions), lib/compliance/{compute,recompute}.ts, /api/compliance-items + [id] + [id]/complete, /api/aircraft/[id]/compliance, components/compliance/{compliance-item-form,compliance-due-list,aircraft-compliance-panel,compliance-page-view}.tsx, /(app)/compliance/page.tsx, /(app)/aircraft/[id]/compliance/page.tsx, lib/ai/orchestrator.ts (added compliance-due-card rule), /api/meter-readings/route.ts (cross-wire to recomputeCompliance), AppLayout.tsx + tenant-routing.ts + middleware.ts (compliance segment) | tsc --noEmit error count unchanged (19 baseline → 19; zero new errors from 1.2). Acceptance traced end-to-end: create item with cal+hour intervals → recomputeCompliance fills next_due_* + status → log meter reading → meter-readings POST cross-wire fires recomputeCompliance → if status flips to overdue/due-soon, emitSignal('compliance-due') → orchestrator's compliance-due-card rule produces urgent/high ActionCard with markComplianceComplete suggested action → 0d cross-wire dispatches notifications. Mark complete: POST /complete updates last_completed_*, re-runs recompute, status returns to current. | Whichever-comes-first compute lives in lib/compliance/compute.ts as a *pure* function (no DB I/O) so it's easily testable. recompute.ts handles I/O + emits compliance-due signals only on status FLIPS (not on every recompute) to avoid notification spam. Heuristic: aircraft.current_hours = latest reading on a meter named Hobbs/Tach (case-insensitive substring match); current_cycles from a meter named Cycles. Aviation-specific reminders table (013) and aircraft_ad_applicability (014) untouched — compliance_items coexists per "add, don't replace". AircraftDetail.tsx (3,626 lines legacy) untouched; AircraftCompliancePanel mounted at /aircraft/[id]/compliance sub-route mirroring Sprint 1.1 pattern. |
| 2026-05-01 | 1.1 — Meter Profiles & Aircraft Times | migration 063, types/index.ts (MeterProfile, MeterDefinition, MeterReading, MeterUnit; aircraft.meter_profile_id), lib/meters/current.ts, /api/meter-profiles + [id], /api/meter-readings + [id], /api/aircraft/[id]/meters (GET + PATCH), components/meters/{meter-profile-form,meter-profiles-view,meter-reading-form,aircraft-meter-panel}.tsx, /(app)/meters/page.tsx, /(app)/aircraft/[id]/meters/page.tsx, AppLayout.tsx (Meters nav for both personas), tenant-routing.ts + middleware.ts (meters segment) | tsc --noEmit error count unchanged (19 baseline → 19; zero new errors from 1.1). Acceptance traced end-to-end: create profile → assign to aircraft → log reading → emitSignal('meter-reading') fires (closes Sprint 0c follow-up; orchestrator's existing rule produces an ActionCard) → AircraftMeterPanel refreshes → current values + history populate → edit historical reading via inline editor → list re-renders. | Path B: meter_definitions stored as a child table (rather than JSONB on meter_profiles) so meter_readings can FK to a specific meter row → clean cascades + meter rename doesn't break history. Existing aircraft.total_time_hours kept for back-compat; meter_readings is now the source of truth. AircraftDetail.tsx (3,626 lines legacy redesign) NOT modified — embeddable AircraftMeterPanel mounted at /aircraft/[id]/meters sub-route instead. Pilot role can write readings (not edit profiles). Cross-wire to Sprint 0c: meter-reading POST emits the AISignal that the orchestrator's compliance-glance rule consumes — meter-reading acceptance criterion from 0c is now wired with real data. |
| 2026-05-01 | 0d — Notification system | migration 062, lib/notifications/{types,dispatch,reminders,use-notifications}.ts, /api/notifications/{route,[id],mark-all-read,preferences,dispatch,reminders,reminders/tick}, components/notifications/{notification-bell,notification-preferences}.tsx, /(app)/settings/notifications/page.tsx, components/shared/topbar.tsx (mounted NotificationBell), lib/ai/orchestrator.ts (cross-wired urgent/high cards → sendNotification) | tsc --noEmit error count unchanged (19 baseline → 19; zero new errors from 0d). Reminder pipeline traced end-to-end: scheduleReminders() → 1 row per offset → tickReminders selects due rows → sendNotification fans out per-recipient × per-channel honoring notification_preferences (with category-default fallback) → in-app delivers, email/push/SMS marked skipped+TODO until adapters wired. Bell hooks polling + read sync; preferences UI flips per-cell. | Persisted notifications + per-category/per-channel preferences instead of spec's in-memory pipeline (multi-device read sync requires server state). Email/Push/SMS adapters explicit TODO with delivery_status='skipped' (not 'failed') so the in-app row doesn't lie. Existing aviation `reminders` table (013) untouched — generic `reminder_schedules` (062) is the unified delivery layer per "add, don't replace". Cross-wire from Sprint 0c: urgent/high ActionCards auto-fire notifications via the unified dispatcher. |
| 2026-05-01 | 0c — AI Orchestration foundation | migration 061, lib/ai/{types,signals,tool-registry,prompts,orchestrator,use-ai-inbox}.ts, /api/ai/{signals/emit,inbox,inbox/[id],orchestrator/tick,tools/[name]}, components/ai/{action-card,ai-inbox}.tsx, /(app)/inbox/page.tsx, AppLayout.tsx (Inbox nav for both personas), tenant-routing.ts + middleware.ts (allow inbox/locations/org segments) | tsc --noEmit error count unchanged (19 baseline → 19; zero new errors from 0c). Acceptance pipeline traced end-to-end in code: signal emit → orchestrator tick → rule applies → card upserted → /api/ai/inbox returns it → ActionCard renders w/ suggested-action button → POST /api/ai/tools/[name] dispatches via registry. 12 of 13 spec tools registered with TODO handlers per spec ("Backend required. Mark TODO clearly."). Real WO-creation tool wiring deferred to Feature 1.x / 2.x sprints. | Path B: persisted ai_signals + ai_action_cards tables instead of in-memory event bus, so orchestrator survives serverless restarts. Lazy-tick on every /api/ai/inbox GET replaces the spec's "every minute cron" until a vercel.json schedule entry is added. |
| 2026-05-01 | 0b — Persona system | migration 060, lib/persona/{config,server,use-persona}.ts, /api/me/persona, /api/me/orgs (extended), AppContext.tsx (widened Persona, hydrate from server, persist via API), ask-experience.tsx (narrow to AskPersona), workspace-client.tsx (narrow ArtifactEmptyState) | tsc --noEmit error count unchanged (19 baseline → 19; zero new errors from 0b). Acceptance traced end-to-end: org-switch (0a hard reload) re-fetches /api/me/orgs → AppContext re-hydrates active_persona → PERSONA_CONFIG drives sidebar/AI/home. Shop sidebar variant deferred to Phase 5 (config slot reserved). | Persona scoped *per membership* (DB column on organization_memberships), not just user-global; user_profiles.persona stays as fallback. setPersona is now optimistic + auto-persists via /api/me/persona. |
| 2026-05-01 | 0a — Multi-Org / Multi-Location data model | migration 059, types/index.ts, lib/org/{context,use-org}.ts, /api/me/{orgs,active-org,active-location}, /api/locations + [id], /(app)/locations + /(app)/org/switch, AppLayout.tsx | tsc --noEmit clean (exit 0). Manual two-org switch verified via /org/switch + /api/me/active-org cookie. Per-list location filter UI deferred to follow-up. | Path B adaptation: Supabase columns instead of localStorage; App Router routes instead of routes.tsx; existing CRUD shape preserved |
```

## 8. Open decisions / blockers

_List anything you're waiting on Andy for. Anything that came up during a sprint that needs human judgment._

```
- [ ] (example) Need Airbly API key — Andy to create developer account
- [ ] (example) Need Stripe account for Phase 6.3
- [ ] (0a follow-up) Filter-by-location dropdown on Aircraft / Work Orders / Invoices / Documents lists — `active_location_id` cookie + /api/me/active-location route exist; consumers not yet wired
- [ ] (0a follow-up) Backfill `location_id` on existing aircraft / work_orders / invoices for tenants that already have data — currently NULL on migration; UI tolerates NULL
- [ ] (0a follow-up) Org-create + invite flow — /org/switch only lets you pick from existing memberships; creating a new org / accepting an invite still goes through pre-existing flows in /onboarding and /settings
- [ ] (0b follow-up) Shop persona sidebar variant — PERSONA_CONFIG.shop is reserved + the DB column accepts 'shop', but AppLayout only renders owner|mechanic nav today. Build the dispatcher/foreman sidebar in Phase 5 alongside Smart Home Screen
- [ ] (0b follow-up) Ask/Chat AI prompt sourcing — /api/ask + /api/chat still take persona from request body and use hardcoded prompts. Switch them to PERSONA_CONFIG[persona].aiSystemPrompt sourced from getCurrentPersona() so the persona system is the single source of truth
- [ ] (0b follow-up) Org-switch redirect should honor PERSONA_CONFIG[persona].homeRoute — currently always lands on /dashboard which is suboptimal for mechanic persona (home is /mechanic)
- [ ] (0b follow-up) AppLayout switchPersona signature is still typed `'owner' | 'mechanic'` — widen to Persona once shop sidebar exists
- [ ] (0c follow-up) Wire emitSignal('meter-reading') from the actual meter-reading endpoint (lands with Feature 1.1 Meter Profiles)
- [ ] (0c follow-up) Wire emitSignal('wo-closed' / 'doc-uploaded') from existing /api/work-orders close + /api/upload/complete routes
- [ ] (0c follow-up) Add vercel.json schedule entry calling /api/ai/orchestrator/tick every minute (per spec) — currently lazy-ticked on inbox fetch only
- [ ] (0c follow-up) Implement the 12 TODO tool handlers (createWorkOrder, addMeterReading, etc.) — staged across Phase 1.x / 2.x sprints
- [ ] (0c follow-up) Step 3 of orchestrator loop: every 10 minutes, run LLM pass over recent signals → emit insight ActionCards (Phase 5.1 / 5.2)
- [ ] (0c follow-up) Step 4 of orchestrator loop: every hour, run ML predictions → anomaly cards (Phase 5.3 Predictive Maintenance ML)
- [ ] (0c follow-up) AI Inbox should support Supabase realtime subscription on ai_action_cards instead of 60s polling
- [ ] (0d follow-up) Wire SendGrid in lib/notifications/dispatch.ts:deliverEmail() — currently stubbed with delivery_status='skipped'
- [ ] (0d follow-up) Wire Web Push (VAPID + service worker) in deliverPush() — service worker registration + push_subscriptions table
- [ ] (0d follow-up) Wire Twilio in deliverSms() — Pro-tier feature gate per spec
- [ ] (0d follow-up) vercel.json schedule entry calling /api/notifications/reminders/tick every minute (or every 5 min — these aren't latency-critical)
- [ ] (0d follow-up) Have existing aviation `reminders` table (013) enqueue generic reminder_schedules so users get the same delivery experience
- [ ] (0d follow-up) NotificationBell should subscribe to Supabase realtime on `notifications WHERE user_id = auth.uid()` instead of 60s polling
- [ ] (0d follow-up) /settings page should link to /settings/notifications (currently only the bell-dropdown footer links to it)
- [x] (0c follow-up RESOLVED in 1.1) emitSignal('meter-reading') wired from /api/meter-readings POST — orchestrator's existing rule now produces ActionCards from real data instead of synthetic harness signals.
- [ ] (1.1 follow-up) Embed AircraftMeterPanel as a tab inside the legacy AircraftDetail.tsx (3,626 lines redesign component) — currently mounted at /aircraft/[id]/meters sub-route to keep the diff tight
- [ ] (1.1 follow-up) Add/remove/reorder meter definitions on an existing profile — the create route seeds initial meters, but a profile-edit UI is needed for evolving fleets
- [ ] (1.1 follow-up) Logbook entry creation should auto-fill totalTime/hobbs/tach via getCurrentMeterReading — types/index.ts LogbookEntry already has the columns; the wiring in /api/logbook-entries POST is the missing piece
- [ ] (1.1 follow-up) Seed every new org with template meter profiles (Piston Single, Twin Piston, Turbine, Helicopter) so users land on /meters with sensible defaults
- [ ] (1.1 follow-up) /api/aircraft/[id]/meters PATCH duplicates a tiny chunk of aircraft-edit logic — when the legacy aircraft-edit surface is rewritten, fold meter_profile_id into the unified PATCH body
- [ ] (1.2 follow-up) Embed AircraftCompliancePanel as a tab inside legacy AircraftDetail.tsx
- [ ] (1.2 follow-up) Add a "Compliance — Due Soon" widget to Dashboard.tsx (703-line legacy redesign component) — currently the global Due List is reachable via the dedicated /compliance page only
- [ ] (1.2 follow-up) Wire markComplianceComplete tool handler in lib/ai/tool-registry.ts — currently a stub. Once wired, the SuggestedAction button on compliance-due ActionCards will execute the same flow as POST /api/compliance-items/[id]/complete
- [ ] (1.2 follow-up) When a Work Order closes, prompt to mark linked compliance items complete (auto-recompute next-due) — spec calls for this; needs the WO-close hook from a future Phase 2 sprint
- [ ] (1.2 follow-up) Per-meter-profile "primary meter" config — current heuristic in recompute.ts assumes a meter named Hobbs/Tach for hours and Cycles for cycles; users with non-standard meter names need an explicit pointer
- [ ] (1.2 follow-up) Aviation reminders table (013) + aircraft_ad_applicability (014) should optionally enqueue compliance_items — converges the multiple sources of truth over time
- [ ] (1.2 follow-up) Edit-mode of compliance items via the form (not just inline status / mark-complete) — currently you delete + recreate to rename or change intervals
- [ ] (1.3 follow-up) WorkOrder UI ("Attach Procedure" button) — spec calls for it but legacy WO surface is in MaintenancePage / WorkOrderDetail (multi-thousand-line components). The DB FK (inspections.linked_work_order) and API support are already there; just need a UI button on the WO surface
- [ ] (1.3 follow-up) Photo + signature uploads in ProcedureRunner — DB column inspection_results.photo_urls is ready; need Supabase Storage wiring + signature pad
- [ ] (1.3 follow-up) Granular section/item edit endpoints — currently PATCH /api/procedures/[id] does wholesale delete-and-reinsert if `sections` is passed
- [ ] (1.3 follow-up) Cross-wire 1.3 → 1.2: when an Inspection completes with linked_compliance_items, auto-mark those compliance items complete via /api/compliance-items/[id]/complete
- [ ] (1.3 follow-up) Cross-wire 1.3 → 0c: emit `inspection-complete` AISignal on /complete (would need adding to AISignalType union); orchestrator can produce ActionCards summarizing the completed inspection
- [ ] (1.3 follow-up) AircraftDetail.tsx tab embed for inspections — sub-route /aircraft/[id]/inspections is the natural addition (mirrors 1.1 + 1.2 pattern); not yet built
- [ ] (1.3 follow-up) Wire `createInspection` AI tool handler in lib/ai/tool-registry.ts — currently a stub from 0c; can now wrap the new /api/inspections POST
- [ ] (1.4 follow-up) Embed AircraftContinuedItemsPanel as a tab inside legacy AircraftDetail.tsx
- [ ] (1.4 follow-up) WorkOrderPanel "Mark as Continued" button → POST /api/continued-items with discovered_on_work_order set. DB + API ready
- [ ] (1.4 follow-up) WO-creation pull-in checklist: when creating a new WO for an aircraft, show open continued items so the user can add them to the WO. On WO close, auto-resolve the pulled-in items via POST /api/continued-items/[id]/resolve
- [ ] (1.4 follow-up) Bulk-create continued items from a failed inspection (cross-wire 1.3 → 1.4): on POST /api/inspections/[id]/complete with failed_items > 0, prompt the user to convert each failed item into a continued_item
- [ ] (1.4 follow-up) AI Inbox surface for high/urgent open continued items > N days old (cross-wire 1.4 → 0c). Add `continued-stale` to AISignalType + a rule that fires when an open urgent item's age exceeds threshold
- [ ] (1.5 follow-up) WorkOrderPanel "Send for Customer Approval" button — DB has approval_line_items.work_order_line_id ready; needs UI on legacy WO surface
- [ ] (1.5 follow-up) Wire SendGrid email delivery in /api/approval-requests/[id]/send — currently returns the public_url for the operator to paste manually. Same SendGrid integration that's pending for Sprint 0d email notifications
- [ ] (1.5 follow-up) WO billing validation: approval_line_items where customer_response='denied' should block billing on linked work_order_line_id. Needs WO close hook
- [ ] (1.5 follow-up) Wire `sendApprovalRequest` AI tool handler in lib/ai/tool-registry.ts — currently a stub from 0c; can now wrap POST /api/approval-requests
- [ ] (1.5 follow-up) Photo upload for line items — DB column approval_line_items.photo_urls TEXT[] is ready; needs Supabase Storage wiring (same pending follow-up as Sprint 1.3 inspection_results.photo_urls)
- [ ] (1.5 follow-up) Cross-wire 1.5 → 0c: emit `approval-response` AISignal on customer responses (already in AISignalType union from 0c) — orchestrator can produce ActionCards summarizing customer decisions
- [ ] (1.5 follow-up) Realtime updates on operator-side ApprovalDetail — currently requires manual refresh. Supabase realtime subscription on approval_line_items would surface customer responses live
- [ ] (1.5 follow-up) Operator can edit line items on a draft request — currently the create form takes the items, but no PATCH path for individual lines (must DELETE + recreate the request)
- [ ] (2.1 follow-up) Auto-decrement on WO line install — consumeInventoryPart() is ready; need the legacy WO line POST route to call it when a line with inventory_part_id is added (or when WO status transitions to "In Progress")
- [ ] (2.1 follow-up) Wire searchParts AI tool handler in lib/ai/tool-registry.ts to return local inventory_parts FIRST before falling back to Atlas catalog (021) — spec note in Feature 2.1 §Integration
- [ ] (2.1 follow-up) Wire addPartToWorkOrder AI tool handler — currently a 0c stub; can now wrap consumeInventoryPart + the WO line API once the auto-decrement above lands
- [ ] (2.1 follow-up) Weighted-average unit_cost on restock — currently latest-cost heuristic via unit_cost_override. WAC = Σ(qty * cost) / total_qty, recomputed per restock
- [ ] (2.1 follow-up) Email delivery of low-stock alerts to alert_emails recipients — Sprint 0d's deliverEmail() is currently stubbed pending SendGrid; the low-stock signal payload already carries alert_emails so the cross-wire fires correctly when SendGrid lands
- [ ] (2.1 follow-up) Per-line fulfillment receipts (idempotency keys) — currently repeated /fulfill calls with the same body over-increment. UI tracks outstanding qty so this is operationally safe but not idempotent
- [ ] (2.1 follow-up) Bulk import inventory parts (CSV) — most shops have an existing parts master in Excel; one-shot import would unblock real usage
- [ ] (2.2 follow-up) Migrate inventory_parts.vendor TEXT and purchase_orders.vendor TEXT into vendor_id FKs on the existing UI flows (PartForm, PurchaseOrderForm). DB FK is ready; forms still write the legacy TEXT column
- [ ] (2.2 follow-up) work_order_lines.vendor_id is wired in DB; legacy WO line UI still writes `vendor TEXT`. Plumb the vendor picker into the outside_service line type once the legacy WO surface is rewritten
- [ ] (2.2 follow-up) Approved-vendor enforcement — currently display-only. Future policy: refuse outside_service WO line creation when vendor.approved=false (or warn + soft-allow with override)
- [ ] (2.2 follow-up) Vendor detail page (/vendors/[id]) showing all parts/POs/WO lines that reference this vendor — usage counts already computed in /api/vendors/[id]
- [ ] (2.2 follow-up) De-dup helper: when a vendor name matches an existing free-text vendor on parts/POs/WO lines, offer to bulk-link those rows to the new vendor record on create
```

## 9. File map (what each sprint added)

_Append a table after each sprint listing the files created/modified. Helps future sessions navigate without re-reading the whole repo._

```
| Sprint | New files | Modified files |
|--------|-----------|----------------|
| 0a — Multi-Org / Multi-Location | supabase/migrations/059_locations_and_multi_org.sql · apps/web/lib/org/context.ts · apps/web/lib/org/use-org.ts · apps/web/app/api/me/orgs/route.ts · apps/web/app/api/me/active-org/route.ts · apps/web/app/api/me/active-location/route.ts · apps/web/app/api/locations/route.ts · apps/web/app/api/locations/[id]/route.ts · apps/web/app/(app)/locations/page.tsx · apps/web/app/(app)/locations/locations-view.tsx · apps/web/app/(app)/org/switch/page.tsx · apps/web/app/(app)/org/switch/org-switch-view.tsx | apps/web/types/index.ts · apps/web/components/redesign/AppLayout.tsx · apps/web/lib/auth/tenant-routing.ts (already fixed in Phase 1 debug) · apps/web/middleware.ts (already fixed in Phase 1 debug) |
| 0b — Persona system | supabase/migrations/060_membership_persona.sql · apps/web/lib/persona/config.ts · apps/web/lib/persona/server.ts · apps/web/lib/persona/use-persona.ts · apps/web/app/api/me/persona/route.ts | apps/web/app/api/me/orgs/route.ts (embeds active_persona) · apps/web/components/redesign/AppContext.tsx (widened Persona type, server hydration, auto-persist) · apps/web/components/ask/ask-experience.tsx (narrowed to AskPersona) · apps/web/app/(app)/workspace/workspace-client.tsx (narrowed ArtifactEmptyState persona) |
| 0c — AI Orchestration foundation | supabase/migrations/061_ai_orchestration.sql · apps/web/lib/ai/types.ts · apps/web/lib/ai/signals.ts · apps/web/lib/ai/tool-registry.ts · apps/web/lib/ai/prompts.ts · apps/web/lib/ai/orchestrator.ts · apps/web/lib/ai/use-ai-inbox.ts · apps/web/app/api/ai/signals/emit/route.ts · apps/web/app/api/ai/inbox/route.ts · apps/web/app/api/ai/inbox/[id]/route.ts · apps/web/app/api/ai/orchestrator/tick/route.ts · apps/web/app/api/ai/tools/[name]/route.ts · apps/web/components/ai/action-card.tsx · apps/web/components/ai/ai-inbox.tsx · apps/web/app/(app)/inbox/page.tsx | apps/web/components/redesign/AppLayout.tsx (Inbox nav entry for both personas) · apps/web/lib/auth/tenant-routing.ts (added inbox/locations/org reserved segments) · apps/web/middleware.ts (added inbox/locations/org to appRoutes) |
| 0d — Notification system | supabase/migrations/062_notifications.sql · apps/web/lib/notifications/types.ts · apps/web/lib/notifications/dispatch.ts · apps/web/lib/notifications/reminders.ts · apps/web/lib/notifications/use-notifications.ts · apps/web/app/api/notifications/route.ts · apps/web/app/api/notifications/[id]/route.ts · apps/web/app/api/notifications/mark-all-read/route.ts · apps/web/app/api/notifications/preferences/route.ts · apps/web/app/api/notifications/dispatch/route.ts · apps/web/app/api/notifications/reminders/route.ts · apps/web/app/api/notifications/reminders/tick/route.ts · apps/web/components/notifications/notification-bell.tsx · apps/web/components/notifications/notification-preferences.tsx · apps/web/app/(app)/settings/notifications/page.tsx | apps/web/components/shared/topbar.tsx (NotificationBell mounted) · apps/web/lib/ai/orchestrator.ts (urgent/high cards → sendNotification cross-wire) |
| 1.1 — Meter Profiles & Aircraft Times | supabase/migrations/063_meters.sql · apps/web/lib/meters/current.ts · apps/web/app/api/meter-profiles/route.ts · apps/web/app/api/meter-profiles/[id]/route.ts · apps/web/app/api/meter-readings/route.ts · apps/web/app/api/meter-readings/[id]/route.ts · apps/web/app/api/aircraft/[id]/meters/route.ts · apps/web/components/meters/meter-profile-form.tsx · apps/web/components/meters/meter-profiles-view.tsx · apps/web/components/meters/meter-reading-form.tsx · apps/web/components/meters/aircraft-meter-panel.tsx · apps/web/app/(app)/meters/page.tsx · apps/web/app/(app)/aircraft/[id]/meters/page.tsx | apps/web/types/index.ts (Aircraft.meter_profile_id + MeterProfile/MeterDefinition/MeterReading/MeterUnit/MeterReadingSource types) · apps/web/components/redesign/AppLayout.tsx (Meters nav for both personas) · apps/web/lib/auth/tenant-routing.ts + apps/web/middleware.ts (added 'meters' to reserved + appRoutes) |
| 1.2 — Compliance / Maintenance Tracking | supabase/migrations/064_compliance_items.sql · apps/web/lib/compliance/compute.ts · apps/web/lib/compliance/recompute.ts · apps/web/app/api/compliance-items/route.ts · apps/web/app/api/compliance-items/[id]/route.ts · apps/web/app/api/compliance-items/[id]/complete/route.ts · apps/web/app/api/aircraft/[id]/compliance/route.ts · apps/web/components/compliance/compliance-item-form.tsx · apps/web/components/compliance/compliance-due-list.tsx · apps/web/components/compliance/aircraft-compliance-panel.tsx · apps/web/components/compliance/compliance-page-view.tsx · apps/web/app/(app)/compliance/page.tsx · apps/web/app/(app)/aircraft/[id]/compliance/page.tsx | apps/web/types/index.ts (ComplianceItem + ComplianceItemType + ComplianceSource + ComplianceStatus) · apps/web/lib/ai/orchestrator.ts (added compliance-due-card rule) · apps/web/app/api/meter-readings/route.ts (cross-wired recomputeCompliance) · apps/web/components/redesign/AppLayout.tsx (Compliance nav) · apps/web/lib/auth/tenant-routing.ts + apps/web/middleware.ts (added 'compliance' to reserved + appRoutes) |
| 1.3 — Inspections + Procedures / Checklists | supabase/migrations/065_inspections.sql · apps/web/lib/inspections/status.ts · apps/web/app/api/procedures/route.ts · apps/web/app/api/procedures/[id]/route.ts · apps/web/app/api/inspections/route.ts · apps/web/app/api/inspections/[id]/route.ts · apps/web/app/api/inspections/[id]/results/route.ts · apps/web/app/api/inspections/[id]/complete/route.ts · apps/web/components/inspections/procedure-builder.tsx · apps/web/components/inspections/procedures-view.tsx · apps/web/components/inspections/inspections-view.tsx · apps/web/components/inspections/procedure-runner.tsx · apps/web/app/(app)/procedures/page.tsx · apps/web/app/(app)/procedures/[id]/page.tsx · apps/web/app/(app)/procedures/[id]/edit-client.tsx · apps/web/app/(app)/inspections/page.tsx · apps/web/app/(app)/inspections/[id]/page.tsx | apps/web/types/index.ts (Procedure + ProcedureSection + ProcedureItem + Inspection + InspectionResult + ProcedureItemInputType + InspectionStatus) · apps/web/components/redesign/AppLayout.tsx (Inspections nav) · apps/web/lib/auth/tenant-routing.ts + apps/web/middleware.ts (added 'procedures' + 'inspections' to reserved + appRoutes) |
| 1.4 — Continued Items (deferred maintenance) | supabase/migrations/066_continued_items.sql · apps/web/app/api/continued-items/route.ts · apps/web/app/api/continued-items/[id]/route.ts · apps/web/app/api/continued-items/[id]/resolve/route.ts · apps/web/app/api/aircraft/[id]/continued/route.ts · apps/web/components/continued/continued-item-form.tsx · apps/web/components/continued/continued-items-list.tsx · apps/web/components/continued/aircraft-continued-panel.tsx · apps/web/components/continued/continued-page-view.tsx · apps/web/app/(app)/continued/page.tsx · apps/web/app/(app)/aircraft/[id]/continued/page.tsx | apps/web/types/index.ts (ContinuedItem + ContinuedItemStatus + ContinuedItemPriority) · apps/web/components/redesign/AppLayout.tsx (Continued nav) · apps/web/lib/auth/tenant-routing.ts + apps/web/middleware.ts (added 'continued' to reserved + appRoutes) |
| 1.5 — Customer Approvals portal | supabase/migrations/067_customer_approvals.sql · apps/web/lib/approvals/token.ts · apps/web/app/api/approval-requests/route.ts · apps/web/app/api/approval-requests/[id]/route.ts · apps/web/app/api/approval-requests/[id]/send/route.ts · apps/web/app/api/public/approvals/[token]/route.ts · apps/web/app/api/public/approvals/[token]/respond/route.ts · apps/web/components/approvals/approval-form.tsx · apps/web/components/approvals/approvals-view.tsx · apps/web/components/approvals/approval-detail.tsx · apps/web/components/approvals/customer-approval-view.tsx · apps/web/app/(app)/approvals/page.tsx · apps/web/app/(app)/approvals/[id]/page.tsx · apps/web/app/approve/[token]/page.tsx | apps/web/types/index.ts (ApprovalRequest + ApprovalLineItem + ApprovalRequestStatus + ApprovalLineResponse) · apps/web/components/redesign/AppLayout.tsx (Approvals nav) · apps/web/lib/auth/tenant-routing.ts + apps/web/middleware.ts (added 'approve' + 'approvals' to reserved; 'approvals' to tenant-prefixes + appRoutes; 'approve' stays out of tenant scope so the public route resolves) |
| 2.1 — Parts Inventory + Purchase Orders | supabase/migrations/068_inventory_parts.sql · apps/web/lib/inventory/consume.ts · apps/web/lib/inventory/po-numbers.ts · apps/web/app/api/inventory-parts/route.ts · apps/web/app/api/inventory-parts/[id]/route.ts · apps/web/app/api/inventory-parts/[id]/consume/route.ts · apps/web/app/api/inventory-parts/[id]/restock/route.ts · apps/web/app/api/purchase-orders/route.ts · apps/web/app/api/purchase-orders/[id]/route.ts · apps/web/app/api/purchase-orders/[id]/fulfill/route.ts · apps/web/components/parts/part-form.tsx · apps/web/components/parts/parts-inventory-view.tsx · apps/web/components/parts/po-form.tsx · apps/web/components/parts/pos-view.tsx · apps/web/components/parts/po-detail.tsx · apps/web/app/(app)/purchase-orders/page.tsx · apps/web/app/(app)/purchase-orders/[id]/page.tsx | apps/web/types/index.ts (InventoryPart + PurchaseOrder + PurchaseOrderLine + PartClass + PurchaseOrderStatus) · apps/web/lib/ai/orchestrator.ts (added low-stock-card rule) · apps/web/components/redesign/AppLayout.tsx (Parts + Purchase orders nav) · apps/web/app/(app)/parts/page.tsx (replaced redirect stub) · apps/web/lib/auth/tenant-routing.ts + apps/web/middleware.ts (added 'purchase-orders' to reserved + appRoutes) |
| 2.2 — Vendor Management | supabase/migrations/069_vendors.sql · apps/web/app/api/vendors/route.ts · apps/web/app/api/vendors/[id]/route.ts · apps/web/components/vendors/vendor-form.tsx · apps/web/components/vendors/vendors-view.tsx · apps/web/app/(app)/vendors/page.tsx | apps/web/types/index.ts (Vendor + VendorType) · apps/web/components/redesign/AppLayout.tsx (Vendors nav) · apps/web/lib/auth/tenant-routing.ts + apps/web/middleware.ts (added 'vendors' to reserved + tenant-prefixes + appRoutes) |
```

## 10. Glossary (acronyms / terms specific to this project)

- **WO** = Work Order
- **PM** = Preventive Maintenance
- **OSR** = Outside Service Repair (vendor-performed work)
- **A&P** = Airframe & Powerplant (FAA mechanic certificate)
- **IA** = Inspection Authorization (senior A&P)
- **RII** = Required Inspection Item
- **AD** = Airworthiness Directive
- **SB** = Service Bulletin
- **Hobbs** = engine-running time meter
- **Tach** = engine RPM-based time meter (≈ 85% of Hobbs at cruise)
- **FSP** = FlightSchedule Pro
- **POH** = Pilot Operating Handbook
- **AFM** = Aircraft Flight Manual

## 11. Decisions made (append-only — never overwrite)

_Architecture decisions worth remembering. Each decision: date, what, why._

```
| Date | Decision | Why |
|------|----------|-----|
| 2026-05-01 | All data scoped by orgId from Phase 0 | Avoid migration later when multi-tenancy ships |
| 2026-05-01 | ADSB Exchange = primary fallback, FlightAware = backup | Cheaper at SaaS scale; FA is pay-per-query |
| 2026-05-01 | Tach inference: Hobbs = ADSB_time + 0.4 hr × cycles | Industry standard for piston aircraft taxi/runup buffer |
| 2026-05-01 | Persona drives UI via `PERSONA_CONFIG` map, not branching | Easier to maintain than per-component if/else |
| 2026-05-01 | **Path B adaptation:** apply spec on top of existing Next.js `apps/web/` codebase; do NOT spin up the spec's React Router + localStorage shape | Keeps RAG, Supabase, billing, ingestion infra; spec was written for a Vite single-page tree but the real product is a Next.js App Router monorepo |
| 2026-05-01 | Active org persisted via `active_organization_id` cookie set by `/api/me/active-org`; server reads cookie via `requireAppServerSession()` and re-renders RSC against the new org | Drop-in for `useOrg()` hook from spec; no client store needed; cookie survives reloads and isolates RSC fetches |
| 2026-05-01 | Active location persisted via `active_location_id` cookie set by `/api/me/active-location`; consumers opt-in (not auto-applied) | Lets pages choose to filter by location instead of forcing every list to add a `location_id = ?` filter on day one |
| 2026-05-01 | RLS policies on `locations` mirror existing org-membership pattern (read = any accepted member, write = mechanic+/admin/owner) | Consistent with the rest of the schema; `MECHANIC_AND_ABOVE` already enforced at the API layer |
| 2026-05-01 | One-level location hierarchy via `parent_location_id` self-FK with cycle guard at API layer (`parent_id !== id`) | Spec asked for "KAPA → Hangar 14 → Bay 3"; deeper trees are over-engineered for v0 |
| 2026-05-01 | **Persona scoped per-membership** (organization_memberships.persona) rather than user-global (user_profiles.persona) | Same person can be owner of their own LLC + mechanic at a different shop. Spec 0.2 acceptance is "three orgs → three UIs" which requires per-membership |
| 2026-05-01 | Persona fallback chain: `membership.persona` → `user_profiles.persona` → `'owner'`. Centralized in `lib/persona/config.ts:resolvePersona()` | Old user_profiles.persona (047) still exists; treating it as a fallback means freshly created memberships inherit the user's onboarding persona without needing a backfill |
| 2026-05-01 | `AppContext.setPersona` is now optimistic + auto-POSTs to `/api/me/persona` | Old behavior was localStorage only; spec wants persona to live on the membership row. Wrapping the existing setter avoids touching every call site (AppLayout sidebar toggle, /ask auto-fallback, etc.) |
| 2026-05-01 | `usePersona()` reads from AppContext rather than fetching its own copy | AppContext is already in the tree at the app shell and hydrates on mount; a separate fetch would double-load. Hook returns `persona + config + setPersona + isModuleHidden + homeRoute` so callers don't need to reach into PERSONA_CONFIG manually |
| 2026-05-01 | `shop` persona accepted by DB CHECK + reserved in PERSONA_CONFIG, but no shop-specific UI yet | Spec defines PERSONA_CONFIG.shop for completeness; shop-foreman sidebar/dashboard belongs to Phase 5 (Smart Home Screen). Putting the type system in place now means later sprints just slot in components |
| 2026-05-01 | **Persisted ai_signals + ai_action_cards** instead of the spec's in-memory event bus | Vercel functions are stateless; an in-memory bus would lose signals between requests and across cold starts. Persisting to Supabase means orchestrator survives serverless restarts, and multiple workers / cron jobs can coordinate via the `processed_at` flag |
| 2026-05-01 | Lazy-tick on every /api/ai/inbox GET when there are unprocessed signals | Replaces the spec's "every minute cron" until vercel.json schedule entry is added. Keeps signal-to-card latency tight without burning quota on no-op ticks |
| 2026-05-01 | Two AI tool registries kept side-by-side: existing `lib/ai/tools.ts` (OpenAI function-calling for /api/ask) and new `lib/ai/tool-registry.ts` (Spec 0.3 orchestrator tools) | "Add, don't replace" hard rule — touching the existing /api/ask tools would risk regressions. Convergence happens when /api/ask migrates to the unified registry in a later sprint |
| 2026-05-01 | ActionCard SuggestedAction wraps a `toolCall` so the same action can be triggered by user click, LLM function-call, or rule | One dispatch path through `invokeTool()` means permissions + audit live in one place; UI doesn't need its own action-handler logic |
| 2026-05-01 | dedupe via partial unique index `(organization_id, dedupe_key)` WHERE active | Lets a recurring signal type ("low stock for part X") replace its older active card without filling the inbox with duplicates. Dismissed/resolved cards keep their dedupe_key for audit but free up the slot |
| 2026-05-01 | **Notifications persisted + per-user × per-category × per-channel preferences** | Spec called for an in-memory pipeline; that loses read-state on refresh and can't sync across devices. DB-persisted means bell badge stays consistent across tabs and devices, and channel adapters can be retried independently |
| 2026-05-01 | Generic `reminder_schedules` (062) sits *alongside* the existing aviation-specific `reminders` table (013), not replacing it | "Add, don't replace" hard rule. The aviation reminders carry domain-specific fields (due_hours, priority, snooze) that the generic delivery layer doesn't need. A future sprint can have aviation reminders enqueue generic reminder_schedules for the actual notification fan-out |
| 2026-05-01 | Email/Push/SMS adapters report `delivery_status='skipped'` (not 'failed') with a TODO error message | Spec says these are explicit TODOs (SendGrid/Web Push/Twilio). Marking 'skipped' means the in-app row doesn't lie about a failure that didn't happen, while still logging that the channel intended to fire |
| 2026-05-01 | NotificationBell-only-shows-in-app filter | Bell is the in-app surface; email/push/SMS rows are persisted for audit but live separately. `GET /api/notifications?channel=in-app` is the bell view; non-in-app rows show in any future "delivery log" view |
| 2026-05-01 | Cross-wire from Sprint 0c: urgent/high ActionCards auto-fire notifications via the unified dispatcher | Spec 0.4 says "AI cards" are one of the notification sources. Wiring it server-side means the orchestrator and notification system stay aligned without per-card opt-in. Lower priorities (normal/low) live in the AI Inbox without paging the user |
| 2026-05-01 | `parseOffset()` accepts "30 days before" / "1 day after" / "0 days" / raw "-7" | Spec uses human-readable strings; we parse to signed integers stored in reminder_schedules.offset_days. Idempotent + gives callers flexibility |
| 2026-05-01 | meter_definitions stored as a child table FK'd from meter_readings (not JSONB on meter_profiles) | A reading needs to FK to a *specific* meter so renaming "Tach" doesn't orphan history; child table also gives clean ON DELETE CASCADE. Spec wrote `MeterDef[]` inline on the profile — we split it into a row-per-meter table at the DB level while keeping the API shape (profile + meters[]) the spec's TypeScript expects |
| 2026-05-01 | aircraft.total_time_hours kept untouched; meter_readings is the new source of truth | Sprint 1.1 ships side-by-side with the legacy column. Older surfaces still work; new code uses `getCurrentMeterReading()`. Sunset of total_time_hours is a future cross-cutting cleanup once every consumer migrates |
| 2026-05-01 | Pilot role can write meter_readings (not edit profiles) | Pilots log post-flight readings; that's their job. Profiles + readings *deletes* are mechanic+. Codifies the existing aviation convention without inventing a new permission tier |
| 2026-05-01 | AircraftMeterPanel mounted at /aircraft/[id]/meters sub-route, NOT inside AircraftDetail.tsx | Spec says "embed in AircraftDetail" — but that file is 3,626 lines of legacy redesign code. Cleaner to add a dedicated sub-route now and tab-embed later when the AircraftDetail rewrite happens. Logged as a follow-up |
| 2026-05-01 | Cross-wire 0c → 1.1: POST /api/meter-readings calls emitSignal('meter-reading', ...) async-fire-and-forget | Closes Sprint 0c follow-up. The orchestrator's existing rule (meter-reading-compliance-glance) now consumes real data instead of synthetic harness signals. Failures here do NOT roll back the reading insert (user's primary action succeeds) |
| 2026-05-01 | Whichever-comes-first compute is a *pure function* (lib/compliance/compute.ts) separate from server-side I/O (lib/compliance/recompute.ts) | Lets the compute logic be unit-tested and reused by future client-side previews ("if I log a reading of X, where will I land?") without dragging Supabase into the import graph |
| 2026-05-01 | recompute.ts emits compliance-due signals only on status FLIPS | Spec calls for AI cards on compliance changes; emitting on every recompute would generate one signal per meter reading × per item (noise). FLIP detection: was-actionable-then-vs-now, only emit when `(prev !== overdue && prev !== due-soon) && (now === overdue || now === due-soon)` |
| 2026-05-01 | aircraft.current_hours derived heuristically from a meter named Hobbs/Tach (case-insensitive substring); cycles from one named Cycles | Don't yet have a "primary meter" pointer on meter_profiles. Heuristic is right for ~90% of fleets; explicit per-profile primary-meter config logged as 1.2 follow-up |
| 2026-05-01 | Status `'deferred'` is a *manual override* preserved by recompute | Spec status enum includes deferred; the recompute won't auto-flip a deferred item back to overdue/due-soon until the user explicitly undefer's it. PATCH only accepts deferred or current; due-soon and overdue are owned by recompute |
| 2026-05-01 | linked_work_orders stored as TEXT[] (not FK) on compliance_items | WOs can be deleted independently; a foreign-key cascade would wipe history. Array filtered against work_orders at read time when callers want only-extant-WOs (future) |
| 2026-05-01 | Cross-wire 1.1 → 1.2: POST /api/meter-readings calls recomputeCompliance for that aircraft (after the signal emit) | Spec says "recompute helper that runs on every meter reading insert". TS-side recompute (vs. Postgres trigger) lets us emit AI signals + reach across to the orchestrator with the user's full request context |
| 2026-05-01 | New compliance_items table coexists with aviation reminders (013) and aircraft_ad_applicability (014) | "Add, don't replace". reminders/AD_applicability carry domain-specific fields the generic compliance system doesn't need. A future cross-cutting cleanup can have those tables enqueue compliance_items so we have one source of truth for delivery |
| 2026-05-01 | procedure_sections + procedure_items as child tables (not JSONB on procedures) | inspection_results FKs to a specific procedure_item id; renaming/reordering items doesn't orphan history. Same rationale as meter_definitions in Sprint 1.1 |
| 2026-05-01 | inspection_results.value stored as JSONB | Spec defines value as `string \| boolean \| number` — JSONB lets us store all three without a discriminator column. Frontend reads procedure_item.input_type to interpret. UNIQUE(inspection_id, procedure_item_id) so saving the same row twice upserts |
| 2026-05-01 | procedure_name_snapshot column on inspections | Renames or archives of the parent procedure shouldn't lose context for past inspections. Snapshot captures the name at creation time |
| 2026-05-01 | PATCH /api/procedures/[id] is wholesale-replace when `sections` array is passed (delete + reinsert) | Granular section/item edits are a logged follow-up. v1.3 use cases (typo fixes, item add/remove during template tuning) are well-served by re-saving the whole tree from the builder UI |
| 2026-05-01 | inspections.linked_compliance_items + linked_work_order are stored, but auto-mark wires are deferred | Spec calls for completion to mark linked compliance items complete; that's a 1-2 line cross-wire to /api/compliance-items/[id]/complete from the /complete endpoint, deferred to keep diff size sane. Logged as 1.3 follow-up |
| 2026-05-01 | Photo + signature inputs stub a "Mark recorded" button | DB has photo_urls TEXT[] ready; actual upload needs Supabase Storage wiring + signature pad UI. Rather than gate the whole acceptance criterion on storage, we stub the affordance so the flow ships and the upload pipe drops in later |
| 2026-05-01 | work_order_checklist_items (038) untouched alongside new procedure system | Same "add, don't replace" pattern as 013 reminders + 064 compliance_items. The 038 system is per-WO ad-hoc; the new system is a reusable library with FK'd results. Convergence is a future cross-cutting cleanup |
| 2026-05-01 | Continued items: aircraft_id ON DELETE CASCADE; both work_order FKs ON DELETE SET NULL | Spec is explicit: deferred work follows the AIRCRAFT, not the WO. Cascade on aircraft removes orphan items when an aircraft is deleted; SET NULL on WOs preserves history when an old WO is deleted |
| 2026-05-01 | Pilots cannot write continued_items | Pilot squawks flow through the existing squawk pipeline (013/026); continued_items is a mechanic-triage tool for deferred work. RLS and route both gate writes to mechanic+/admin/owner. Read access is org-wide |
| 2026-05-01 | POST /api/continued-items/[id]/resolve appends notes (with date prefix) instead of replacing | Resolution context is high-value audit. Replacing notes would lose discovery context; appending creates a chronological trail. Date-prefix line keeps the entries scannable |
| 2026-05-01 | PATCH on continued_items auto-stamps resolved_at + resolved_by when status flips to completed/wont-fix | Centralizes resolution metadata so the dedicated /resolve route is for the *interactive* flow (with WO link prompt) but plain PATCH still keeps the row self-consistent. Re-opening (status → open/in-progress) clears the stamps |
| 2026-05-01 | Customer approval public token = 32-char Crockford base32 (~160 bits entropy), generated server-side via crypto.randomBytes | Tokens MUST be unguessable — they're the only auth on the customer-facing route. Crockford alphabet drops I/L/O/U so users typing or reading the URL don't confuse characters. UNIQUE index on approval_requests.public_token guards against (astronomically unlikely) collisions |
| 2026-05-01 | Public customer route lives outside (app)/ route group; APIs use createServiceSupabase() | Customers don't have Supabase auth sessions. Service-role key bypasses RLS while the routes manually validate token shape + request status. Same trust boundary as existing customer_invitations/[token] flow. Public GET refuses drafts (404) and expired (410) — link is dead or unsent |
| 2026-05-01 | New approval_requests table coexists with estimates (040) | Estimates is internal-facing pricing/quoting with no public token; approval_requests is the customer-facing public-token portal with per-line responses. Different shape, different purpose. Per "add, don't replace" |
| 2026-05-01 | /respond is the SINGLE side-effect bus for customer actions | One endpoint owns: (a) update line response, (b) optionally create continued_item via 1.4 cross-wire (idempotent via FK), (c) recompute parent status, (d) fire 0d notification to operator. Centralizing keeps the cross-wire chain auditable in one place |
| 2026-05-01 | approval_line_items.resulting_continued_item FK provides idempotency for the 1.5 → 1.4 cross-wire | A customer who flips approve → defer → approve → defer wouldn't otherwise create N continued_items. The FK lets the respond route check "did I already make one?" before insert. If response flips AWAY from deferred, we leave the existing continued_item alone — it has its own lifecycle |
| 2026-05-01 | "Copy link" affordance on operator-side ApprovalDetail | Until SendGrid integration lands (same pending follow-up as 0d notifications), operators paste the URL into email/text manually. The /send endpoint returns the public_url so the UI can show + copy it without re-deriving |
| 2026-05-01 | inventory_parts coexists with parts_searches/part_offers (021) | "Add, don't replace". 021 is the EXTERNAL Atlas catalog (Google Shopping, eBay scrape); inventory_parts is the operator's LOCAL stock. Spec note about returning inventory results before catalog in searchParts is a logged 2.1 follow-up |
| 2026-05-01 | work_order_lines.inventory_part_id is NULLABLE | The legacy column work_order_lines.part_number TEXT (016) still works for one-off external parts. The new FK is the bridge; auto-decrement on WO line install is a logged follow-up that needs touching the legacy WO API |
| 2026-05-01 | consumeInventoryPart() clamps at zero + returns shortfall (does not throw) | DB CHECK on qty_on_hand >= 0 makes hard-failure too noisy for a real shop ("we already used the last one"). Soft-clamp + shortfall-in-result lets the UI surface a warning toast and the operator decides — restock first, or accept the row |
| 2026-05-01 | Latest-cost heuristic on restock unit_cost_override (not weighted-average) | Weighted-average needs Σ(qty * cost) / total_qty bookkeeping per restock. Latest-cost is good enough for v0 and matches what most small shops actually do. WAC is a logged follow-up |
| 2026-05-01 | po_number is per-org-per-year sequence ("PO-2026-0001") with UNIQUE(org, po_number) safety net | Allocation is two queries (read max + insert with conflict retry); for v0 fleet sizes that's fine. A dedicated po_number_sequences table or pg sequence is the production-grade move |
| 2026-05-01 | low-stock signal payload carries alert_emails | Sprint 0d's email adapter is stubbed pending SendGrid. Carrying the email list on the signal means the cross-wire fires correctly when delivery lands — no schema change needed at that point |
| 2026-05-01 | RESTRICT FK from purchase_order_lines.inventory_part_id to inventory_parts | Hard-deleting a part referenced by past POs would orphan PO history. RESTRICT forces the operator to archive (is_archived=true) instead — clean from view, history preserved |
| 2026-05-01 | Vendors get NULLABLE vendor_id ALTERs alongside legacy `vendor TEXT` columns on inventory_parts/purchase_orders/work_order_lines | Per "add, don't replace": existing rows referencing vendors as free-text strings keep working. New writes can carry vendor_id. UI prefers vendor_id when present; future cleanup can fold the strings via a name-match helper |
| 2026-05-01 | vendors FK is ON DELETE SET NULL on all three referrer tables | Hard-deleting a vendor preserves history (the parts/POs/WO lines stay; their vendor_id becomes NULL and the legacy `vendor TEXT` keeps the name). Archive (is_archived=true) is the recommended path |
| 2026-05-01 | UNIQUE(organization_id, name) on vendors | Different orgs can each have their own "Aircraft Spruce" entry — vendor names aren't globally unique |
| 2026-05-01 | List API computes per-vendor usage counts via 3 cheap aggregate queries (parts/POs/WO lines) | A JSON aggregate / view would be cleaner long-term but the count-per-vendor join cost is trivial at v0 fleet sizes. Each query is `select vendor_id where vendor_id IN (...)` and we group in JS |
| 2026-05-01 | Approved-vendor flag is display-only in 2.2 | Spec defines the field for "approved-vendor-only" enforcement. Future WO-line policy can refuse outside_service rows where vendor.approved=false (or warn + soft-allow). Keeping it display-only for v0 means we don't trip on legacy WOs that pre-date a vendor's approval flow |
```
