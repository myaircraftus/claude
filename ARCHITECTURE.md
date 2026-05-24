# myaircraft.us — Architecture Handover

> Brain dump for the next maintainer. File paths are absolute from the repo root unless otherwise noted. Prefer reading the source over trusting this doc — but read this doc first so you know which sources matter.

---

## 1. Overview

**myaircraft.us** is a multi-tenant aviation maintenance SaaS for piston / light-turbine aircraft owners and the shops that maintain them. It replaces a stack of paper logbooks, Excel sheets, ShopMonkey, Flight Schedule Pro, and email threads with a single workspace centered on the aircraft.

Three personas share the codebase:

- **Owner** — an aircraft owner. Reads their lockbox, signs estimates, pays invoices, asks AI questions about their logbook.
- **Shop** — mechanics, A&Ps, IAs, service writers, and shop admins. They write work, sign logbook entries, manage parts, see workforce data.
- **Platform admin** — the founder (Andy). `/admin/*` surfaces.

Frontend: Next.js 14 App Router, React 18, TypeScript, Tailwind, shadcn/Radix. Backend: Supabase (Postgres 15 with pgvector + RLS, Supabase Auth, Supabase Storage). Hosting: Vercel. AI: OpenAI gpt-4o / gpt-4o-mini, Anthropic Claude (code), Cohere rerank. Email: Resend. SMS: Twilio. Payments: Stripe. Errors: Sentry. Analytics: PostHog. Headless browser scrapers run in Vercel Sandbox via Playwright + `@sparticuz/chromium`.

---

## 2. Tech stack

Versions from `/Users/andy/1. do not touch/myaircraft/apps/web/package.json`:

| Layer | Pinned version | Notes |
| --- | --- | --- |
| Next.js | `14.2.3` | App Router. Stuck on 14.x because the SWC parser in 15 chokes on the same external deps Next 14 already externalizes. |
| React / ReactDOM | `^18.3.0` | Server components. |
| TypeScript | `^5.4.0` | `ignoreBuildErrors: true` — see §21. |
| Tailwind | `^3.4.3` | Plus `tailwindcss-animate`, `@tailwindcss/typography`. |
| shadcn / Radix | varies | Most `@radix-ui/*` primitives 1.x–2.x. |
| Supabase | `@supabase/supabase-js ^2.43.0`, `@supabase/ssr ^0.3.0` | `ssr` v0.3 uses `get/set/remove`, **not** `getAll/setAll` — see `apps/web/middleware.ts`. |
| OpenAI | `openai ^4.52.0` | `gpt-4o` (main), `gpt-4o-mini` (cheap classifiers / heuristics). |
| Anthropic | `@anthropic-ai/sdk` — used in build automation tooling, not at runtime. | The product runs on OpenAI; Claude is the IDE author. |
| Stripe | `stripe ^15.12.0` | Server SDK. Stripe.js on the client. |
| Resend | HTTP only (no SDK). | Webhooks ride in over `/api/webhooks/resend/inbound`. |
| Twilio | HTTP only. | Inbound at `/api/webhooks/twilio/sms`. |
| Sentry | `@sentry/nextjs ^8.7.0` | `apps/web/sentry.client.config.ts` + `sentry.server.config.ts`. |
| PostHog | `posthog-js ^1.136.0` | Client only. |
| Playwright | `playwright-core ^1.60.0` + `@sparticuz/chromium ^148` | Loaded dynamically via `@vercel/sandbox ^2.0.0` so it never enters the cold-start bundle. |
| pdf | `@react-pdf-viewer/*`, `@react-pdf/renderer`, `pdf-lib`, `pdfjs-dist` | PDF read + render + author. |
| State / data | `@tanstack/react-query ^5.40`, `zustand ^4.5`, `zod ^3.23` | |
| Auth chrome | `@supabase/ssr` cookie bridge. | |
| Background jobs | `@trigger.dev/sdk ^3.0` (legacy; mostly cron now). | |

Linting is `eslint-config-next 14.2.3`. Testing is `vitest ^1.6`.

---

## 3. Repo layout

Monorepo, pnpm workspaces (`pnpm-workspace.yaml`). Turbo config is present but largely vestigial.

```
/Users/andy/1. do not touch/myaircraft/
├── apps/
│   └── web/                # The only deployed app — Next.js 14 (see §4)
│       ├── app/            # App Router tree
│       ├── components/     # All React components
│       ├── lib/            # All business logic
│       ├── content/blog/   # MDX blog posts
│       ├── data/           # Seed JSON
│       ├── public/         # Static assets
│       ├── scripts/        # One-off node / tsx scripts
│       ├── types/          # Shared TS types
│       ├── middleware.ts   # Tenant routing + auth gate
│       ├── next.config.mjs # The active config (NOT next.config.ts)
│       ├── vercel.json     # Cron schedules + headers (app-level)
│       ├── tailwind.config.ts
│       └── package.json
├── supabase/
│   ├── migrations/         # 173 SQL files — see §7
│   └── ...
├── packages/
│   └── database/           # Shared DB types (legacy — most types are in apps/web/types)
├── docs/                   # Internal docs / runbooks (60+ files)
├── trigger/                # Trigger.dev v3 background jobs (legacy)
├── scripts/                # Repo-level migration scripts
├── modal/                  # Modal.com Python OCR worker (legacy)
├── vercel.json             # Repo-level Vercel config (install/build command shim)
├── pnpm-workspace.yaml
├── package.json            # Workspace root
└── CLAUDE.md / AGENTS.md   # Codebase instructions for AI tools
```

The only deployed app is `apps/web`. Vercel build command (root `vercel.json`):

```json
"installCommand": "corepack enable && pnpm install --frozen-lockfile=false",
"buildCommand": "pnpm --filter @myaircraft/web build",
"outputDirectory": "apps/web/.next"
```

The `apps/web/vercel.json` overrides this with `cd ../..` prefixes because the Vercel project root was configured to point at `apps/web/`.

---

## 4. Routes

`apps/web/app/` uses the App Router. Three logical groups:

### 4.1 Marketing / public (no auth)

Under `apps/web/app/*` outside the `(app)` group:

| Path | File | Purpose |
| --- | --- | --- |
| `/` | `app/page.tsx` | Homepage. Renders `components/marketing/vite/HomePage.tsx`. |
| `/about` | `app/about/page.tsx` | Mission / team page. |
| `/pricing` | `app/pricing/page.tsx` | Per-persona pricing tiers; pulls SKUs from `lib/billing/products.ts`. |
| `/features` | `app/features/page.tsx` | Feature deep-dive. |
| `/scanning` | `app/scanning/page.tsx` | Logbook scanning landing page. |
| `/blog` | `app/blog/page.tsx` + `app/blog/[slug]/page.tsx` | MDX blog — index + post; sources are `apps/web/content/blog/*.mdx` parsed by `lib/blog.ts`. |
| `/contact` | `app/contact/page.tsx` | Contact form → `/api/contact`. |
| `/privacy`, `/terms`, `/security`, `/status` | `app/{privacy,terms,security,status}/page.tsx` | Legal + status pages. |
| `/demo` | `app/demo/page.tsx` + `app/demo/[...catch]/page.tsx` | Demo workspaces. Owner / mechanic personas mounted under `/demo/owner` and `/demo/mechanic`. `app/demo/[...catch]/page.tsx` is the catch-all that mounts the real shell against seed data. |
| `/sop-library` | `app/sop-library/page.tsx` | Public-facing SOP library. |
| `/owner/{handle}` | `app/owner/[handle]/page.tsx` | Vanity public profile for an aircraft owner. Routed past the auth gate in `middleware.ts`. |
| `/mechanic/{handle}` | `app/mechanic/[handle]/page.tsx` | Same, for a mechanic. |
| `/onboarding`, `/onboarding/billing` | `app/onboarding/*` | First-run wizard for new orgs (semi-public — they live outside `(app)`). |
| `/investor-room`, `/investor-pitch-present` | | Founder pitch surfaces. |
| `/logbook-scanning`, `/approve`, `/accept-mechanic-invite` | | Invite-token landings. |

Plus the metadata routes:

- `app/sitemap.ts` — `MetadataRoute.Sitemap` over the static pages + every MDX blog post.
- `app/robots.ts` — `robots.txt`.
- `app/manifest.ts` — PWA manifest.
- `app/opengraph-image.tsx` — root OG image (used as fallback).
- `app/icon.tsx`, `app/apple-icon.tsx` — favicons.
- Per-page `opengraph-image.tsx` files in `app/pricing/`, `app/features/`, `app/about/`, `app/scanning/`, `app/blog/[slug]/`.
- `app/not-found.tsx` — 404 page.

### 4.2 App (auth-gated)

`apps/web/app/(app)/` — route group whose `layout.tsx` mounts `components/redesign/AppLayout.tsx` (the persona-aware shell). Every route here is gated by `middleware.ts` (which checks `supabase.auth.getUser()` and redirects to `/login` if missing). The full subdirectory list:

```
(app)/admin               (app)/maintenance       (app)/scanner
(app)/aircraft            (app)/manuals           (app)/scheduler
(app)/approvals           (app)/marketplace       (app)/settings
(app)/ask                 (app)/mechanic          (app)/squawks
(app)/ask-logbook-ai      (app)/messages          (app)/styleguide
(app)/clock               (app)/meters            (app)/time-clock
(app)/compliance          (app)/my-aircraft       (app)/time-off
(app)/continued           (app)/my-day            (app)/tools
(app)/costs               (app)/org               (app)/vendors
(app)/customers           (app)/owner-documents   (app)/work-orders
(app)/dashboard           (app)/parts             (app)/workflow
(app)/documents           (app)/parts-inventory   (app)/workforce
(app)/economics           (app)/procedures        (app)/workspace
(app)/estimates           (app)/profile           (app)/inbox
(app)/expirations         (app)/purchase-orders   (app)/inspections
(app)/guided-tour         (app)/reminders         (app)/integrations
(app)/history             (app)/reports           (app)/invoices
(app)/library             (app)/library           (app)/locations
(app)/locations           (app)/logbook-entries
```

One-liner per non-trivial route:

| Route | Purpose |
| --- | --- |
| `/dashboard` | Persona-aware home; `(app)/dashboard/page.tsx` chooses the right inner component. Owner sees `owner-dashboard.tsx`. Shop sees `Dashboard.tsx`. |
| `/inbox` | Unified action-card stack (AI-classified messages + recommendations). |
| `/messages` | Unified inbox UI (email + SMS, threaded). |
| `/aircraft`, `/aircraft/[id]` | Fleet list + per-aircraft drilldown (logbook, AD compliance, due list, intelligence). |
| `/squawks` | Discrepancy intake + sign-off. |
| `/estimates` | Estimate list + composer. |
| `/work-orders`, `/work-orders/[id]` | Work orders. The detail page is the central UI for shop staff. |
| `/invoices` | Invoice list + composer; integrated with Stripe + deposits. |
| `/approvals` | Owner approval surface (estimates, scope changes). |
| `/logbook-entries` | Manual + signed logbook entries; opens scan composer. |
| `/documents` | Persona-scoped document library (lockbox vs. manuals). |
| `/economics`, `/economics/upload-cost`, `/economics/operating-cost` | Cost tracking + per-aircraft operating cost report. |
| `/reports` | Tabular reports + exports. |
| `/expirations/*` | Expiration tracking (tools, docs, licenses). |
| `/workforce/*` | Schedulers, time clock, timesheets, time off, team. |
| `/parts-inventory/*` | Inventory + vendors + POs + AI parts search. |
| `/scanner` | Camera-based logbook scanner. |
| `/integrations` | Per-org integration list (FSP, Flight Circle, QBO, Resend, etc.). |
| `/ask` | RAG-first AI ask page (full-screen). |
| `/ask-logbook-ai` | Owner-facing alias — same AI, narrower scope. |
| `/mechanic` | Mechanic cockpit dashboard (active WO + 12-month history). |
| `/admin/*` | Platform admin only. See §17. |
| `/settings`, `/settings/inbox`, `/settings/notifications`, `/settings/taxonomy` | Per-persona settings. |
| `/styleguide` | Dev-only Tailwind / shadcn reference. |
| `/marketplace` | Buyer/seller surface (parts marketplace). |
| `/onboarding`, `/owner/onboarding`, `/mechanic/onboarding` | Persona-specific first-run flows. |

`apps/web/app/(auth)/` holds `/login`, `/signin`, `/signup`, `/forgot-password`.

### 4.3 API

`apps/web/app/api/` — REST + RPC + webhooks + crons. Top-level subdirectories:

```
admin                     gdrive                    persona
aggregated                inbox                     procedures
ai                        inspections               profile
aircraft                  integrations              public
approval-requests         intelligence              purchase-orders
ask                       inventory-parts           query
auth                      investor                  rag
aviation                  invites                   reminders
billing                   invoices                  reports
bookmarks                 labor-rates               saved-views
bulk-updates              locations                 scanner
chat                      logbook-entries           serial-components
clock-events              maintenance               settings
compliance                marketplace               shift-covers
compliance-items          me                        shifts
contact                   mechanic-certificates     sop
continued-items           mechanics                 squawks
core-obligations          memberships               stripe
costs                     meter-profiles            support
cron                      meter-readings            taxonomy
customer-invitations      notifications             team
customers                 observability             threads
dashboard-layouts         ocr                       time-entries
document-expirations      og                        time-off-requests
documents                 onboarding                tool-checkouts
estimates                 org                       tools
faraim                    organization              trash
feedback                  organizations             tts
fleet                     owner                     ux
flight-events             parts                     vendors
gdrive                    parts-inventory           vision
                                                    voice
                                                    webhooks
                                                    work-orders
                                                    workforce
```

Highlights — one-liner per non-trivial endpoint:

- `/api/ask/route.ts` — RAG entry. `gpt-4o` with tool calling. See §8.
- `/api/query/route.ts` — Raw RAG retrieval (returns chunks + citations without an answer).
- `/api/cron/*` — 47 cron routes; see §11 + `apps/web/vercel.json`.
- `/api/webhooks/resend/inbound` — Inbound email (signed by `RESEND_WEBHOOK_SECRET`).
- `/api/webhooks/twilio/sms` — Inbound SMS (signed by `TWILIO_AUTH_TOKEN`).
- `/api/webhooks/stripe` — Stripe events (signed by `STRIPE_WEBHOOK_SECRET`).
- `/api/webhooks/qbo` — QBO webhook stub.
- `/api/owner/external-systems` — Envelope-encrypted credential storage for third-party logins (FSP, Flight Circle, etc.).
- `/api/work-orders/[id]/rts-check` — Synchronous pre-RTS sanity check (calls `workforce.return-to-service-checker`).
- `/api/work-orders/[id]/messages` + `/api/owner/work-orders/[id]/messages` — Per-WO chat (persona-split endpoints).
- `/api/admin/*` — Platform-admin only (guarded by `lib/auth/platform-admin.ts` whitelist).
- `/api/ai/*` — Streaming chat + completions (separate from `/api/ask`).
- `/api/billing/*` — Stripe checkout, portal, subscription mgmt.
- `/api/stripe/*` — Webhook handlers + product-list endpoints.

---

## 5. Auth + multi-tenancy

- **Identity** — Supabase Auth (`auth.users`). Email-link sign-in works today; OAuth Google is wired in but disabled in the Supabase dashboard pending OAuth-screen review.
- **Profiles** — `public.user_profiles` (1:1 with `auth.users`). Holds `display_name`, `handle`, `avatar_url`, `inbox_email`, `inbox_phone`, `persona`, and a `created_at` timestamp.
- **Orgs** — `public.organizations` (id, name, slug, plan_tier, operation_type, billing fields).
- **Memberships** — `public.organization_memberships` (`user_id`, `organization_id`, `role`, `persona`). One user can belong to many orgs. The `active_organization_slug` cookie picks the active one.
- **Roles** (see `apps/web/lib/roles.ts`): `owner` | `admin` | `manager` | `service_writer` | `mechanic` | `technician` | `apprentice` | `customer` | `platform_admin`. The `platform_admin` flag is also gated by an allowlist in `lib/auth/platform-admin.ts` (migration `114_platform_admin_whitelist.sql`).
- **Personas** vs roles — see `apps/web/lib/persona/config.ts`. Phase 18 (migration `119_merge_mechanic_into_shop.sql`) collapsed the `mechanic` persona into `shop`. The runtime persona enum is `owner | shop | admin`. Persona is read from `AppContext.persona` (client) or `lib/auth/context.ts` (server); never branch on raw role for UI.
- **Tenant URL routing** — `apps/web/lib/auth/tenant-routing.ts`. URLs can be `/{slug}/{path}` or `/{path}` with the slug carried in the `active_organization_slug` cookie. The function `extractTenantPathname(pathname)` rewrites a tenant URL into its non-tenant form; the middleware emits the rewrite and sets the cookie. `RESERVED_TOP_LEVEL_SEGMENTS` is the source of truth for "is this segment a slug or a route?". When adding a top-level route, add it both there *and* to `TENANT_SCOPED_ROUTE_PREFIXES`.
- **Middleware** — `apps/web/middleware.ts`. Order of operations:
  1. Run `extractTenantPathname()`; if matched, rewrite + set cookie.
  2. Build a Supabase server client over the cookies (uses `get/set/remove`, not the v0.4 `getAll/setAll` API).
  3. Public vanity profile paths (`/owner/{handle}`, `/mechanic/{handle}`) short-circuit out.
  4. Legacy `/communications` → `/messages` redirect (we renamed the route to bust a stuck CDN 404).
  5. App route gate: if `isAppRoute(path)` and no user, redirect to `/login?redirect=…`.
  6. Auth route gate: if user is signed in and they hit `/login` etc., redirect to `/dashboard`.
- **RLS** — every tenant-owned table has RLS policies. Master file is `supabase/migrations/011_rls.sql` (later migrations add per-feature policies). Most use the helper `get_my_org_ids()` to scope to the caller's org memberships. RLS-enabled-on-everything was finalised in `20260518130000_enable_rls_on_unprotected_tables.sql`.
- **Server-side client construction** — `apps/web/lib/supabase/server.ts` exposes:
  - `createServerSupabase()` — RLS-on Supabase client over the request cookies.
  - `createServiceSupabase()` — service-role client; bypasses RLS. Used only in webhooks, crons, and audited admin paths.
  - `apps/web/lib/supabase/request-user.ts` resolves the caller's user + org context.

---

## 6. Personas + UI shells

The active persona drives the sidebar nav, dashboard layout, and what `(app)/dashboard/page.tsx` renders. Source of truth is `apps/web/components/redesign/AppLayout.tsx`.

### 6.1 Owner (`OWNER_NAV`)

Standalone links + collapsible sections:

- Dashboard, Ask Logbook AI, Inbox (`/messages`).
- **AIRCRAFT** section (expanded by default): Aircraft, Due List, Squawks, Estimates, Work Orders, Invoices, Logbook Entry, Approvals, Intelligence.
- Documents (standalone — persona-scoped via `lib/documents/persona-scope`).
- **ECONOMICS** section (expanded by default): Economics, Upload Cost, Aircraft Operating Cost.
- **EXPIRATION** section (collapsed by default): Documents, Licenses & Aircraft Records.
- Reports.

### 6.2 Shop / mechanic (`SHOP_ADMIN_NAV`)

There is no separate mechanic portal anymore — the old 6-item mechanic nav was removed in the 2026-05-15 owner-nav sprint and mechanics get the full shop sidebar.

- Dashboard, Inbox (`/messages`).
- **AIRCRAFT** (expanded): Aircraft, Due List, Squawks, Estimates, Work Orders, Invoicing, Logbook Entry, Past Compliance.
- **PARTS & INVENTORY** (expanded): Parts & Inventory, AI Parts Search, Inventory, Vendors, Purchase Orders, RX Receipts, Returns, Analytics.
- Documents (standalone).
- **EXPIRATION** (collapsed): Tools, Documents & Licenses.
- **WORK FORCE** (collapsed): Dashboard, Scheduler, Time Clock, Timesheets, Time Off, Clock In/Out, Team, Reports.
- Marketplace, Reports.

### 6.3 Platform admin

`AppContext` only ever resolves `persona` to `owner | shop`, so `persona === "admin"` is a no-op at the nav level. Platform admins use the persona switcher to enter either side; the `/admin/*` routes have their own layout (`apps/web/app/(app)/admin/layout.tsx`) and an Admin Quick Links bar.

### 6.4 Mechanic cockpit

`/mechanic` (the route, not the persona) renders `apps/web/components/redesign/MechanicPortal.tsx`. It pulls real data via `DataStore` and shows the mechanic's Active WO + 12-month history. Pre-2026-05 this was a separate persona; today it lives under the shop persona shell and is reachable from the WORK FORCE section or the persona footer.

### 6.5 Customer / aircraft-owner-at-shop

External-facing vanity URLs `/owner/{handle}` and `/mechanic/{handle}` are public and routed past the auth gate (see `isPublicHandlePath` in `apps/web/middleware.ts`). Handles are auto-allocated on signup by `handle_new_user()` (migration `20260528030000_auto_allocate_inbox_on_signup.sql`) and can be customised from `/settings/profile`.

### 6.6 Persona switching

`PersonaSwitcher` (top-right of the `AppLayout` topbar — `apps/web/components/persona/PersonaSwitcher.tsx`) flips `AppContext.persona` and POSTs `/api/persona` to persist. The chosen persona drives:

- Sidebar (this section).
- Dashboard component selection (`(app)/dashboard/page.tsx`).
- Document scoping (`lib/documents/persona-scope`).
- AI system-prompt selection (`PERSONA_CONFIG[persona].systemPrompt`).
- Pricing / paywall surface (`lib/billing/gate.ts` — entitlements are per-persona).

---

## 7. Database (`supabase/migrations/`)

**173 migrations.** The first 120 are numbered `001_*` through `120_*` (pre-2026-05). Anything from `20260514131428_*` onward uses timestamp-prefixed names. The unified launcher + agent fleet, unified inbox, and compliance workflow tables are all in the 20260523–20260528 wave.

There is no Supabase migrations CLI in CI — Andy has been applying migrations directly through the Supabase SQL editor and committing the file. Use the `mcp__supabase__apply_migration` tool against the linked project, or paste into the SQL editor.

### 7.1 Identity + tenancy

- `auth.users` (Supabase managed).
- `public.user_profiles` — `id`, `auth_user_id`, `display_name`, `handle` (unique, lowercased), `avatar_url`, `inbox_email` (unique, lowercase index), `inbox_phone`, `persona`, `created_at`. Auto-allocated by the `handle_new_user()` trigger.
- `public.organizations` — `id`, `name`, `slug` (unique), `plan_tier`, `operation_type` (commercial / part91 / part135 / school / repair_station), Stripe customer fields, settings JSON.
- `public.organization_memberships` — `user_id`, `organization_id`, `role`, `persona`, status. UNIQUE(`user_id`,`organization_id`).
- `public.organization_invites` — invite tokens.
- `public.customers` — end-customers of a shop (an aircraft owner who is a customer of a shop). Has `portal_user_id` to link back to a `user_profiles` row once they sign up.

### 7.2 Aircraft + records

- `public.aircraft` — `tail_number`, `make`, `model`, `year`, `serial_number`, `total_time_hours`, `engine_time_hours`, `organization_id`, `owner_customer_id`, `is_archived`, `operation_profile` JSONB, `onboarding_status` JSONB, FAA-registry cache fields (post-`027`).
- `public.aircraft_pricing` — per-aircraft pricing for shops with surge / discount logic.
- `public.serial_components` — engine, propeller, avionics components with their own time-in-service and parent.
- `public.flight_events` — FSP / Airbly / scraper outputs. Confidence + source.
- `public.logbook_entries` — signed records. `entry_date`, `narrative`, `tach_in`/`tach_out`, `hobbs_in`/`hobbs_out`, `total_time_at_entry`, `signer_user_id`, `signature_payload` JSONB, `ad_reference`, `cited_documents`, `historical` flag.
- `public.logbook_entry_signatures` — e-sig audit (was added in the sprint 18.5 work — see commit `598b2498`).
- `public.squawks` — discrepancies; gets `corrective_action` set when a WO line resolves it.
- `public.compliance_items`, `public.continued_items` — AD / SB / inspection compliance.
- `public.inspections` — recurring inspection records.
- `public.due_items` — derived view of what's due now.

### 7.3 Work orders + financials

- `public.work_orders` — `customer_id`, `aircraft_id`, `status` (`draft` → `open` → `in_progress` → `signed_off` → `invoiced` → `closed`), `total_*` columns recomputed by triggers (`20260528040000_financial_totals_triggers.sql`).
- `public.work_order_lines` — `item_type` (`labor`, `part`, `outside_service`, `supply`, `tax`, `fee`, `discount`), `qty`, `unit_cost`, `unit_price`, `billable`, `owner_visible`, `inventory_part_id`, `tax_code`. Triggers keep totals honest.
- `public.work_order_checklists` — per-WO checklist items.
- `public.work_order_audit` — every state transition.
- `public.estimates`, `public.estimate_line_items` — `status` covers `draft → ready_to_send → sent → viewed → owner_question → awaiting_approval → awaiting_deposit → approved → deposit_paid → converted_to_work_order`. Approval + deposit state tracked separately (`approval_status`, `deposit_status`). Generated columns: `total_amount`. See migration `20260514165207_estimates_deposits_owner_approvals.sql`.
- `public.invoices` — `status` (`draft|sent|partial|paid|overdue|void|refunded`), `balance_due` (generated), totals from triggers. UNIQUE(`organization_id`, `estimate_id`) where estimate is set (mig `20260528050000`).
- `public.payments` — receipts; partial / full / refund / void.
- `public.deposits` — booking deposits on estimates.

### 7.4 Parts + inventory

- `public.inventory_parts` — `part_number`, `description`, `vendor_id`, `unit_cost`, `unit_price`, `bin`, `on_hand_qty`, `reorder_threshold`.
- `public.vendors`.
- `public.purchase_orders`, `public.purchase_order_lines`.
- `public.parts_receipts`, `public.parts_returns`.
- `public.tools_and_calibration` — tools, their calibration intervals, last-calibrated.

### 7.5 Documents + RAG

- `public.documents` — `name`, `mime_type`, `byte_size`, `checksum_sha256`, `organization_id`, `aircraft_id`, `customer_id`, `uploaded_by`, `document_type`, `is_archived`. RLS via `org_ids`.
- `public.document_chunks` — `document_id`, `chunk_index`, `text`, `page_number`, `embedding` (pgvector, 1536-dim, model `text-embedding-3-small`). pgvector HNSW index for ANN.
- `public.page_tree_nodes` — hierarchical OCR'd page tree (post-`20260516190000`).
- `public.intake_documents`, `public.extraction_results` — OCR pipeline staging.
- `public.document_review_requests`, `public.review_queue_rescore`.
- `public.ingestion_progress` — per-document pipeline state.
- `public.vision_*` — vision-embedding tables (chunked image search).
- `public.intelligence_cache` — pre-warmed report renders.
- `public.rag_*` (rag_index_jobs, rag_feedback, rag_query_log, rag_hyde_logging) — index + telemetry.

### 7.6 Inbox + comms

- `public.inbox_messages` — single feed for email + SMS (`source` `email|sms`, `direction` `inbound|outbound`, classified_as, related_*_id, attachments JSONB). Idempotent on (`provider_msg_id`, `source`). RLS scopes to caller's user_id OR `organization_id IN get_my_org_ids()`.
- `public.organization_inbox_config` — shop inbox email + signature + auto-classify flag.
- `public.external_system_credentials` — `system`, `login_email`, `password_encrypted` (bytea), `password_iv` (bytea). Envelope-encrypted with `EXTERNAL_CRED_KEK`.
- `public.portal_threads`, `public.portal_messages` — per-WO chat. `portal_threads.work_order_id` was added in `20260523000000_unified_launcher_agent_fleet.sql`.

### 7.7 Workforce

- `public.time_clock_entries`, `public.clock_events`.
- `public.shifts`, `public.shift_covers`.
- `public.time_off_requests`.
- `public.time_entries` (labor tied to a WO line).
- `public.mechanic_certificates` — A&P / IA expirations.
- `public.mechanic_invites`.

### 7.8 Agents + ops

- `public.agent_runs` — `agent_id`, `purpose`, `trigger`, `status` (`running|succeeded|failed|needs_human`), `triggered_by`, `target_kind`, `target_id`, `input`, `output`, `recommendation`, `provider`, `model`, `latency_ms`, `tokens_in`, `tokens_out`, `error_message`, `completed_at`. Acknowledgement fields added in `20260528000000_agent_runs_acknowledgement.sql` (`acknowledged_at`, `acknowledged_by`).
- `public.support_tickets` — extended in `20260523000000_unified_launcher_agent_fleet.sql` with `messages` (jsonb[]), `persona`, `cited_kb_ids` (uuid[]), `ai_confidence`.
- `public.support_kb_entry` — the support KB powering `support.first-responder`.
- `public.ask_logs` — every `/api/ask` call with question, answer, retrieved chunks, citations, model.
- `public.audit_event` — compliance audit log; sequence-checked by `compliance.audit-event-watchdog`.
- `public.dpa_signatures` — DPA signing records.
- `public.review_requests` — review-request timer outputs.
- `public.alert_events`, `public.worker_heartbeat`, `public.cost_snapshots`.
- `public.smart_approvals`, `public.audit_findings`.

### 7.9 Marketing / CMS

- `public.marketing_cms_content`, `public.contact_submissions`.

### 7.10 Triggers + generated columns

Notable:
- `public.handle_new_user()` (mig `20260528030000`) — auto-allocates `user_profiles` + `inbox_email` on every Supabase auth signup. SECURITY DEFINER.
- Financial-totals triggers (`20260528040000_financial_totals_triggers.sql`) — every insert/update/delete on `work_order_lines`, `estimate_line_items`, `payments` recomputes totals on the parent.
- Logbook auto-promote triggers (`20260518090000_logbook_auto_promote_trigger.sql`, `20260518110000_promote_trigger_feeds_both.sql`) — promotes approved OCR events into draft logbook entries.
- `public.page_tree_nodes` — date columns sanitised by the OCR-date-sanitiser cron + the at-rest migration `20260522000000_sanitize_page_tree_dates.sql`.

### 7.11 RLS helpers

- `get_my_org_ids()` — returns `uuid[]` of orgs the caller belongs to.
- `is_platform_admin()` — checks the allowlist in `114_platform_admin_whitelist.sql`.
- `auth.uid()` — Supabase standard.

---

## 8. RAG / Ask Aircraft

**Entrypoint:** `apps/web/app/api/ask/route.ts`. Method: `POST`. Body: `{ question, aircraft_id?, persona?, conversation_history? }`.

Pipeline:

1. **Rate limit** — `rateLimit(getClientIp(req), 'ask')` (`apps/web/lib/rate-limit.ts`).
2. **Resolve org context** — `resolveRequestOrgContext()` (`apps/web/lib/auth/context.ts`).
3. **Classify** — `classifyAskQuestion()` (`apps/web/lib/ask/question-classifier.ts`). Tags the question as factual / aggregation / how-to / etc.
4. **Fleet aggregation short-circuit** — `tryFleetAggregation()` (`apps/web/lib/ask/fleet-aggregation.ts`). For chronological extremum (latest annual, oldest entry), counts, and sums, returns a deterministic SQL-only answer with no LLM call. See migration `20260518060000_wave2_contextual_retrieval.sql` and the recent fix in commit `8f6fff93`.
5. **Query rewrite** — `rewriteQuery()` in `lib/agents/impl/rag-query-rewriter.ts` (alias expansion: AD→airworthiness directive, 100hr→100-hour inspection, etc., plus optional gpt-4o-mini paraphrase).
6. **Retrieval** — `lib/rag/retrieval.ts` + `lib/rag/bm25-index.ts` + `lib/rag/contextual.ts`. Hybrid vector + BM25 over `document_chunks`. ANN by pgvector HNSW.
7. **Rerank** — `lib/rag/rerank.ts` calls Cohere `rerank-v3.5` when `COHERE_API_KEY` is set; LRU-cached. Warmer cron at `*/6h` (`rag.rerank-cache-warmer`).
8. **Context compress** — `compressContextSentences()` (`lib/agents/impl/rag-context-compressor.ts`). Heuristic sentence-level trim.
9. **Prompt assembly + answer** — `gpt-4o` with tool calling. Tools (`apps/web/lib/ai/tools.ts`): `search_documents`, `search_logbook`, `search_parts`, `draft_logbook_entry`, `generate_checklist`.
10. **Citation validator** — drops any chunkId the LLM cites that wasn't in the retrieved set.
11. **Cross-tenant audit (1% sampled)** — `auditRagRetrieval()` in `lib/agents/impl/safety-cross-tenant-leak-watchdog.ts`. Compares `organization_id` of every retrieved chunk vs. the caller's org. Any mismatch is a critical agent_run with `needsHuman=true`.
12. **Answer grade (1% sampled)** — `gradeAnswer()` in `lib/agents/impl/rag-answer-grader.ts`. Fire-and-forget; numbers-without-citations are auto-graded 1.
13. **Follow-ups** — `ux-help.suggested-followups` proposes 2-3 next questions.
14. **Log** — `ask_logs` row + answer history into `conversation_history`.

Source-file inventory (`apps/web/lib/rag/`):

| File | Purpose |
| --- | --- |
| `aggregation.ts` | SQL aggregators (count / sum / extremum) over logbook + documents. |
| `bm25-index.ts` | In-process BM25 over chunk text. |
| `citation-anchors.ts` | Build per-chunk page-anchor links for the source preview. |
| `contextual.ts` | Build the contextual representation (chunk + surrounding window). |
| `feedback.ts` | Read/write the `rag_feedback` table from the UI thumbs widget. |
| `generation.ts` | Final prompt → answer call. |
| `hyde.ts` | HYDE (hypothetical answer) rewrite path. |
| `intelligence-query.ts` | Pre-warmed intelligence-cache lookups. |
| `page-tree.ts` | Walk `page_tree_nodes` for hierarchical context. |
| `query-parser.ts` | Lexical parser (entities, dates, tail numbers). |
| `query-router.ts` | Decides factual vs. how-to vs. aggregation path. |
| `rerank.ts` | Cohere rerank. |
| `retrieval.ts` | Hybrid vector + BM25 + page-tree fanout. |
| `router-classifier.ts` | LLM-shadowed router (post-`20260519000000_rag_query_log_router_shadow.sql`). |
| `structured-events.ts` | Convert hits into structured event timeline. |
| `tree-builder.ts` | Rebuilds the page tree (admin tool). |

Docs live in `/Users/andy/1. do not touch/myaircraft/docs/myaircraft-rag-system-overview.md`, `/Users/andy/1. do not touch/myaircraft/docs/ask-query-flow.md`, and `myaircraft_advanced_rag_implementation_guide.md` at the repo root.

---

## 9. Agent fleet

Manifest: `apps/web/lib/agents/registry.ts`. Runner wrapper: `apps/web/lib/agents/runner.ts`. Implementations: `apps/web/lib/agents/impl/*.ts` (50 files). Browser-scraper sub-system: `apps/web/lib/agents/scrapers/*` (see §10).

### 9.1 Registry shape

`AGENTS` is a flat array of `AgentDefinition`. Required fields: `id`, `label`, `purpose`, `category`, `trigger`, `status`, `recommended_provider`, `recommended_model`, `writes`. Optional: `cron_schedule`, `reference`. Triggers: `api_request` | `cron` | `chained` | `human_button` | `event_trigger`. Status: `active` | `proposed` | `paused` | `deprecated`.

To add an agent: append to `AGENTS`, create the impl file in `lib/agents/impl/`, wire its cron route in `apps/web/app/api/cron/<id>/route.ts`, and register the cron in `apps/web/vercel.json`.

### 9.2 Runner

`runAgent(agentId, ctx, fn)`:

1. Insert `agent_runs` row with `status='running'`.
2. Call `fn(logger)`. Logger captures tokens + model.
3. Update row: `succeeded` / `needs_human` / `failed` with latency_ms, tokens, output, recommendation, error_message.
4. Catches and returns `{ ok: false, error }` — agents never re-throw, ensuring best-effort across the platform.

### 9.3 The fleet (grouped by namespace)

All entries are `status: 'active'` unless noted.

**inbox.*** — chained off `/api/webhooks/resend/inbound` and `/api/webhooks/twilio/sms`.

- `inbox.classifier` — `gpt-4o-mini`. Tags every inbound message receipt / estimate / invoice / reminder / adhoc / spam / other. Writes `classified_as`.
- `inbox.expense-extractor` — `gpt-4o`. Drafts `cost_entries` row for receipts.
- `inbox.estimate-parser` — `gpt-4o`. Drafts `estimates` row for incoming estimates.
- `inbox.invoice-importer` — `gpt-4o`. Drafts `invoices` row for incoming invoices.

**support.*** — first responder + KB curator.

- `support.first-responder` — `gpt-4o`. Drafts answers from `support_kb_entry` + SOPs. Escalates if low confidence.
- `support.kb-curator` — `gpt-4o-mini`, cron `0 4 * * *`. Pattern-mines resolved tickets, drafts KB entries.
- `support.triage` — `gpt-4o-mini`. Categorises new tickets (billing / how-to / bug / feature-request / outage / other) and severity. Chains into `ux-help.bug-triage` on `category=bug`.

**data-sync.*** — browser-automation orchestrator.

- `data-sync.tach-time-scraper` — http-only, cron `0 6 * * *`. Decrypts each `external_system_credentials` row, runs the right vendor scraper (`lib/agents/scrapers/`), emits per-aircraft tach deltas + proposed new aircraft. Service-side decrypt; passwords never logged.

**data-quality.*** — SQL- and regex-only janitors.

- `data-quality.ocr-date-sanitiser` — cron `0 3 * * *`. Nulls impossible dates in `page_tree_nodes`.
- `data-quality.aircraft-year-backfiller` — cron `0 5 * * 0`. Proposes `aircraft.year` from serial-number prefix or earliest logbook date. FAA-registry promotion follow-on.
- `data-quality.tail-number-validator` — cron `0 5 * * 1`. Regex sweep over `aircraft.tail_number` against FAA N-number format. FAA-registry cross-check.
- `data-quality.duplicate-doc-detector` — cron `30 4 * * *`. Groups documents by `(organization_id, checksum_sha256)`; emits cluster recommendations.
- `data-quality.ad-reference-extractor` — cron `30 5 * * *`. Regex-extracts AD/SB/SL refs from logbook narratives where structured column is null.
- `data-quality.orphaned-records-detector` — cron `0 4 * * *`. Hunts FK references pointing at deleted rows across hot tables.

**compliance.*** — audit + evidence.

- `compliance.audit-event-watchdog` — cron `0 * * * *`. Sequence-gap detector on `audit_event`.
- `compliance.soc2-evidence-collector` — cron `0 0 1 */3 *`. Quarterly SOC2 packet.
- `compliance.iso-evidence-collector` — cron `30 0 1 */3 *`. ISO 27001 Annex-A mapping.
- `compliance.gdpr-export-fulfilment` — human-triggered. Strict self-only per-user export packet.
- `compliance.dpa-anniversary-reviewer` — cron `0 9 * * *`. Tracks signed DPAs + 12-month re-review.

**ops.*** — cron + alert plumbing.

- `ops.cron-health` — cron `*/30 * * * *`. Verifies every cron agent succeeded within trailing 24h.
- `ops.error-rate-sentinel` — cron `0 * * * *`. Tails failed agent_runs + alert_events.
- `ops.daily-digest` — cron `0 7 * * *`. 5-8 line founder-facing summary; sorts critical safety/security first.
- `ops.deployment-canary` — cron `*/5 * * * *`. HTTP-probes `/api/health` + `/api/ping` against `PUBLIC_APP_ORIGIN`.
- `ops.cost-anomaly-detector` — cron `0 9 * * *`. Token-burn anomaly per-org.
- `ops.stripe-failed-charge-watcher` — cron `30 * * * *`. Stripe charges status=failed in trailing 26h.

**ux-help.*** — error + empty-state coaching.

- `ux-help.suggested-followups` — `gpt-4o-mini`, inline in `/api/ask` responses.
- `ux-help.empty-state-coach` — `gpt-4o-mini` with heuristic fallback. POST `/api/ux/empty-state`.
- `ux-help.error-explainer` — `gpt-4o-mini` with heuristic fast-path. POST `/api/ux/explain-error`.
- `ux-help.bug-triage` — `gpt-4o-mini`. Chained off `support.triage` for `category=bug`.

**sales.*** — growth.

- `sales.lead-prep` — event-triggered on signup. SQL-only.
- `sales.churn-risk-predictor` — cron `30 6 * * *`. Daily-risk score 0-100.
- `sales.trial-conversion-coach` — cron `0 10 * * *`. Last-5-day trial coach.
- `sales.review-request-timer` — cron `0 11 * * *`. Identifies orgs ready to ask for a review.

**rag.*** — retrieval helpers.

- `rag.fleet-aggregator` — inline SQL short-circuit.
- `rag.rerank-cache-warmer` — cron `0 */6 * * *`. Warms Cohere LRU cache.
- `rag.citation-validator` — inline. Drops invented chunkIds.
- `rag.query-rewriter` — chained. Alias expansion + optional `gpt-4o-mini` paraphrase.
- `rag.context-compressor` — chained heuristic; 40-60% token reduction typical.
- `rag.answer-grader` — chained, 1% sampled. `gpt-4o-mini` with heuristic fast-path; grades <3 emit recommendations.

**workforce.*** — staff + RTS.

- `workforce.cert-expiry-alerter` — cron `0 8 * * *`. 60/30/7-day windows.
- `workforce.clock-anomaly` — cron `0 6 * * *`. Shifts too long, open shifts, overlapping shifts, zero-hour shifts.
- `workforce.shift-summary-drafter` — cron `0 17 * * *`. Daily 3-bullet shift summary per mechanic.
- `workforce.workload-balancer` — cron `0 8 * * *`. Per-shop imbalance detection.
- `workforce.return-to-service-checker` — human-triggered, synchronous. Called by the WO sign UI.

**support.*** (extension) — see above.

**security.*** — auth security.

- `security.failed-login-anomaly` — cron `*/10 * * * *`. Reads `auth.audit_log_entries`; `failed_login_burst` = 10+ failures from 3+ distinct IPs.

**knowledge.*** — SOP + FAA.

- `knowledge.sop-coverage-gap-detector` — cron `0 6 * * 1`. Most-asked launcher questions vs. SOP coverage.
- `knowledge.faa-airworthiness-context` — human-triggered. Per-aircraft AD/SB/SL roll-up.

**content.*** — growth content.

- `content.seo-suggester` — cron `0 2 * * 1`. Heuristic; recommends blog headlines + signal type.

**finance.*** — billing janitor.

- `finance.billing-lifecycle` — cron `0 3 * * *`. Expires past-due estimates, marks overdue invoices, auto-pays $0 balance.

**safety.*** — RAG + PII + injection.

- `safety.pii-leak-scanner` — cron `15 * * * *`. SSN / CC / passport / account-number regex sweep.
- `safety.faa-bulletin-watcher` — cron `0 6 * * 0`. Per-aircraft FAA registry pull; 30 lookups per run with 12h cache.
- `safety.prompt-injection-guard` — chained pre-LLM regex score (safe / suspicious / blocked).
- `safety.cross-tenant-leak-watchdog` — chained off `/api/ask` (1% sampled) + admin replay endpoint.

### 9.4 Admin surface

`/admin/agents` (`apps/web/app/(app)/admin/agents/page.tsx`) — agent run console, filter by status / category / needs_human. Topbar approval chip surfaces unacknowledged `recommendation` rows organisation-wide.

---

## 10. Integrations

### 10.1 External-system credentials (Phase 3 scrapers)

- **Storage**: `public.external_system_credentials` (mig `20260526000000`).
- **Crypto**: `apps/web/lib/security/envelope-crypt.ts`. AES-256-GCM. KEK from env `EXTERNAL_CRED_KEK` (must be 32 raw bytes; we accept hex / base64 / base64url). Generate with `node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))'` then paste into Vercel env.
- **API**: `POST /api/owner/external-systems` saves, `GET` lists, `DELETE` revokes.
- **UI**: `/settings/inbox` — "Third-party system credentials" card.

### 10.2 Vendor scrapers

`apps/web/lib/agents/scrapers/`:

| File | Vendor | Status |
| --- | --- | --- |
| `flight-schedule-pro.ts` | Flight Schedule Pro | Live behind `FSP_SCRAPER_MODE=live`. Otherwise returns `{ ok:false, note:'stub' }`. Selectors are hand-mapped against FSP UI as of 2026-05. |
| `index.ts` | Registry | `getScraper(system)` returns the right impl. |
| `types.ts` | `VendorScraper` + `ScrapeResult` interfaces. | |
| `flight_circle` (TODO) | Flight Circle | Not yet implemented — the orchestrator already calls it; will return `null` until the file is added. |
| `shop_monkey` (TODO) | Shop Monkey | Same. |
| `mechanics_helper` (TODO) | Mechanics Helper | Same. |

### 10.3 Orchestrator

`apps/web/lib/agents/impl/data-sync-tach-time-scraper.ts` — walks every `external_system_credentials` row, decrypts in-memory, calls the right scraper, emits per-aircraft recommendation rows via `agent_runs`. Driven by:

- Cron: `apps/web/app/api/cron/tach-time-sync/route.ts` daily at `0 6 * * *`.
- Admin UI: `/admin/tach-review` (`apps/web/app/(app)/admin/tach-review/page.tsx`) is the founder-facing approval surface.

### 10.4 Sandbox runtime

`@vercel/sandbox ^2.0.0` + `playwright-core ^1.60.0` + `@sparticuz/chromium ^148`. Loaded dynamically (`require()`) at runtime to keep them out of the cold-start bundle. Pinned externals in `apps/web/next.config.mjs` (both `experimental.serverComponentsExternalPackages` and the webpack `externals` callback). Without this, the Next 14 SWC parser chokes on the private-class-fields in `undici@7` (transitively pulled).

### 10.5 Other live integrations

- **Resend** — outbound transactional email + inbound webhook. SDK is HTTP-only (no SDK package). Envs: `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `RESEND_FROM_DEFAULT`, `RESEND_REPLY_TO_DEFAULT`, `RESEND_TEST_INBOX`.
- **Twilio** — SMS in/out. Account: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_DEFAULT`. Per-user numbers are admin-provisioned (see task #100).
- **Stripe** — subs + checkout + portal. Envs: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_OWNER_MONTHLY`, `STRIPE_PRICE_MECHANIC_MONTHLY`, `STRIPE_PRICE_BUNDLE_MONTHLY`, `STRIPE_PRICE_PER_AIRCRAFT`, `STRIPE_PRODUCT_PREBUY`, `STRIPE_PRODUCT_LENDER`, `STRIPE_PRODUCT_INSURER`.
- **QBO** — `apps/web/app/api/webhooks/qbo/route.ts`. OAuth via `lib/integrations/qbo/*`. Envs: `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, `QBO_ENV`, `QBO_USE_MOCK`, `QBO_WEBHOOK_VERIFIER`.
- **Sentry** — Errors. `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_DSN`, `SENTRY_TRACES_SAMPLE_RATE`.
- **PostHog** — Analytics. `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`.
- **Airbly** — `apps/web/app/api/cron/airbly-sync/route.ts`. `AIRBLY_API_KEY`, `AIRBLY_API_BASE`, `AIRBLY_USE_MOCK`.
- **FAA Registry** — `apps/web/lib/faa/*`. Public HTTP. `FAA_REGISTRY_FRESHNESS_HOURS` controls cache age.
- **FlightAware / ADS-B Exchange** — live tracking. `FLIGHTAWARE_API_KEY`, `ADSBEXCHANGE_API_KEY`, `RAPIDAPI_ADSB_EXCHANGE_KEY`.
- **FARAIM** — aviation rule lookup. `FARAIM_API_BASE`, `FARAIM_API_KEY`, `FARAIM_SANDBOX_KEY`, `FARAIM_ENV`. (See `docs/faraim-integration.md`.)
- **eBay** — marketplace integration (parts). `EBAY_APP_ID`, `EBAY_CERT_ID`, `EBAY_ENV`.
- **ElevenLabs** — voice TTS. `ELEVENLABS_API_KEY`, `ELEVENLABS_DEFAULT_VOICE_ID`.
- **Modal** — Python OCR worker. `MODAL_ENDPOINT_URL`, `MODAL_QUERY_ENDPOINT_URL`, `MODAL_API_KEY`, `MODAL_TIMEOUT_MS`.
- **Google Drive** — `apps/web/app/api/gdrive/*`. `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`.
- **Replicate / RunPod** — fallback vision GPUs. `REPLICATE_API_TOKEN`, `RUNPOD_API_KEY`.

---

## 11. Crons (`apps/web/vercel.json`)

The Vercel cron schedule lives in `apps/web/vercel.json`. (The repo-root `vercel.json` only carries the invoice-reminder cron and the workspace install/build shim.) Forty-seven cron endpoints, listed by route:

| Path | Schedule | Notes |
| --- | --- | --- |
| `/api/cron/heal-ingestions` | `*/5 * * * *` | Reaper for stalled OCR runs. |
| `/api/integrations/adsb/sync` | `*/5 * * * *` | ADS-B Exchange flight events. |
| `/api/cron/wo-audit` | `*/15 * * * *` | Work-order audit sweep. |
| `/api/cron/maintenance-predictions` | `0 7 * * *` | Predictive maintenance scores. |
| `/api/cron/trash-purge` | `0 8 * * *` | Soft-delete reaper (`091_soft_delete_trash`). |
| `/api/cron/airbly-sync` | `*/10 * * * *` | Airbly device pull. |
| `/api/cron/fsp-sync` | `*/10 * * * *` | Flight Schedule Pro reservations. Mock-token TODO — real adapter pulls tokens from a future `fsp_sync_state` table. |
| `/api/cron/telemetry-inference` | `*/15 * * * *` | ADS-B → flight-event inference. |
| `/api/cron/extract-receipts-sweep` | `*/10 * * * *` | OCR receipt pipeline. |
| `/api/cron/vision-dispatch-sweep` | `*/10 * * * *` | Vision job dispatcher. |
| `/api/cron/vision-fallback-sweep` | `*/5 * * * *` | GPU-fallback dispatcher. |
| `/api/cron/vision-batch-trigger` | `0 2 * * *` | Nightly batch vision. |
| `/api/cron/support-triage` | `* * * * *` | Every minute. Fires support.triage on new tickets. |
| `/api/cron/health-alerts` | `*/5 * * * *` | Health-alert flush. |
| `/api/cron/churn-signals` | `30 7 * * *` | Churn signal aggregator. |
| `/api/cron/email-queue-worker` | `* * * * *` | Outbound email queue drainer. |
| `/api/invoices/reminders/send` | `0 14 * * *` | Daily 14:00 UTC invoice reminders. |
| `/api/cron/support-kb-curator` | `0 4 * * *` | support.kb-curator agent. |
| `/api/cron/ocr-date-sanitiser` | `0 3 * * *` | data-quality.ocr-date-sanitiser. |
| `/api/cron/tach-time-sync` | `0 6 * * *` | data-sync.tach-time-scraper. |
| `/api/cron/cron-health` | `*/30 * * * *` | ops.cron-health. |
| `/api/cron/cert-expiry` | `0 8 * * *` | workforce.cert-expiry-alerter. |
| `/api/cron/churn-risk` | `30 6 * * *` | sales.churn-risk-predictor. |
| `/api/cron/failed-login-anomaly` | `*/10 * * * *` | security.failed-login-anomaly. |
| `/api/cron/cost-anomaly` | `0 9 * * *` | ops.cost-anomaly-detector. |
| `/api/cron/duplicate-docs` | `30 4 * * *` | data-quality.duplicate-doc-detector. |
| `/api/cron/sop-coverage-gap` | `0 6 * * 1` | knowledge.sop-coverage-gap-detector. |
| `/api/cron/tail-number-validator` | `0 5 * * 1` | data-quality.tail-number-validator. |
| `/api/cron/shift-summary` | `0 17 * * *` | workforce.shift-summary-drafter. |
| `/api/cron/pii-leak-scanner` | `15 * * * *` | safety.pii-leak-scanner. |
| `/api/cron/stripe-failed-charges` | `30 * * * *` | ops.stripe-failed-charge-watcher. |
| `/api/cron/trial-conversion-coach` | `0 10 * * *` | sales.trial-conversion-coach. |
| `/api/cron/ad-reference-extractor` | `30 5 * * *` | data-quality.ad-reference-extractor. |
| `/api/cron/deployment-canary` | `*/5 * * * *` | ops.deployment-canary. |
| `/api/cron/clock-anomaly` | `0 6 * * *` | workforce.clock-anomaly. |
| `/api/cron/audit-event-watchdog` | `0 * * * *` | compliance.audit-event-watchdog. |
| `/api/cron/aircraft-year-backfill` | `0 5 * * 0` | data-quality.aircraft-year-backfiller. |
| `/api/cron/review-request-timer` | `0 11 * * *` | sales.review-request-timer. |
| `/api/cron/dpa-anniversary` | `0 9 * * *` | compliance.dpa-anniversary-reviewer. |
| `/api/cron/rerank-cache-warmer` | `0 */6 * * *` | rag.rerank-cache-warmer. |
| `/api/cron/error-rate-sentinel` | `0 * * * *` | ops.error-rate-sentinel. |
| `/api/cron/soc2-evidence` | `0 0 1 */3 *` | compliance.soc2-evidence-collector. |
| `/api/cron/iso-evidence` | `30 0 1 */3 *` | compliance.iso-evidence-collector. |
| `/api/cron/daily-digest` | `0 7 * * *` | ops.daily-digest. |
| `/api/cron/faa-bulletin-watcher` | `0 6 * * 0` | safety.faa-bulletin-watcher. |
| `/api/cron/orphaned-records` | `0 4 * * *` | data-quality.orphaned-records-detector. |
| `/api/cron/workload-balancer` | `0 8 * * *` | workforce.workload-balancer. |
| `/api/cron/billing-lifecycle` | `0 3 * * *` | finance.billing-lifecycle. |
| `/api/cron/seo-suggester` | `0 2 * * 1` | content.seo-suggester. |

**Cron auth**: every cron route checks `lib/cron/auth.ts`'s `isCronAuthorized(req)`, which compares a Bearer token against `CRON_SECRET`. Vercel-fired requests include `Authorization: Bearer $CRON_SECRET` automatically.

---

## 12. Inbox / per-user @myaircraft.us email

The unified inbox is the single comms hub. Email + SMS land in `public.inbox_messages` with a `source` column. AI classifies → routes to the right extractor → human approves.

### 12.1 Identity allocation

- Trigger: `handle_new_user()` (mig `20260528030000`). SECURITY DEFINER under `supabase_auth_admin`. On every new `auth.users` row, it derives a handle from `full_name` or email-local-part, dedupes by appending a numeric suffix, then sets `user_profiles.inbox_email = handle || '@myaircraft.us'`.
- Customisation: `/settings/profile` (handle + display name + avatar). `/settings/inbox` (inbox email card, Twilio number, third-party creds).
- Twilio numbers are admin-provisioned via `/admin/inbox-identity`.

### 12.2 Inbound email — Resend

- DNS: `myaircraft.us` MX pointed at Resend. Catch-all `*@myaircraft.us` routes to a webhook.
- Webhook: `POST /api/webhooks/resend/inbound`. HMAC-SHA256 sig verify against `RESEND_WEBHOOK_SECRET`.
- Parse: `apps/web/lib/inbox/parse-resend.ts`.
- Resolve recipient by lowercased local-part vs `user_profiles.inbox_email`.
- Insert `inbox_messages` row (`source='email'`, `direction='inbound'`). Idempotent on `(provider_msg_id, source)`.
- Fire `inbox.classifier` agent asynchronously. If classified `receipt` → `inbox.expense-extractor`. If `estimate` → `inbox.estimate-parser`. If `invoice` → `inbox.invoice-importer`.

### 12.3 Inbound SMS — Twilio

- Webhook: `POST /api/webhooks/twilio/sms`. HMAC-SHA1 sig verify against `TWILIO_AUTH_TOKEN` over the URL + sorted form params.
- Same flow as email; `source='sms'`. Media attachments are stored as URLs in `attachments` JSONB.

### 12.4 Outbound

- Email: server-side Resend HTTP API. Threads via `In-Reply-To` / `References` headers (we use the `provider_thread_id`).
- SMS: Twilio REST API. From the `to` end of the user's allocated number.

### 12.5 UI

- `/inbox` (`apps/web/app/(app)/inbox/page.tsx`) — AI action-cards stack. Each card has Approve / Edit / Dismiss buttons.
- `/messages` (`apps/web/app/(app)/messages/`) — threaded unified inbox UI.
- Launcher's "Inbox" tab (`apps/web/components/launcher/`) — opens an action-cards drawer.

### 12.6 Why the rename

`/communications` was the original route. A failed wave-15..18 deploy streak cached a 404 at the apex CDN that wouldn't bust. We renamed the directory to `/messages`; `middleware.ts` 301-redirects `/communications/*` → `/messages/*` for old bookmarks.

---

## 13. Billing

### 13.1 SKUs

`apps/web/lib/billing/products.ts` is the source of truth. Three SKUs:

| SKU | Grants | Default price |
| --- | --- | --- |
| `owner` | `owner` persona | $49/mo |
| `mechanic` | `shop` persona (the SKU is named "mechanic" for back-compat — phase-18 mig `119` collapsed mechanic-persona into shop, but the Stripe Product ID is preserved) | (see env) |
| `bundle` | `owner` + `shop` | (see env) |

Price IDs come from env (`STRIPE_PRICE_OWNER_MONTHLY`, `STRIPE_PRICE_MECHANIC_MONTHLY`, `STRIPE_PRICE_BUNDLE_MONTHLY`).

### 13.2 Per-persona entitlements

`public.per_persona_entitlements` (mig `058_per_persona_entitlements`):

- `(organization_id, persona)` UNIQUE.
- `status` ∈ `trial | active | paywalled | cancelled | past_due | none`.
- `trial_ends_at`, `paywalled_reason`, `stripe_subscription_id`, `bundle` (boolean).

`apps/web/lib/billing/gate.ts` resolves entitlements + caches them. `BillingStatus` returns `owner` + `shop` per-persona records plus convenience booleans (`hasAnyAccess`, `hasBundleEquivalent`).

### 13.3 Trials

Per-persona 30-day trial. Started fresh on first signup. `apps/web/lib/billing/trial.ts` computes `trialDaysRemaining`.

### 13.4 Stripe webhook

`apps/web/app/api/webhooks/stripe/route.ts` handles `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`. Deduped via `apps/web/lib/billing/stripe-webhook-dedup.ts` against `stripe_webhook_events` table (mig `117_stripe_webhook_events`). Mirror table is `stripe_billing_mirror` (mig `096`).

### 13.5 Paywalls

`gate.ts` exposes `enforceAccess({ persona, scope })`. Pages / API routes can call it to redirect/return 402 when the persona is paywalled.

---

## 14. Documents

### 14.1 Storage

- Bucket: `documents` (Supabase Storage, **private**).
- Avatars: bucket `avatars` (public, mig `052_avatars_bucket_and_policies`).
- All reads go through signed URLs. The bucket itself is private — never expose a raw storage URL to the client.
- Helpers in `apps/web/lib/ingestion/server.ts` (`createSignedUrl(path)`) and `apps/web/lib/intelligence/generateReport.ts`. Vision pipeline has its own at `apps/web/lib/vision/storage.ts`.

### 14.2 Pipeline

`apps/web/lib/ingestion/`:

| File | Stage |
| --- | --- |
| `server.ts` | Orchestrator: upload → enqueue → OCR → chunk → embed → tag. |
| `background-policy.ts` | Decides which docs run inline vs. background. |
| `native-pdf.ts` | Native-PDF text extraction (no OCR needed). |
| `failure-classifier.ts` | Categorises pipeline failures. |
| `trigger-env.ts` | Trigger.dev env helpers (legacy). |
| `vision-retranscribe.ts` | GPU retranscribe path. |

Upload entrypoints: `POST /api/upload`, `POST /api/documents`, `POST /api/scanner`. Tus resumable upload at `POST /api/documents/upload-tus`.

### 14.3 OCR

Three OCR providers, picked per-doc:

- **AWS Textract** (`@aws-sdk/client-textract`). Gated by `ENABLE_TEXTRACT_OCR`.
- **Local OCR script** (`LOCAL_OCR_SCRIPT_PATH`).
- **Modal Python worker** (`MODAL_*` envs).
- **Vision LLMs** (`OPENAI_OCR_MODEL` — `gpt-4o`-vision fallback).

Chunking: ~1k-token chunks with 200-token overlap. Embeddings via `text-embedding-3-small` (1536-dim) into `document_chunks.embedding`.

### 14.4 Persona scoping

`apps/web/lib/documents/persona-scope.ts`. The `/documents` page is shared between personas; owner sees the full lockbox + manuals, shop sees mechanic-reference docs only. Migration `20260517110000_documents_shop_upload_lockdown.sql` enforces who can upload what.

### 14.5 Preview

`/api/documents/[id]/preview` — same-origin PDF iframe. The CSP frame-src is set to `'self'` so the Source Preview can embed it (see `apps/web/next.config.mjs` CSP).

---

## 15. Work order lifecycle

State graph:

```
Squawk
  → Estimate (draft → ready_to_send → sent → viewed → approved)
    → Work Order (draft → open → in_progress)
       → Lines (labor / parts / outside / supplies)
          → Signoff (logbook entry + e-sig)
            → Invoice (draft → sent → partial → paid)
              → Payment
```

Each transition is guard-railed. Source files:

- `apps/web/lib/work-orders/status.ts` — state machine + valid transitions.
- `apps/web/lib/work-orders/checklists.ts` — per-WO checklist enforcement.
- `apps/web/app/api/work-orders/[id]/` — REST endpoints for each transition.

### 15.1 RTS preflight

Before a logbook entry can be signed, the WO detail UI calls `GET /api/work-orders/[id]/rts-check`. It runs `workforce.return-to-service-checker` (`apps/web/lib/agents/impl/workforce-return-to-service-checker.ts`) which returns `{ ok, blockers, warnings }`.

**Blockers** disable the sign button:

- Open squawks must have `corrective_action`.
- AD-compliance lines must reference an AD number (`ad_reference` on the line).
- Parts lines must have a `part_number`.
- Required checklist items must be complete.

**Warnings** show with an override toggle (override is audit-logged via the normal `agent_runs` trail).

### 15.2 Sign endpoint

`POST /api/logbook-entries/[id]/sign` — captures the e-sig payload, writes to `logbook_entry_signatures`, sets `logbook_entries.signed_at` and `signer_user_id`, fires the auto-promote trigger (mig `20260518090000`). Recent fix: commit `598b2498`.

---

## 16. Settings (per-persona-aware)

`apps/web/app/(app)/settings/`:

| Route | File | Purpose |
| --- | --- | --- |
| `/settings` | `page.tsx` + `settings-client.tsx` | Profile (display name, handle, avatar). Persona switch is here for owners; shop staff get it in the topbar. |
| `/settings/inbox` | `inbox/page.tsx` | Inbox identity card (your @myaircraft.us address — shareable + copy-to-clipboard), Twilio number, third-party-system credentials (FSP, Flight Circle, Shop Monkey, Mechanics Helper login + password, envelope-encrypted in transit). |
| `/settings/notifications` | `notifications/page.tsx` | Email/SMS notification preferences. |
| `/settings/taxonomy` | `taxonomy/page.tsx` | Labels / categories for the shop's internal classification of work + parts. |

---

## 17. Admin (founder)

`apps/web/app/(app)/admin/`:

| Route | Purpose |
| --- | --- |
| `/admin` (`page.tsx`) | Index with quick-links to every admin surface. |
| `/admin/tenants` | Every org. Per-org overview. |
| `/admin/agents` | Agent-run monitoring; filter by status / category / needs_human. |
| `/admin/command-center` | Real-time ops dashboard. |
| `/admin/compliance` | SOC2 / ISO 27001 evidence rollup. |
| `/admin/health` | System health (DB, queues). |
| `/admin/ingestion-health` | Per-org ingestion pipeline state. |
| `/admin/ingestion` | Document ingestion debug. |
| `/admin/observability` | Sentry / PostHog cross-links + agent_runs analytics. |
| `/admin/tach-review` | Tach-time scraper recommendations approval surface. |
| `/admin/sop` | SOP library editor. |
| `/admin/content` | Marketing CMS (blog edit, opengraph etc.). |
| `/admin/customer-signals` | Common Room-style signal feed. |
| `/admin/documents` | Cross-org document audit. |
| `/admin/errors` | Error log. |
| `/admin/feedback` | Thumbs-up/down widget submissions. |
| `/admin/billing` | Per-org Stripe state. |
| `/admin/inbox-identity` | Provision Twilio numbers per user. |
| `/admin/users` | User list + role / persona / lock controls. |
| `/admin/vision` | Vision pipeline admin. |
| `/admin/ops-assistant` | Ops AI assistant. |
| `/admin/support` | Support ticket queue. |
| `/admin/layout.tsx` | Admin layout with Admin Quick Links bar (post-task #96). |

Access control: `lib/auth/platform-admin.ts` reads the `platform_admin_whitelist` table (mig `114`). Non-admins get a 404.

---

## 18. Marketing site

### 18.1 Homepage

`apps/web/app/page.tsx` → `apps/web/components/marketing/vite/HomePage.tsx`. Sections:

- Hero with headline + subheading + dual CTA (Start Trial / See Pricing).
- ProductPreview (`components/marketing/vite/ProductPreview.tsx`) — interactive tabbed mockup (Owner / Mechanic / Ask AI views).
- RealShopsStrip (`components/marketing/vite/RealShopsStrip.tsx`) — real-shop photos (sourced from Unsplash).
- Features grid.
- Pricing teaser.
- Blog teaser (latest 3 posts).
- Footer with "Built by mechanics" credit.

Image components fall back via `ImageWithFallback.tsx` for SSR-safe rendering.

### 18.2 Blog

`apps/web/content/blog/*.mdx` parsed by `apps/web/lib/blog.ts`. `getAllPosts()`, `getPostBySlug(slug)`. Each post has frontmatter (`title`, `description`, `published`, `tags`, `author`, optional `og`). Authors live in `content/blog/authors.json`.

`/blog` index page lists all posts. `/blog/[slug]` renders the post with MDX. Per-post OG image lives at `app/blog/[slug]/opengraph-image.tsx` (Satori-based; was simplified after the Satori-unsafe glyphs broke link unfurls — see commit history for the rewrites).

Each post emits `Article` schema JSON-LD inline. The FAR 91.409 explainer (`far-91-409-411-413-explained.mdx`) also emits `FAQPage` JSON-LD (eligible for the FAQ rich snippet).

Posts (18 today):

- `ad-compliance-tracking-tools-comparison.mdx`
- `ai-aviation-records-how-it-works.mdx`
- `aircraft-annual-inspection-cost-2026.mdx`
- `aircraft-logbook-lost-or-damaged-what-to-do.mdx`
- `aircraft-ownership-true-cost-2026.mdx`
- `aircraft-records-prebuy-inspection-checklist-2026.mdx`
- `annual-inspection-checklist.mdx`
- `best-aircraft-maintenance-software-2026.mdx`
- `cessna-172-100-hour-inspection-cost-checklist.mdx`
- `cessna-182-common-ads.mdx`
- `document-scanning-best-practices.mdx`
- `elt-battery-replacement-guide.mdx`
- `faa-registry-changes-2026.mdx`
- `far-91-409-411-413-explained.mdx`
- `mechanic-portal-v2-launch.mdx`
- `prepurchase-inspection-questions.mdx`
- `understanding-ad-compliance-2025.mdx`

### 18.3 SEO

- `app/layout.tsx` — root `<head>` with canonical (set per-route via `metadata`).
- `app/sitemap.ts` — sitemap including every blog slug.
- `app/robots.ts` — `robots.txt`.
- Per-page `opengraph-image.tsx` for `/`, `/pricing`, `/features`, `/about`, `/scanning`, every blog post.
- JSON-LD: `Organization` schema in root layout, `Article` per blog post, `FAQPage` on the FAR explainer.

---

## 19. Build + deploy

- **Framework**: Next 14.2.3 App Router.
- **TypeScript**: `apps/web/next.config.mjs` has `typescript.ignoreBuildErrors: true` (legacy — see §21).
- **ESLint**: `eslint.ignoreDuringBuilds: true` (legacy — see §21).
- **Active config**: `apps/web/next.config.mjs` is the file Next.js loads. A stale `next.config.ts` was deleted; its CSP + HSTS were merged into the .mjs.
- **CSP**: deliberately permissive starting policy. Allowlist includes Vercel Insights, PostHog, Stripe.js, Supabase, Anthropic API, OpenAI API, Sentry. `frame-src 'self'` is required for the document preview iframe. Tighten with a nonce once the inline JSON-LD scripts in `app/layout.tsx` are nonce'd.
- **Vercel project**: built from the monorepo root via the `apps/web/vercel.json` cd-prefixed commands. The cron schedule lives in `apps/web/vercel.json`.
- **Build command**: `pnpm --filter @myaircraft/web build`.
- **Install command**: `corepack enable && pnpm install --frozen-lockfile=false`.
- **Output**: `apps/web/.next`.
- **Region**: `iad1`.
- **Branching**: `main` auto-deploys to production. Every PR gets a preview deploy. Worktree branches (e.g. `claude/gallant-mendeleev-8d5357`) also get previews.
- **Sentry source maps**: uploaded via the `@sentry/nextjs` plugin during build (env: `SENTRY_AUTH_TOKEN`, currently optional).

### 19.1 External-package externalization

The following deps are loaded dynamically at runtime via `require()` rather than bundled by webpack:

- `puppeteer-core`
- `@sparticuz/chromium`
- `pdfjs-dist`
- `@vercel/sandbox`
- `playwright-core`
- `undici`
- `@trigger.dev/sdk`

This is set in both `experimental.serverComponentsExternalPackages` and the webpack `externals` callback in `apps/web/next.config.mjs`. Don't remove either — the Next 14 SWC parser chokes on the private-class-fields in `undici@7` (which `@vercel/sandbox` pulls transitively).

### 19.2 outputFileTracingIncludes

The SOP library reads `docs/sop/*.md` at runtime via `apps/web/lib/sop/parser.ts`. Those files live outside the `apps/web` build root, so we explicitly include them in the function tracing:

```js
outputFileTracingIncludes: {
  '/sop-library/**': ['../../docs/sop/**'],
  '/api/admin/sop/**': ['../../docs/sop/**'],
  '/api/sop/**': ['../../docs/sop/**'],
}
```

If you move the SOP markdown, update this.

---

## 20. Required env vars

Captured by grepping `process.env.*` across `apps/web/`. Group by purpose:

### 20.1 Supabase

| Var | Required | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Public URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Anon RLS key. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Bypass RLS — webhooks + crons + admin. |
| `DATABASE_URL` | Yes | Direct Postgres connection (used by `pg` in migration scripts). |

### 20.2 OpenAI / Anthropic / Cohere

| Var | Required | Notes |
| --- | --- | --- |
| `OPENAI_API_KEY` | Yes | RAG + classifiers + extractors. |
| `OPENAI_CHAT_MODEL` | No | Override (defaults to `gpt-4o`). |
| `OPENAI_INBOX_EXTRACTOR_MODEL` | No | Override. |
| `OPENAI_INBOX_CLASSIFIER_MODEL` | No | Override. |
| `OPENAI_TRIAGE_MODEL` | No | Override. |
| `OPENAI_CURATOR_MODEL` | No | Override. |
| `OPENAI_OCR_MODEL` | No | Vision-LLM OCR fallback (default `gpt-4o`). |
| `OPENAI_FOLLOWUP_MODEL` | No | Default `gpt-4o-mini`. |
| `OPENAI_EMPTY_STATE_MODEL` | No | Default `gpt-4o-mini`. |
| `OPENAI_ERROR_EXPLAINER_MODEL` | No | Default `gpt-4o-mini`. |
| `OPENAI_EMBEDDING_MODEL` | No | Default `text-embedding-3-small`. |
| `OPENAI_PROMPT_VERSION`, `OPENAI_RULE_VERSION` | No | Versioning labels in logs. |
| `ANTHROPIC_API_KEY` | No | Reserved; product runs on OpenAI today. |
| `COHERE_API_KEY` | No | Rerank. If absent, rerank is a no-op. |
| `COHERE_RERANK_MODEL` | No | Default `rerank-v3.5`. |

### 20.3 Stripe

| Var | Required | Notes |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | Yes (prod) | Server SDK. |
| `STRIPE_WEBHOOK_SECRET` | Yes (prod) | Sig verify. |
| `STRIPE_PRICE_OWNER_MONTHLY`, `STRIPE_PRICE_MECHANIC_MONTHLY`, `STRIPE_PRICE_BUNDLE_MONTHLY` | Yes (prod) | Price IDs. |
| `STRIPE_PRICE_PER_AIRCRAFT` | Yes (prod) | Per-aircraft addon. |
| `STRIPE_PRODUCT_PREBUY`, `STRIPE_PRODUCT_LENDER`, `STRIPE_PRODUCT_INSURER` | No | Add-on products. |
| `STRIPE_USE_MOCK` | No | Skip real Stripe calls in dev. |

### 20.4 Resend

| Var | Required | Notes |
| --- | --- | --- |
| `RESEND_API_KEY` | Yes | Outbound. |
| `RESEND_WEBHOOK_SECRET` | Yes (prod) | Inbound sig. |
| `RESEND_FROM_DEFAULT` | Yes | E.g. `support@myaircraft.us`. |
| `RESEND_REPLY_TO_DEFAULT` | No | |
| `RESEND_TEST_INBOX` | No | Catch-all in dev. |

### 20.5 Twilio

| Var | Required | Notes |
| --- | --- | --- |
| `TWILIO_ACCOUNT_SID` | Yes | |
| `TWILIO_AUTH_TOKEN` | Yes | Sig verify on inbound. |
| `TWILIO_FROM_DEFAULT`, `TWILIO_FROM_NUMBER` | Yes | Fallback FROM if user has no number. |
| `TWILIO_INBOUND_SMS_WEBHOOK` | No | URL hint, not strictly used. |

### 20.6 Sentry / PostHog

| Var | Required | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SENTRY_DSN` | Yes (prod) | Browser. |
| `SENTRY_DSN` | Yes (prod) | Server. |
| `SENTRY_TRACES_SAMPLE_RATE` | No | Default 0.1. |
| `NEXT_PUBLIC_POSTHOG_KEY` | Yes (prod) | |
| `NEXT_PUBLIC_POSTHOG_HOST` | Yes (prod) | Usually `https://us.i.posthog.com`. |

### 20.7 Encryption + secrets

| Var | Required | Notes |
| --- | --- | --- |
| `EXTERNAL_CRED_KEK` | Yes | 32 raw bytes (hex / b64 / b64url). KEK for envelope-encrypting third-party credentials. Rotate by re-encrypting `external_system_credentials` rows. |
| `ENCRYPTION_SECRET` | No | Legacy AES-GCM secret used by older flows. |
| `APP_SECRET` | No | Symmetric token signing. |
| `INTERNAL_SECRET` | Yes | Token between server and internal cron paths. |
| `INTEGRATION_WEBHOOK_SECRET` | Yes (prod) | Misc integration webhook signer. |
| `CRON_SECRET` | Yes | Bearer token shared between Vercel cron + the cron routes. |
| `PARSER_SERVICE_SECRET`, `PARSER_SERVICE_URL` | No | External parser. |
| `SUPPORT_EMAIL_WEBHOOK_SECRET` | No | Support-email inbound. |

### 20.8 Scrapers / vendors

| Var | Required | Notes |
| --- | --- | --- |
| `FSP_SCRAPER_MODE` | Yes (live) | `stub` (default) or `live`. |
| `FSP_USE_MOCK`, `FSP_API_BASE`, `FSP_OAUTH_BASE`, `FSP_OAUTH_CLIENT_ID`, `FSP_OAUTH_CLIENT_SECRET` | No | Future OAuth path. |
| `AIRBLY_API_KEY`, `AIRBLY_API_BASE`, `AIRBLY_USE_MOCK` | No | Airbly integration. |
| `FLIGHTAWARE_API_KEY` | No | Live tracking. |
| `ADSBEXCHANGE_API_KEY`, `RAPIDAPI_ADSB_EXCHANGE_KEY` | No | |
| `EBAY_APP_ID`, `EBAY_CERT_ID`, `EBAY_ENV` | No | Parts marketplace. |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_DEFAULT_VOICE_ID` | No | Voice TTS. |

### 20.9 FARAIM

| Var | Required | Notes |
| --- | --- | --- |
| `FARAIM_API_BASE` | No | Default to prod. |
| `FARAIM_API_KEY`, `FARAIM_SANDBOX_KEY` | No | |
| `FARAIM_ENV` | No | `prod` / `sandbox`. |

### 20.10 Vercel + runtime

| Var | Required | Notes |
| --- | --- | --- |
| `VERCEL_GIT_COMMIT_SHA` | Auto | Set by Vercel; surfaces in the footer build credit. |
| `VERCEL_ENV` | Auto | `production` / `preview` / `development`. |
| `NEXT_PUBLIC_BUILD_SHA` | No | Mirror of the above for the client. |
| `NEXT_PUBLIC_APP_URL` | Yes | E.g. `https://www.myaircraft.us`. |
| `NEXT_PUBLIC_GITHUB_REPO` | No | Repo URL for the footer. |
| `PUBLIC_APP_ORIGIN` | Yes | Origin used by `ops.deployment-canary`. |
| `CANARY_ORIGIN_OVERRIDE` | No | Force canary at a different origin. |
| `HOST`, `PATH`, `NODE_ENV`, `NEXT_RUNTIME` | Auto | |
| `NODE_DISABLE_COLORS`, `NODE_UNIQUE_ID`, `CI` | Auto | |

### 20.11 Misc / feature flags

| Var | Required | Notes |
| --- | --- | --- |
| `ENABLE_AIRCRAFT_LIVE_TRACKING` | No | |
| `ENABLE_BACKGROUND_INGESTION`, `INGESTION_AUTO_RETRY` | No | |
| `ENABLE_TEXTRACT_OCR` | No | |
| `HUMAN_REVIEW_BILLING_ENABLED` | No | |
| `VISION_BLEND_WEIGHT`, `VISION_DISPATCH_MODE`, `VISION_FALLBACK_MODE`, `VISION_FALLBACK_THRESHOLD`, `VISION_GPU_HOST`, `VISION_OCR_RETRANSCRIBE`, `VISION_TEXT_WEIGHT` | No | Vision pipeline tuning. |
| `WAVE2_CTX_MODEL`, `ROUTER_SHADOW`, `BOOK_LANG` | No | |
| `JASC_ATA_IMPORT_DIR`, `LOCAL_OCR_SCRIPT_PATH` | No | Local-dev script paths. |
| `MODAL_ENDPOINT_URL`, `MODAL_QUERY_ENDPOINT_URL`, `MODAL_API_KEY`, `MODAL_TIMEOUT_MS` | No | Modal worker. |
| `COLAB_NGROK_URL` | No | Dev tunnel. |
| `REPLICATE_API_TOKEN`, `RUNPOD_API_KEY` | No | GPU fallback. |
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | No | Legacy SMTP. |
| `SENDGRID_INBOUND_KEY` | No | Legacy. |
| `SERPAPI_API_KEY` / `SERPAPI_KEY` / `SERP_API_KEY` | No | Web search. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | No | Google Drive OAuth. |
| `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, `QBO_ENV`, `QBO_USE_MOCK`, `QBO_WEBHOOK_VERIFIER` | No | QBO. |
| `TRIGGER_SECRET_KEY` | No | Trigger.dev (legacy). |
| `FAA_REGISTRY_FRESHNESS_HOURS` | No | FAA cache TTL. |
| `SMOKE_APP_BASE`, `VERCEL_PROD_BASE` | No | Smoke-test config. |

A clean `apps/web/.env.local.example` is checked into the repo. Andy's working `.env` for local dev is at the repo root.

---

## 21. Known TODOs / follow-ups

- `next.config.mjs` has `typescript.ignoreBuildErrors: true`. There are pre-existing TS errors across the tree; ship a typecheck-clean PR before turning this off.
- `next.config.mjs` has `eslint.ignoreDuringBuilds: true`. Lint debt is real but tractable.
- `/api/cron/fsp-sync` currently uses a literal `'TODO_LOAD_FROM_FSP_SYNC_STATE'` mock token when not in mock mode. Real FSP requires per-org OAuth tokens — design a `fsp_sync_state` table mirroring `qbo_sync_state` (mig `097`). The browser-automation scraper at `data-sync.tach-time-scraper` is the supported path until then.
- Vendor scrapers: only `flight_schedule_pro` is implemented. `flight_circle`, `shop_monkey`, `mechanics_helper` are scaffolded entries in `lib/agents/scrapers/index.ts` — add files in the same shape.
- Mobile responsive pass on `/demo/*` shells has been done at top-level (task #117) but the deeper drilldowns (work order detail, logbook composer, scanner) need another pass.
- Multi-page TypeScript clean-up (large generic-typing debt in `lib/work-orders`, `lib/billing`, `lib/inbox`).
- CSP tightening: `'unsafe-inline'` + `'unsafe-eval'` in `script-src` are temporary until the inline JSON-LD blocks in `app/layout.tsx` are nonce'd.
- Sentry source maps upload is currently best-effort (`SENTRY_AUTH_TOKEN` is optional). Provision the org token so production stack traces deobfuscate.
- `/communications` → `/messages` rename redirect can be removed after 90 days (was 2026-05-23 — so safe to drop after 2026-08-21).
- The 1% answer-grader sample rate is conservative; once cost is known, dial up to 5%.
- The cross-tenant leak watchdog also samples at 1%. Run a one-shot 100% audit before raising prices.
- `next.config.ts` was deleted — confirm no Vercel build cache still references it.
- Migration filename style switched from numeric (`001_*`) to timestamp (`20260514131428_*`) on 2026-05-14. The old format is fine for legacy files; new migrations should follow the timestamp style so they sort correctly.

---

## 22. Key files for a new developer to read first

In priority order:

1. **`apps/web/middleware.ts`** — every request goes through this. Auth gate, tenant rewrite, `/communications`→`/messages` redirect, public vanity URL pass-through.
2. **`apps/web/lib/auth/tenant-routing.ts`** — `extractTenantPathname()` + the reserved-segment list. Touch this whenever you add a top-level route.
3. **`apps/web/lib/agents/registry.ts`** — the agent manifest. Reading it cover-to-cover takes 15 minutes and tells you what the AI does behind the scenes.
4. **`apps/web/lib/agents/runner.ts`** — `runAgent()`. Every agent invocation goes through this; understand it before you write a new agent.
5. **`apps/web/app/(app)/dashboard/page.tsx`** — persona-aware dashboard switcher. Models how the rest of the app picks UI based on `persona`.
6. **`apps/web/components/redesign/AppLayout.tsx`** — the top-level shell. `OWNER_NAV`, `SHOP_ADMIN_NAV`, sidebar collapsing, persona switcher, billing banner, onboarding tour.
7. **`apps/web/components/redesign/Dashboard.tsx`** — shop dashboard. The big surface that mechanics see.
8. **`apps/web/components/redesign/MechanicPortal.tsx`** — mechanic cockpit (active WO + 12-month history). Data flows through `DataStore`.
9. **`apps/web/app/api/ask/route.ts`** — the RAG endpoint. The single most important AI surface. Read it together with `lib/ask/fleet-aggregation.ts` and `lib/rag/retrieval.ts`.
10. **`apps/web/lib/billing/gate.ts`** — paywall + per-persona entitlement resolution. Anything billing-touched routes through here.

Once you've read these, also skim:

- `apps/web/lib/supabase/server.ts` — how RLS clients are constructed server-side.
- `apps/web/lib/auth/context.ts` — `resolveRequestOrgContext()`.
- `apps/web/lib/persona/config.ts` — `PERSONA_CONFIG` (system prompts, hidden modules).
- `apps/web/lib/work-orders/status.ts` — the WO state machine.
- `apps/web/app/api/webhooks/resend/inbound/route.ts` and `apps/web/app/api/webhooks/twilio/sms/route.ts` — inbound comms.
- `supabase/migrations/011_rls.sql` — RLS foundation.
- `supabase/migrations/20260526000000_unified_inbox_foundation.sql` — most recent schema watershed.
- `apps/web/next.config.mjs` — CSP, externalization, file-tracing includes. Read the comments — they document past bugs.
- `apps/web/vercel.json` — every cron schedule.

Andy's commit history (`git log --oneline`) reads like a changelog and is the single best way to understand recent shifts. Spend an hour on it before making non-trivial changes.

---

*Last updated: 2026-05-24. Author: Andy Patel + Claude.*
