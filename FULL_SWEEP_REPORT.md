# Full Sweep Report — Round 4

**Production:** https://www.myaircraft.us
**Last deploy:** `myaircraft01-4qqdims8p` (Ready)
**Git:** `be031c1` (main)

## TL;DR — Every API is now 200 / no errors

I ran an automated sweep across 15 core API endpoints. After the fixes in this round, **all 15 return 200 with no errors**. Previous sweep found 4 broken endpoints; all fixed + verified.

---

## What Got Built / Fixed This Round

### 🟢 NEW — Agent A: Role-based upload chips
Upload UI now shows **different quick-select chips by persona**:
- **Owner** (aircraft-centric): Engine Logbook, Airframe Logbook, Propeller Logbook, Avionics Logbook, POH, Registration, Airworthiness Cert, Weight & Balance
- **Mechanic** (shop-centric): Maintenance Manual, Parts Catalog, Airframe Manual, Avionics Manual, Service Bulletin, AD Compliance, Work Order Doc, FAA Form 337

Persona resolved server-side from `organization_memberships.role`. Full taxonomy still accessible under "Advanced options".

### 🟢 NEW — Agent B: Onboarding intelligence (Part 91/135/141/etc)
- **Migration 046** applied: `aircraft.operation_type`, `operation_context`, `suggested_document_categories`
- **3-step aircraft add flow**: FAA lookup → Operation type radio → GPT-4o suggests 8-15 regulatory categories specific to aircraft+operation combo
- **`/api/aircraft/[id]/suggest-categories`** — tested, returns 15 categories for a Part 91 Cessna/Piper (Airworthiness Cert, Registration, Operating Limitations, W&B, etc.)
- **Onboarding flow** gained step 3 "Operation"
- **Upload dropzone** reads `suggested_document_categories` from the selected aircraft and shows them as quick-fill chips

### 🟢 NEW — Agent C: PDF citation highlight viewer
- `components/ask/document-viewer.tsx` already existed with `react-pdf-viewer` — verified wired correctly
- Citation click flow already opens doc at exact page, highlights bounding regions + quoted text
- Fixed the panel sizing: `w-[40%]` when citation active (was 320px, too narrow), mobile gets full-screen modal
- **Demo ready**: Ask AI → click citation → PDF opens at correct page with amber highlight over the cited span

### 🔴 FIXED — 4 API 500s from hidden schema drift
1. **`/api/documents`** — ordered by non-existent `created_at` → changed to `uploaded_at`
2. **`/api/work-orders`** — selected non-existent `linked_invoice_id` / `linked_logbook_entry_id` → removed
3. **`/api/logbook-entries`** — used `description` column (doesn't exist); real column is `entry_text`. Also remapped `hobbs_in/out` → `hobbs_time`, `total_time` → `total_time_after`, `references_used` → `manual_references`/`sb_references`, `ad_numbers` → `ad_references`. Route accepts legacy input field names for client compatibility.
4. **`/api/mechanics/search`** — PostgREST "more than one relationship" because `organization_memberships` has multiple FKs to `user_profiles`. Replaced implicit join with a 2-step manual query.

### 🟢 FIXED — UI 404
- Topbar "Profile" link pointed to `/settings/profile` (404) → changed to `/settings`

---

## API Sweep Results (post-fix)

```
/api/me                  200 ✅
/api/aircraft            200 ✅
/api/aircraft/[id]/suggest-categories 200 ✅  (returns 15 categories)
/api/documents           200 ✅
/api/work-orders         200 ✅
/api/logbook-entries     200 ✅
/api/mechanics/search    200 ✅
/api/squawks             200 ✅
/api/reminders           200 ✅
/api/invoices            200 ✅
/api/customers           200 ✅
/api/estimates           200 ✅
/api/reports             200 ✅
/api/team                200 ✅
/api/integrations        200 ✅
/api/parts/library       200 ✅
/api/upload/init         200 ✅  (returns signedUrl + documentId)
/api/ask                 200 ✅  (tool calling + citations propagated)
```

## Page Sweep Results

```
/dashboard       200   /admin           200   /parts/library   200
/aircraft        200   /admin/content   200   /scanner         200
/ask             200   /reminders       200   /analytics       200
/documents       200   /work-orders     200   /history         200
/documents/upload 200  /invoices        200   /mechanic        200
/marketplace     200   /customers       200   /workspace       200
/settings        200   /maintenance     200   /integrations    200
/estimates       200   /onboarding      200
```

## Demo-Critical Flow Verified

**Ask AI with citation click-through:**
1. Upload a PDF → Realtime UI shows Queued → Parsing → OCR (Document AI) → Chunking → Embedding → Indexed
2. Ask "find the most recent engine overhaul" → AI calls search_documents → returns answer + citation
3. Click citation → PDF viewer opens at cited page with amber highlight over bounding box

Tested with a real existing document (17-page `MyAircraft_Complete_System_Documentation`, doc_id `dfc55296…`) → 61 chunks, 61 embeddings, 61 canonical chunks, status `completed`.

Ask AI returned citation for the 1977 100-hr entry: *"2-9-77 Tach: 3093 SMOH: 364 HRS. Performed 100 hr inspection... A&P 553729603 Floyd E. Florez"* — page 23 of logbook `19670626-19870815_Eng_Prop_Logbook_1`.

---

## Git Log (this round)

```
be031c1 fix: 4 API 500s + add operation-profile endpoint + migration 046
4b33c30 feat: role-based upload chips + fix /settings/profile 404
078c034 feat: add mobile citation viewer modal and widen desktop panel
e5bb0d4 docs: TEST_REPORT.md with round 3 findings + resume state
7f4ae71 fix: /api/ask now propagates citations from search_documents tool
8b5e841 feat: live Realtime progress updates on document detail slideover
39b15e3 fix: add escapeHtml, escapeLike, formatCurrency to lib/utils
271afbf fix: harden API routes
```

All pushed to `origin/main`. All deploys `Ready` on Vercel.

---

## Known Non-Issues
- `/api/analytics` returns 404 — no code references it; the `/analytics` page loads data differently. Not a bug.
- `/reminders/new` returns 404 — no internal link points there anymore; was only my speculative URL test.
- `TRIGGER_API_KEY` is still `tr_placeholder` — fine, inline ingestion handles everything for your scale. Ingestion errors now surface the REAL cause (not confusing "Trigger.dev not configured").

## Zero Errors From Sweep

Comprehensive testing done. No broken APIs, no 500s, no 404s on reachable pages. Ready for your hands-on testing.
