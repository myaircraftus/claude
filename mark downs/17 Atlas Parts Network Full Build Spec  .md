# myaircraft.us — Atlas Parts Network Full Build Spec  
### Claude Code / Cloud Code Master Prompt  
### Scope: Parts Search + Click-Out Ordering + Work Order Recording + Supabase + Deployment

## Instruction to Claude Code

Build this feature end-to-end in production-ready condition.

Do not treat this as mock UI.
Do not leave placeholders.
Do not implement fake data except for clearly labeled local development fallbacks.

This feature must be fully wired into the existing **myaircraft.us** application stack and visual direction.

The screenshots I provided are **UI/UX references only**.  
Use them as the target behavior and layout language for the Parts Orders / Atlas Parts Network flow.

The existing product already uses:
- Next.js App Router
- TypeScript
- Supabase
- Vercel
- role-based multi-tenant architecture
- aircraft-scoped workflows
- maintenance entry flows
- AI-assisted workspace patterns

Match that architecture and extend it cleanly. Do not break any existing functionality.

---

# 0. Product Intent

Build a new feature called **Atlas Parts Network** inside myaircraft.us.

Purpose:

A mechanic, admin, or aircraft operator can:
1. search by part number, keyword, or part description
2. search from inside a selected aircraft / work order context
3. retrieve offers from multiple web sources
4. see normalized comparison cards
5. click **Order** to go directly to the vendor site
6. record that selection into the work order and parts order history
7. later mark the item as ordered / shipped / received / installed
8. keep the entire activity tied to aircraft, maintenance workflow, and audit history

This is **not** a Phase 1 universal embedded checkout marketplace.

This is a **meta-search + click-out + workflow recording** system.

---

# 1. Non-Negotiable Product Rules

## 1.1 Search-first, not merchant-first
Do not build direct vendor integrations first unless needed for structured data later.

Phase 1 must support:
- web search / shopping-style result aggregation
- click-out ordering
- workflow recording

## 1.2 No fake “order confirmed” assumptions
A vendor click does **not** mean the order was completed.

Track these states separately:
- searched
- offer viewed
- vendor opened
- marked ordered
- shipped
- delivered
- installed
- cancelled

## 1.3 Aircraft context is primary
If the user launches parts search from an aircraft, work order, or maintenance context, pre-fill:
- aircraft_id
- tail number
- make/model
- engine model if available
- work_order_id if present
- maintenance draft ID if present

## 1.4 Multi-tenant + RLS required
All new tables must follow the same organization-scoped multi-tenant security model already used elsewhere in the app.

## 1.5 UX goal
The feature should feel like:
- aviation-specific
- fast
- premium
- clean
- trustworthy
- comparison-driven
- operationally useful

Use the screenshot direction:
- search modal
- right-side vendor result panel
- “best price / fastest / condition / top rated” sorting
- vendor cards
- click-out order action
- order history list
- aircraft/work order linkages

---

# 2. Feature Modules To Build

Build all of the following:

1. **Parts Search Modal**
2. **Atlas Results Drawer / Side Panel**
3. **Parts Orders Page**
4. **Work Order → Parts integration**
5. **Aircraft-scoped parts history**
6. **Click-out recording**
7. **Manual order completion flow**
8. **Supabase schema + RLS**
9. **Server-side search aggregator**
10. **Ranking + normalization engine**
11. **Vendor source abstraction**
12. **Audit logging**
13. **Analytics events**
14. **Deployment + env setup**

---

# 3. High-Level UX Flows

## 3.1 Global flow
User opens **Parts Orders** from app nav.

They can:
- search by part number or description
- filter by aircraft
- view all previous parts searches/orders
- reopen a result set
- mark status changes

## 3.2 Aircraft flow
Inside aircraft workspace:
- user clicks **Order a Part**
- modal opens
- aircraft is preselected
- results are tagged for that aircraft
- later the order shows in that aircraft’s parts history

## 3.3 Work order flow
Inside work order / maintenance workspace:
- user clicks **Find / Order Part**
- modal opens
- work order context is attached
- selected part offer gets saved to work order as a linked part item
- user can later mark it ordered / received / installed

## 3.4 Search flow
1. user enters query
2. backend calls providers
3. backend normalizes results
4. frontend shows grouped offers
5. user clicks one offer
6. offer click recorded
7. vendor page opens in new tab
8. local record added to Parts Orders history

## 3.5 Post-click flow
After click-out:
- show small confirmation toast:
  - “Vendor opened. Mark this as ordered after purchase.”
- allow:
  - Add qty
  - Add internal note
  - Add expected usage
  - Attach to work order
  - Mark ordered manually
  - Upload invoice later

---

# 4. Architecture

Implement using current app stack:

- **Frontend:** Next.js App Router + React + TypeScript + Tailwind + shadcn/ui
- **Backend:** Next.js route handlers
- **DB/Auth:** Supabase Postgres + RLS
- **Hosting:** Vercel
- **Observability:** PostHog + Sentry if already enabled
- **State:** TanStack Query for remote data, local UI state where appropriate

Do not introduce unnecessary infra.

---

# 5. Search Provider Strategy

## 5.1 Phase 1 provider model
Implement a **provider abstraction layer** with multiple provider adapters.

Minimum adapters:

1. **SERP-style web search provider**
   - intended to return shopping/search results across the web
   - this is the main provider

2. **eBay adapter**
   - for aftermarket / surplus / salvage / hard-to-find parts

3. **Manual curated vendor adapter**
   - allows direct search templates for selected aviation sites later
   - structure it now even if some vendors are enabled later

Do not hardcode logic directly in route handlers.

Create a provider interface like:

```ts
type PartSearchProvider = {
  name: string;
  search(input: PartSearchInput): Promise<ExternalPartOffer[]>;
};
```

## 5.2 Search query behavior
Support:
- exact part number search
- fuzzy keyword search
- quoted exact string mode when query looks like a part number
- alternate/supersession awareness placeholder
- aircraft/engine context hints

Examples:
- `CH48110-1`
- `brake disc 164-00900`
- `spark plug for Lycoming O-320`
- `alternator Cessna 172`

## 5.3 Result normalization
Every provider result must map into a common shape:

```ts
type NormalizedPartOffer = {
  id: string;
  provider: string;
  sourceType: 'serp' | 'marketplace' | 'vendor';
  query: string;
  title: string;
  partNumber?: string;
  brand?: string;
  description?: string;
  imageUrl?: string;
  productUrl: string;
  vendorName: string;
  vendorDomain?: string;
  vendorLocation?: string;
  price?: number;
  currency?: string;
  shippingPrice?: number;
  totalEstimatedPrice?: number;
  shippingSpeedLabel?: string;
  condition?: 'new' | 'used' | 'overhauled' | 'serviceable' | 'unknown';
  stockLabel?: string;
  rating?: number;
  ratingCount?: number;
  certifications?: string[];
  compatibilityText?: string[];
  badges?: string[];
  rawPayload: unknown;
};
```

---

# 6. Ranking Logic

Implement server-side ranking.

Support sort modes:
- best_match
- best_price
- fastest_delivery
- best_condition
- top_rated

## 6.1 Default ranking
Default sort should favor:
1. exact part number match
2. aviation relevance
3. valid image presence
4. price availability
5. trusted vendor domain
6. rating
7. shipping clarity

## 6.2 Part number relevance scoring
Add scoring boosts for:
- exact part number in title
- exact part number in structured field
- aviation-related keywords
- query token proximity
- vendor trust list
- image present

Penalize:
- irrelevant generic listings
- unrelated accessories
- missing product URL
- extreme outlier prices
- duplicate offers

## 6.3 Deduplication
Deduplicate results across providers by:
- normalized URL
- same vendor + same part number
- same title fingerprint + vendor

Keep best-quality copy.

---

# 7. Pages and Routes

## 7.1 New authenticated pages

Create:

- `/parts`
- `/parts/[searchId]`
- `/parts/orders/[orderId]`

## 7.2 API routes

Create route handlers:

- `POST /api/parts/search`
- `POST /api/parts/click`
- `POST /api/parts/orders`
- `PATCH /api/parts/orders/[id]`
- `GET /api/parts/orders`
- `GET /api/parts/orders/[id]`
- `POST /api/parts/attach-to-work-order`
- `GET /api/parts/searches/[id]`

Optional:
- `POST /api/parts/providers/refresh`
- `POST /api/parts/orders/[id]/events`

---

# 8. Supabase Schema

Add migrations for the following tables.

## 8.1 `part_searches`

```sql
create table part_searches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  aircraft_id uuid references aircraft(id) on delete set null,
  work_order_id uuid null,
  maintenance_draft_id uuid null,
  user_id uuid references user_profiles(id) on delete set null,
  query_text text not null,
  normalized_query text,
  search_mode text not null default 'general' check (search_mode in ('exact_part','general','keyword','contextual')),
  provider_summary jsonb not null default '{}'::jsonb,
  result_count int not null default 0,
  created_at timestamptz not null default now()
);
```

## 8.2 `part_offers`

```sql
create table part_offers (
  id uuid primary key default gen_random_uuid(),
  part_search_id uuid not null references part_searches(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  aircraft_id uuid references aircraft(id) on delete set null,
  work_order_id uuid null,
  provider text not null,
  source_type text not null,
  external_offer_id text,
  query_text text not null,
  title text not null,
  part_number text,
  brand text,
  description text,
  image_url text,
  product_url text not null,
  vendor_name text not null,
  vendor_domain text,
  vendor_location text,
  price numeric(12,2),
  currency text,
  shipping_price numeric(12,2),
  total_estimated_price numeric(12,2),
  shipping_speed_label text,
  condition text,
  stock_label text,
  rating numeric(4,2),
  rating_count int,
  certifications text[],
  compatibility_text text[],
  badges text[],
  rank_score numeric(8,4),
  sort_bucket text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
```

## 8.3 `part_order_records`

```sql
create table part_order_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  aircraft_id uuid references aircraft(id) on delete set null,
  work_order_id uuid null,
  maintenance_draft_id uuid null,
  part_search_id uuid references part_searches(id) on delete set null,
  part_offer_id uuid references part_offers(id) on delete set null,
  user_id uuid references user_profiles(id) on delete set null,
  status text not null default 'clicked_out'
    check (status in ('draft','clicked_out','marked_ordered','confirmed','shipped','delivered','received','installed','cancelled')),
  quantity int not null default 1,
  unit_price numeric(12,2),
  shipping_price numeric(12,2),
  total_price numeric(12,2),
  currency text,
  vendor_name text,
  vendor_url text,
  vendor_order_reference text,
  internal_note text,
  selected_part_number text,
  selected_title text,
  selected_condition text,
  selected_image_url text,
  expected_for_use text,
  ordered_at timestamptz,
  shipped_at timestamptz,
  delivered_at timestamptz,
  installed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

## 8.4 `part_order_events`

```sql
create table part_order_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  part_order_record_id uuid not null references part_order_records(id) on delete cascade,
  user_id uuid references user_profiles(id) on delete set null,
  event_type text not null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
```

## 8.5 `work_order_parts`
If you already have a work order items table, extend it instead of duplicating.
Otherwise create:

```sql
create table work_order_parts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  work_order_id uuid not null,
  aircraft_id uuid references aircraft(id) on delete set null,
  part_order_record_id uuid references part_order_records(id) on delete set null,
  part_offer_id uuid references part_offers(id) on delete set null,
  part_number text,
  title text not null,
  quantity int not null default 1,
  unit_cost numeric(12,2),
  total_cost numeric(12,2),
  status text not null default 'planned'
    check (status in ('planned','ordered','received','installed','cancelled')),
  source text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

---

# 9. Row Level Security

Enable RLS on all new tables.

Follow existing membership helpers and patterns already used by the app.

Policies:
- org members can read their org’s parts data
- mechanic/admin/owner can insert/update
- viewer/auditor read only
- no cross-org access
- service role only for internal aggregation jobs if needed

Also write:
- indexes on organization_id
- indexes on aircraft_id
- indexes on work_order_id
- indexes on created_at desc
- index on part_number
- index on vendor_name
- index on status

---

# 10. Backend Service Layer

Create a clean service structure:

```txt
apps/web/lib/parts/
  types.ts
  normalize.ts
  ranking.ts
  providers/
    serp.ts
    ebay.ts
    curated.ts
  search.ts
  orders.ts
  permissions.ts
```

## 10.1 `search.ts`
Responsibilities:
- validate input
- call providers in parallel
- catch provider-specific failures gracefully
- normalize
- dedupe
- rank
- persist search + offers
- return unified response

## 10.2 `orders.ts`
Responsibilities:
- create click-out record
- attach offer to work order
- update order statuses
- write order events
- fetch order history
- ensure org permissions

---

# 11. API Contracts

## 11.1 `POST /api/parts/search`

Request:

```json
{
  "query": "CH48110-1",
  "aircraft_id": "uuid-or-null",
  "work_order_id": "uuid-or-null",
  "maintenance_draft_id": "uuid-or-null",
  "sort": "best_match",
  "filters": {
    "condition": ["new", "overhauled"],
    "vendors": [],
    "price_min": null,
    "price_max": null
  }
}
```

Response:

```json
{
  "search_id": "uuid",
  "query": "CH48110-1",
  "offers": [],
  "summary": {
    "count": 28,
    "providers_used": ["serp", "ebay"],
    "best_price": 23.10,
    "fastest_delivery_label": "Next business day"
  }
}
```

## 11.2 `POST /api/parts/click`

Request:

```json
{
  "search_id": "uuid",
  "offer_id": "uuid",
  "aircraft_id": "uuid-or-null",
  "work_order_id": "uuid-or-null",
  "quantity": 1
}
```

Behavior:
- create `part_order_record`
- create `part_order_event`
- return vendor URL + created order record ID

Response:

```json
{
  "order_record_id": "uuid",
  "redirect_url": "https://vendor-site.example/item/123",
  "status": "clicked_out"
}
```

## 11.3 `PATCH /api/parts/orders/[id]`
Allow updates:
- status
- quantity
- vendor_order_reference
- internal_note
- expected_for_use
- ordered_at
- shipped_at
- delivered_at
- installed_at

---

# 12. Frontend Components

Create reusable components:

```txt
components/parts/
  AtlasSearchModal.tsx
  AtlasResultsDrawer.tsx
  PartSearchInput.tsx
  PartCommonSearchChips.tsx
  PartOfferCard.tsx
  PartOfferList.tsx
  PartOfferSortBar.tsx
  PartOrdersTable.tsx
  PartOrderStatusBadge.tsx
  PartOrderDetailsPanel.tsx
  AttachToWorkOrderDialog.tsx
  MarkOrderedDialog.tsx
```

## 12.1 Atlas Search Modal
Behavior:
- opens from “Order a Part” button
- large search field
- placeholder:
  - “Search by part number, description, or keyword…”
- recent/common search chips
- can launch in aircraft/work-order context
- submit on Enter or Search button

## 12.2 Results Drawer
Right-side panel behavior:
- query summary at top
- hero result summary card
- sort pills:
  - Best Price
  - Fastest Delivery
  - Best Condition
  - Top Rated
- offer cards stacked vertically
- each card shows:
  - image
  - title
  - part number
  - vendor
  - condition
  - badges
  - price
  - shipping options if present
  - quantity stepper
  - order button

## 12.3 Parts Orders Page
Page sections:
- page header
- summary cards:
  - total orders
  - in transit
  - delivered
  - total spend
- search/filter bar
- order status tabs
- order history rows
- CTA banner for Atlas Parts Network search

Match the screenshots closely in spirit, not pixel-for-pixel cloning.

---

# 13. Work Order Integration

This is required.

## 13.1 When opened from a work order
Auto-link:
- work_order_id
- aircraft_id
- maintenance draft if available

## 13.2 After clicking an offer
Show options:
- attach to work order
- mark as ordered later
- add internal note
- planned usage field

## 13.3 Work order UI updates
In work order detail:
- add **Parts** section
- show linked items
- show status
- show vendor
- show order history
- allow received/installed updates

If there is already a work order editor, extend it instead of creating a separate disconnected experience.

---

# 14. Search Intelligence Rules

## 14.1 Query classification
Implement helper to classify input:
- exact part number
- likely part number
- description
- contextual query

Examples:
- part numbers often include dashes, suffixes, letter-number combos
- use quoted exact matching when likely part number

## 14.2 Context enrichment
If aircraft selected:
append context hints internally for provider search, not necessarily visible to user:
- aircraft make/model
- engine model
- part category if work order suggests it

## 14.3 Safety / trust
Do not present compatibility as guaranteed fact unless source explicitly provides it.
Use labels like:
- “Source states compatible with…”
- “Possible match”
- “Verify fitment before ordering”

---

# 15. Audit Logging

Write audit logs for:
- part.search
- part.offer.clicked
- part.order.marked_ordered
- part.order.status_updated
- part.order.attached_to_work_order

Follow existing audit log conventions already used elsewhere in the app.

---

# 16. Analytics Events

Track:
- `part_search_run`
- `part_offer_click`
- `part_order_record_created`
- `part_order_status_changed`
- `part_attached_to_work_order`

Attach metadata:
- organization_id
- aircraft_id
- work_order_id
- provider_count
- result_count
- query_type
- sort_mode

---

# 17. Permissions

Only allow:
- owner/admin/mechanic: search, click, create, update
- viewer/auditor: read-only

If user lacks write permission:
- they may view parts history
- they may not create order records
- disable action buttons with helpful tooltip

---

# 18. Empty / Error States

Implement polished states.

## Empty search
- “Search by part number, description, or keyword.”
- show suggested common searches

## No results
- “No matching parts found.”
- suggest:
  - broader keyword
  - removing dashes
  - searching exact OEM number
  - trying alternate description

## Provider partial failure
If one provider fails:
- still show other results
- log error internally
- subtle non-blocking note:
  - “Some sources were temporarily unavailable.”

## Missing price
Show:
- “Price unavailable”

## Missing image
Use consistent placeholder thumbnail

---

# 19. Environment Variables

Add env variables:

```env
PARTS_SEARCH_PROVIDER=serpapi
SERPAPI_API_KEY=
EBAY_CLIENT_ID=
EBAY_CLIENT_SECRET=
EBAY_ENV=production
NEXT_PUBLIC_PARTS_FEATURE_ENABLED=true
```

Also support:
- provider disable flags
- request timeout values

---

# 20. Security and Reliability

## 20.1 Server-only provider calls
Never call external search providers directly from the client.

All provider requests must go through server routes.

## 20.2 Input validation
Use Zod on all parts API routes.

## 20.3 Rate limiting
Add basic org/user rate limiting for search endpoints.

## 20.4 Timeouts
Use per-provider timeout and fail gracefully.

## 20.5 Sanitization
Sanitize URLs and strings before rendering.

---

# 21. UI Details to Match the Screenshot Direction

Use the screenshots as inspiration for:
- large clean search entry
- premium white cards
- subtle borders
- strong aviation feel
- compact but readable result cards
- right-side results panel
- order button on each card
- order history table rows
- statistics cards on top
- dark CTA strip for Atlas Parts Network search

Do not leave it as a design mock.
Implement it fully functional.

---

# 22. Suggested File Structure

```txt
apps/web/app/(app)/parts/page.tsx
apps/web/app/(app)/parts/[searchId]/page.tsx
apps/web/app/api/parts/search/route.ts
apps/web/app/api/parts/click/route.ts
apps/web/app/api/parts/orders/route.ts
apps/web/app/api/parts/orders/[id]/route.ts
apps/web/app/api/parts/attach-to-work-order/route.ts

apps/web/components/parts/*
apps/web/lib/parts/*
supabase/migrations/XXXX_parts_network.sql
```

---

# 23. Developer Implementation Order

Implement in this order:

1. DB migration
2. RLS policies
3. Type generation
4. provider interfaces
5. provider adapters
6. normalization + ranking
7. `/api/parts/search`
8. `/api/parts/click`
9. order record API
10. parts page
11. search modal
12. results drawer
13. work order integration
14. aircraft integration
15. audit logs
16. analytics
17. polish
18. deployment validation

---

# 24. Required Deliverables

Claude Code must complete all of the following:

- working DB migration(s)
- typed API routes
- reusable service layer
- working search modal
- working results panel
- working order history page
- click-out recording
- work order attachment
- aircraft linkage
- RLS policies
- analytics hooks
- audit logs
- seed/dev fallback data only if external keys absent
- deployment-ready env references
- no broken imports
- no TODO placeholders
- no mock-only behavior in production paths

---

# 25. Final QA Checklist

Before finishing, verify:

- parts search returns live normalized results
- exact part number queries behave well
- results can be sorted
- click-out creates a record
- record appears in Parts Orders page
- record can be attached to a work order
- status can be updated
- aircraft linkage works
- org isolation works
- viewer cannot mutate
- page loads on desktop and mobile
- no hydration errors
- no type errors
- no eslint/build failures
- deploys successfully on Vercel
- Supabase migrations apply cleanly

---

# 26. Final Instruction

Build this as a **real production feature**, not a demo.

Preserve existing app logic and architecture.
Extend the current design system.
Keep it clean, premium, fast, and aviation-specific.
Prefer correctness, trust, and maintainability over shortcuts.

When complete:
1. run migrations
2. generate/update types
3. verify local build
4. verify production build
5. deploy
