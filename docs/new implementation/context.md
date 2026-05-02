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

**Sprint:** `0c — AI Orchestration foundation`
**Spec section:** `Feature 0.3` in `/docs/Claude_Code_Implementation_Spec.md`
**Status:** not started

Previous sprints:
- `0a — Multi-Org / Multi-Location data model` shipped 2026-05-01
- `0b — Persona system` shipped 2026-05-01

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
```

## 9. File map (what each sprint added)

_Append a table after each sprint listing the files created/modified. Helps future sessions navigate without re-reading the whole repo._

```
| Sprint | New files | Modified files |
|--------|-----------|----------------|
| 0a — Multi-Org / Multi-Location | supabase/migrations/059_locations_and_multi_org.sql · apps/web/lib/org/context.ts · apps/web/lib/org/use-org.ts · apps/web/app/api/me/orgs/route.ts · apps/web/app/api/me/active-org/route.ts · apps/web/app/api/me/active-location/route.ts · apps/web/app/api/locations/route.ts · apps/web/app/api/locations/[id]/route.ts · apps/web/app/(app)/locations/page.tsx · apps/web/app/(app)/locations/locations-view.tsx · apps/web/app/(app)/org/switch/page.tsx · apps/web/app/(app)/org/switch/org-switch-view.tsx | apps/web/types/index.ts · apps/web/components/redesign/AppLayout.tsx · apps/web/lib/auth/tenant-routing.ts (already fixed in Phase 1 debug) · apps/web/middleware.ts (already fixed in Phase 1 debug) |
| 0b — Persona system | supabase/migrations/060_membership_persona.sql · apps/web/lib/persona/config.ts · apps/web/lib/persona/server.ts · apps/web/lib/persona/use-persona.ts · apps/web/app/api/me/persona/route.ts | apps/web/app/api/me/orgs/route.ts (embeds active_persona) · apps/web/components/redesign/AppContext.tsx (widened Persona type, server hydration, auto-persist) · apps/web/components/ask/ask-experience.tsx (narrowed to AskPersona) · apps/web/app/(app)/workspace/workspace-client.tsx (narrowed ArtifactEmptyState persona) |
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
```
