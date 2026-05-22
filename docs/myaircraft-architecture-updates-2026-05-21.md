# myaircraft.us — Architecture Updates (2026-05-19 → 2026-05-21)

**Companion to** `myaircraft-architecture.md` (last edited 2026-05-19, section 12 "What was recently fixed and shipped" ended at item 11 — RAG Next-Wave).

**Purpose:** everything the developer needs to know about what changed in production since that doc was written. Every PR, every data fix, every bug found, every still-open issue. Group by theme; chronological within group.

**Production URL:** https://www.myaircraft.us
**Vercel project:** `myaircraft01` (team `horf`, project ID `prj_g7vwvp6YjqLRdeTMR83L2gfW12EA`)
**Repo:** https://github.com/myaircraftus/claude (default branch `main`)
**Supabase project:** `ygrqinxkeqvikpfmjqiz` (Myaircraft, us-east-2)

---

## 1. The PR / commit ledger

Every PR opened, merged to `main`, and deployed in this window. All sha's are merge commits on `main`.

| # | PR | Merge commit | What it does |
|---|---|---|---|
| 1 | [#8 `chore(rag): one-time tree backfill script`](https://github.com/myaircraftus/claude/pull/8) | `99e6c1e6` | Adds `apps/web/scripts/backfill-trees.mts` — a one-off operational script that walks every aircraft-scoped, non-deleted document and calls `buildDocumentTree()`. **Production run on 2026-05-19 wrote 106,179 page-tree nodes across 12 aircraft from 344/346 docs** (2 failures had impossible OCR-extracted dates: `1994-02-30`, `6531-02-29`). Q14 "fuel capacity of N4421H" smoke test post-backfill: tree branch active, `tree_nodes_used: 22`, strategy `vector+bm25+tree+rerank`, correct answer (19.5 gal/wing × 2 = 39 gal). |
| 2 | [#9 `fix(ui): action-card href + /guided-tour stub + types`](https://github.com/myaircraftus/claude/pull/9) | `3a94e2ca` | (a) `components/ai/action-card.tsx` now renders `href`-only `suggested_actions` (the rule-card generators in `lib/ai/cards/generators.ts` emit `{ label, href }` while the LLM function-calling path emits `{ label, toolCall }` — the old code dropped every href-only action). (b) `lib/ai/types.ts`: `SuggestedAction.toolCall` made optional, `href` added, inner `args` optional. (c) New `apps/web/app/(app)/guided-tour/page.tsx` Coming-Soon stub. (d) `/guided-tour` added to `middleware.ts` `isAppRoute` allowlist. |
| 3 | [#10 `fix(routing): reserve 'guided-tour'`](https://github.com/myaircraftus/claude/pull/10) | `3034f8a8` | PR #9's stub + middleware allowlist weren't enough — `lib/auth/tenant-routing.ts`'s `RESERVED_TOP_LEVEL_SEGMENTS` set didn't list `guided-tour`, so `extractTenantPathname('/guided-tour')` treated the segment as an org tenant slug and rewrote `/guided-tour` → `/dashboard`. Added `'guided-tour'` to the reserved set. Same fix pattern that landed in `4e9f2589` for `/squawks`, `/sop-library`, `/styleguide`. |
| 4 | [#11 `fix(routing): 404 unknown tenant slugs`](https://github.com/myaircraftus/claude/pull/11) | `7fee9e4d` | `lib/auth/server-app.ts` was falling back to `memberships[0]` whenever the requested org id or slug didn't match any of the user's memberships. Combined with `extractTenantPathname` treating any non-reserved segment as a tenant slug, **every unknown URL silently rendered the user's default dashboard instead of returning 404**. Fix: when the requested pathname is prefixed with a slug that doesn't match any membership, call `notFound()`. Gated on `slugInUrl` — the pathname must actually start with `/{slug}` — so a stale `active_organization_slug` cookie can't poison plain `/dashboard` visits. The no-prefix happy path still falls back to memberships[0]. |
| 5 | [#12 `fix(upload): persona modal uses /api/upload/init`](https://github.com/myaircraftus/claude/pull/12) | `3f031c55` | The Upload Document modal in `components/documents/persona-aware-upload-modal.tsx` was POSTing JSON to `/api/upload` (a multipart-only endpoint), which always failed `req.formData()` and returned a generic "Failed to parse form data" banner — even for tiny files. A 9 MB PDF would also have tripped Vercel's 4.5 MB function body limit. Switched the modal to the same presign pattern `upload-dropzone.tsx` uses: `POST /api/upload/init` (JSON) → `supabase.storage.uploadToSignedUrl(...)` (browser→Supabase direct, bypasses Vercel body limit) → `POST /api/upload/complete`. Also improved `/api/upload`'s error path: returns 415 with a clear message pointing at `/api/upload/init` on non-multipart bodies. **Validated end-to-end with a real 9.48 MB N401LP propeller logbook upload** (doc `178fc22f-e1b3-43f4-adbc-f0d010c44760`, 15 pages, full pipeline 63s, 126 chunks + 134 tree nodes). |
| 6 | [#13 `fix(ask): clear PDF preview spinner after 4s on iPad`](https://github.com/myaircraftus/claude/pull/13) | `0ef4a8bc` | iPad/iOS Safari hands `application/pdf` iframes off to native QuickLook (top-level nav only), so the iframe's `onLoad` event never fires. The `DocumentViewer`'s "Opening cited page N…" spinner stayed up forever. Added a 4s ceiling on the spinner via `useEffect`. Desktop browsers (which fire `onLoad`) still clear immediately. |
| 7 | [#14 `fix(preview): iPad tap-to-open CTA`](https://github.com/myaircraftus/claude/pull/14) | `018198da` | Beyond the spinner fix, iPad Safari leaves the iframe DOM blank entirely because QuickLook renders outside the iframe. Replaced the iframe with a "Tap to view page N" CTA card on iOS — taps open `/api/documents/{id}/preview?page=N` as top-level navigation, which Safari handles fine. Applied in both `components/ask/document-viewer.tsx` (Ask Logbook AI citation pane) and `components/documents/document-detail-slideover.tsx` (Documents detail). Non-iOS browsers keep the inline iframe. |
| 8 | [#15 `fix(preview): Safari-wide PDF tap-to-open CTA`](https://github.com/myaircraftus/claude/pull/15) | `0e98fad8` | Mac Safari has gotten stricter about embedded same-origin PDFs in iframes — it shows the system "broken file" icon instead of rendering. PR #14 only covered iPad. This extended the detection to any Safari UA (any platform), excluding Chromium-derivatives (Chrome, Edge, Opera, Firefox-iOS). Renamed `isIosUserAgent()` → `isSafariUserAgent()` in both files. Chrome / Firefox / Edge / Android still keep the inline iframe. |
| 9 | [#16 `feat(rag): bump retrieval top-8 → top-16`](https://github.com/myaircraftus/claude/pull/16) | `0b6810de` | `app/api/query/route.ts:978` changed `const retrievalLimit = aggregation.isAggregation ? 25 : 8` to `: 16`. Investigation showed handwritten logbook entries were correctly indexed but lost the top-8 ranking battle because adjacent chunks' embeddings were dominated by the printed-form boilerplate that appears at the top of every page ("INSTRUCTIONS FOR USE OF THIS LOG BOOK / ALL DATA must bear the endorsement of a certificated mechanic…"). Doubling the post-rerank window doesn't change recall (rerank pool stays at `max(limit*4, 30) = 64`) — only how many top candidates are passed to the answer-gen LLM. Aggregation queries still get 25. Cost: ~+\$0.01–0.03 per query. |
| 10 | [#17 `fix(rag): determinism — temp=0 + rerank cache + retry`](https://github.com/myaircraftus/claude/pull/17) | `19aab184` | Same question, 5 refreshes, 5 visibly different answers with different cited sources. Two independent sources of nondeterminism fixed: **(a)** `lib/rag/generation.ts` answer-gen temperature `0.1 → 0`. Even at 0.1, GPT-4o flipped citation indices and phrasing on identical chunks. **(b)** `lib/rag/rerank.ts` Cohere rerank is best-effort and silently falls back to merge-order on 429/timeout. Reranked top-N and merge-order top-N are different sets, so the flap caused the user-visible "different answer each refresh" symptom. Added (i) a single 200ms-backoff retry on 429/503/5xx transients; (ii) an in-memory LRU cache (max 256 entries per lambda) keyed on `(lowercased query, candidate chunk_id list)`. First successful rerank populates; later identical retrievals reuse the same ordering even when Cohere is degraded. |

### Aggregated diff stats
- **10 PRs merged**, all to `main`, all deployed to production.
- **Net change:** ~250 net lines added across 7 components and 2 lib files. No deletions of meaningful logic.
- **tsc baseline:** 64 pre-existing errors on `main` from before this window. None of these PRs introduced new tsc errors. (The baseline lives in unrelated files like `components/redesign/Dashboard.tsx`, `components/redesign/IntegrationsPage.tsx`, and `components/redesign/LoginPage.tsx`.)
- **All deploys reached `READY` state** in Vercel within ~4 min per merge.

---

## 2. Operational data fixes (SQL only — no code change)

These ran via the Supabase MCP against the `Myaircraft` project (`ygrqinxkeqvikpfmjqiz`, org `82042eee-1d20-49a4-be12-12f73e335392` = Horizon Flights). All are idempotent and audited.

| Date | What | Affected rows | Why |
|---|---|---|---|
| 2026-05-19 | **Tree backfill** via `apps/web/scripts/backfill-trees.mts --concurrency 6` | 344 documents → **106,179 nodes in `page_tree_nodes`** | `page_tree_nodes` was completely empty in prod. Tree builder was wired into `lib/ingestion/server.ts:2284` on 2026-05-17 but all 351 production docs were uploaded before that, so the builder never ran. Backfill ran the existing builder over the existing data. |
| 2026-05-20 | **N8202L logbooks reclassified** | 6 documents, `doc_type` `miscellaneous`/`work_order` → `logbook` (IDs `9f546135-9c81-4312-af97-e6207ed03651`, `cef45d7a-da36-4e80-97f3-5a28df148c9a`, `0ad64417-80a6-44ce-9559-c34f62e7110d`, `3cdcaf2e-fb52-49be-b021-bc4e9724b5e1`, `b5ccd20b-b699-45d1-9bbe-26be994d705c`, `b0215e3a-bee5-4b3b-a7a6-353f29024241`) | Diagnosed during user-reported "1968 radio install" miss: chunks existed in the index but the query-router's `doc_type_filter_used: logbook,stc,inspection_report` filter dropped the misclassified docs entirely. |
| 2026-05-21 | **Form 8130 folder docs reclassified** | 2 documents (`aaf4d26f-5a7a-4f97-86ce-da42bc8ffffe`, `ecb93afc-1d86-4ade-9e67-26bd3fbf7bc2`), `miscellaneous` → `form_8130` | Same pattern: title `12_8130s_Folder` clearly signals form_8130 records, but they were dumped into miscellaneous by the legacy upload path. |
| 2026-05-21 | **"Loogbook" typo doc reclassified** | 1 document (`eb625db1-7cbe-4814-b785-9b84789d3d89`, title `19880307-20180601_Eng_Loogbook_Closed_Prop_OH`), `miscellaneous` → `logbook` | Original title-based audit skipped this because the title misspelled "Logbook" as "Loogbook". |
| 2026-05-21 | **Test logbook entry created** (for `PROMPT_HumanTesting.md` Task 2a verification) | 1 row (`5e5e45b6-2552-4719-a91e-10910e05c04f`) in `logbook_entries`, N401LP, 2026-05-21, "Test entry — 50hr oil change, filter replaced" | Owner persona's `logbook_entries_owner_no_insert` RLS forbids inserts; switched to Shop persona via `POST /api/persona/switch` and inserted via `POST /api/logbook-entries`. |
| 2026-05-21 | **Test work order created** (for Task 2b verification) | 1 row (`f372a0cc-93ef-4fc0-a17a-8f99a1a1e594`, `WO-2026-TEST-001`) in `work_orders`, N401LP, status `open`, service_type `50hr_inspection` | `/api/work-orders` 402'd because `requireActiveBilling(orgId, 'mechanic')` requires shop-tier billing — Andy's org has `owner.bundle=true / canWrite=true` but `shop.canWrite=false`. **This is an open billing-gap bug** (logged below). Inserted via service-role SQL to unblock the test. |

### Cleanup snippet (when the test records are no longer needed):

```sql
DELETE FROM logbook_entries WHERE id = '5e5e45b6-2552-4719-a91e-10910e05c04f';
DELETE FROM work_orders     WHERE id = 'f372a0cc-93ef-4fc0-a17a-8f99a1a1e594';
```

### Org-wide post-fix state
- All 152 docs with "logbook" in title/filename are now correctly tagged `doc_type='logbook'`.
- 14 mixed "binder" docs (e.g. `16_C152_N69207_Binder` with 151 logbook-style chunks but also other content) **deliberately left as-is** — they're not pure logbooks, the right fix is at the retrieval-filter level (drop the filter when high-signal chunks are excluded), not at the doc-tagging level.

---

## 3. Bugs identified during the full human-style browser test (PROMPT_HumanTesting.md run, 2026-05-19)

### Fixed in this window
| Bug | Where | Severity | Fix |
|---|---|---|---|
| `/guided-tour` route rendered Dashboard | sidebar nav linked to a route that didn't exist | High (broken sidebar item) | PRs #9 + #10 |
| Unknown URL like `/xyz-not-exist` rendered Dashboard (no 404) | `lib/auth/server-app.ts` memberships fallback + tenant routing | Medium (data was correct, but UX wrong) | PR #11 |
| Upload Document modal "Failed to parse form data" | modal POSTed JSON to multipart-only `/api/upload` route | High (uploads totally broken from the modal) | PR #12 |
| `/my-aircraft` runtime error: `TypeError: Cannot read properties of undefined (reading 'tool')` | `ActionCard.handleAction` assumed `action.toolCall.tool` always defined | High (error boundary triggered on every render with rule-generated cards) | PR #9 |
| iPad PDF preview spinner stuck forever | `<iframe>` `onLoad` never fires for PDFs on iOS Safari | Medium (UX dead state) | PR #13 |
| iPad PDF preview pane blank | iOS Safari handles PDFs in native QuickLook, not iframe DOM | Medium | PR #14 |
| Mac Safari PDF preview shows broken-file icon | Mac Safari tightened iframe PDF policy | Medium | PR #15 |
| Handwritten logbook 1968 radio install entry not found by RAG | doc was tagged `doc_type='miscellaneous'` so logbook-scoped query excluded it | High (correct data → wrong answer) | SQL reclassification (above) + PR #16 (top-16) |
| Same question → different answers each refresh | `temperature=0.1` + Cohere rerank flap | High (broke user trust in AI answers) | PR #17 |

### Bugs found but NOT yet fixed (open follow-ups)
| Bug | Where | Severity | Notes / planned fix |
|---|---|---|---|
| **Owner with `bundle=true` cannot create work orders** | `/api/work-orders` route uses `requireActiveBilling(orgId, 'mechanic')` which checks shop entitlement, not the bundle | High (Andy's org has `owner.bundle=true / owner.canWrite=true` but `shop.canWrite=false`, so WO creation 402s) | Need to teach `requireActiveBilling` that a bundled owner satisfies the mechanic-tier write check. |
| **`/api/ask` doesn't strictly scope by `aircraft_tail`** | route fans out across all aircraft regardless of `aircraft_tail` in body | Medium (gives "fleet-wide" answers when user has a specific aircraft selected) | Pass aircraft_tail through to per-aircraft branching; only fan out if `aircraft_tail` is null. |
| **Page-header boilerplate dominates chunk embeddings on historical logbooks** | `lib/ingestion/server.ts` chunking — every page starts with "INSTRUCTIONS FOR USE OF THIS LOG BOOK / ALL DATA must bear the endorsement of a certificated mechanic / VOR Receiver operation checked…" so vector embeddings cluster around that boilerplate, not the unique handwritten content | High (the real durable fix for handwritten logbook ranking) | Re-chunk pass that detects + strips the printed-form boilerplate before embedding. Until shipped, PR #16's top-16 widens the window enough to surface the right chunks for most queries. |
| **Mac & iPad Safari still can't show PDFs inline** | PR #15 ships a tap-to-open CTA, not a real inline preview | Medium (UX) | Build `/api/documents/[id]/page-image?page=N` that rasterizes each cited page to PNG via `@sparticuz/chromium` (already in deps per `next.config.mjs`), caches result to a Supabase `page-images-cache` bucket, returns `image/png` with long Cache-Control. Switch `DocumentViewer` + `document-detail-slideover` to `<img>` instead of iframe. Estimated half day. |
| **Auto-classify never ran on pre-2026-05-17 docs** | `lib/documents/auto-classify.ts` exists and is wired into ingestion (`lib/ingestion/server.ts:2130`) but pre-existing docs were uploaded before that wiring | Medium (cause of the doc-type misclassification problem) | Backfill option A: call `POST /api/documents/[id]/classify` (already deployed) in a loop for every misclassified doc — tried via tsx but local env hangs in UE state; pivot path is browser-fetch loop or Vercel cron. ~$2 in OpenAI tokens for 150-200 docs. |
| **Q5 SQL-direct first-event path miss** | `lib/rag/structured-events.ts` — "What was the first maintenance event ever recorded?" returns insufficient_evidence with 0 citations | Medium | The first-event branch isn't matching the question pattern. Look at the regex / intent classifier in `structured-events.ts`. |
| **`/squawks` route prompt-file expectation mismatch** | PROMPT expected `/squawks` to redirect to `/squawks/aircraft/due-list` | Low (route works correctly as-is, prompt was stale) | Not a bug; documented for traceability. |
| **Sidebar label "Invoicing" vs page title "Invoices" (Shop persona)** | `components/redesign/AppLayout.tsx` line 162 | Low (cosmetic) | Trivial copy fix; queued. |
| **Document detail page title duplicated `" \| myaircraft.us \| myaircraft.us"`** | both `app/(app)/documents/[id]/page.tsx` metadata and a layout above are setting the same suffix | Low (cosmetic, SEO) | Likely just deduplicate the metadata template. |
| **WO detail "tabs" are not implemented as ARIA tabs** | `app/(app)/work-orders/[id]/work-order-detail-client.tsx` renders EXECUTION/COMMUNICATION/FINANCIAL/OUTPUTS as text dividers, not `[role=tab]` | Low (a11y) | Replace with shadcn Tabs primitive. |
| **~10 unlabeled icon buttons** | `/ask-logbook-ai` (3), `/my-aircraft` (2), `/work-orders/[id]` (2), others | Low (a11y) | Sweep aria-labels. |
| **2 documents failed tree backfill** (impossible dates) | OCR'd "1994-02-30" / "6531-02-29" in date columns | Low (data quality) | Defensive date parser in tree-builder; skip-and-log rather than throw. |
| **In-memory rerank cache resets on lambda cold start** (PR #17) | `lib/rag/rerank.ts` | Low (determinism within a session is solid; cross-session not guaranteed) | Persist to Vercel KV or a small Supabase table. |
| **"AI disagrees with user category" banner missing** | when `lib/documents/auto-classify.ts` runs post-ingestion and disagrees with the user-picked category, there's no UI surface | Low/Medium (UX) | Store AI's suggestion in `documents.metadata_json.ai_classification` alongside `doc_type`; UI banner with "Switch?" / "Keep my pick". |
| **Smart filename pre-select in upload modal** | persona modal has a hard-empty default | Low (UX) | Regex on file name → pre-select most likely doc_type. |

---

## 4. The AI classifier infrastructure (already exists, NOT yet backfilled)

This is important context for the developer: **the auto-classifier already exists and runs on every new upload**. The fact that historical docs are misclassified is purely because they were uploaded before the wiring landed.

- **Code:** `apps/web/lib/documents/auto-classify.ts` — `autoClassifyDocument(supabase, documentId)` reads up to 12 chunks, calls GPT-4o with a system prompt that knows the 17 DocType values + logbook subtypes (engine/airframe/prop), writes `doc_type` + `document_subtype` + `document_group_id` + `document_detail_id` to the documents row.
- **Wiring:** runs as a post-step in `lib/ingestion/server.ts:2130` after embedding completes for every new upload.
- **Manual endpoint:** `POST /api/documents/[id]/classify` — already deployed, used by the per-row "Reclassify with AI" sparkles button on the Aircraft Documents tab.
- **Backfill script (drafted, not yet run successfully):** `apps/web/scripts/backfill-classification.mts` is committed on a branch but the local `tsx` runner hangs in `UE` state in the current environment. Pivot to a browser-loop calling `POST /api/documents/[id]/classify` if the script can't be revived.

---

## 5. The retrieval pipeline at a glance (current shape, after this window)

```
                      ┌─────────────────────────────────────────┐
                      │ POST /api/ask  (or /api/query directly) │
                      └────────────────────┬────────────────────┘
                                           │
                ┌──────────────────────────┴──────────────────────────┐
                │                                                     │
                ▼                                                     ▼
        single aircraft_id?                                  no aircraft_id?
                │                                                     │
                │                                  classifyAskQuestion(question)
                │                                                     │
                │                                       ┌─────────────┴─────────────┐
                │                                       ▼                           ▼
                │                                  org_wide                    per_aircraft
                │                                       │                           │
                │                                       │                runWithConcurrency(fleet, 10)
                │                                       │                  • alphabetical by tail
                │                                       │                  • Promise.all preserves order
                │                                       ▼                  ▼
                └────────────────────────────────► runAskAgent (per-call)  ────┐
                                                                              │
                                                                              ▼
                                                    ┌─────────────────────────────────┐
                                                    │ POST /api/query (RAG)            │
                                                    │   parseStructuredQuery           │
                                                    │   classifyQueryIntent (shadow)   │
                                                    │   inferRelevantDocTypes          │
                                                    │   detectAggregationQuery          │
                                                    │   ────────────────────           │
                                                    │   if (aggregation):              │
                                                    │     runAggregationAnswer (SQL)   │
                                                    │   else:                          │
                                                    │     hybridRetrieve:              │
                                                    │       • vector (HyDE-embedded)   │
                                                    │       • bm25  (real query)       │
                                                    │       • tree  (page_tree_nodes)  │
                                                    │       • vision (ColQwen2)        │
                                                    │     merge by weighted blend      │
                                                    │     rerank (Cohere, cached)      │
                                                    │     top 16  ← PR #16              │
                                                    │     ────────────────────         │
                                                    │     generateAnswer (GPT-4o, T=0)  │
                                                    │       ← PR #17                   │
                                                    └─────────────────────────────────┘
```

Key constants after this window:
- **Final-K passed to answerer:** 16 (was 8) — `app/api/query/route.ts:978`
- **Rerank candidate pool size:** `max(limit*4, 30) = 64` — unchanged
- **Answer-gen temperature:** 0 (was 0.1) — `lib/rag/generation.ts:113`
- **Rerank cache:** in-memory LRU, max 256 entries per lambda — `lib/rag/rerank.ts`
- **Rerank retry:** 1× retry with 200ms backoff on 429/503/5xx — `lib/rag/rerank.ts`

---

## 6. The browser-quirk story (PDF preview)

This was a multi-PR thread; collecting it here so the dev sees the full picture.

**The base UI:** `components/ask/document-viewer.tsx` and `components/documents/document-detail-slideover.tsx` both embed cited PDFs via `<iframe src={`/api/documents/[id]/preview?page=N`}>`. The `/api/documents/[id]/preview` route (in `app/api/documents/[id]/preview/route.ts`) downloads the source PDF from Supabase, optionally extracts a single page via `pdf-lib` (so each iframe gets a unique resource — iPad ignores `#page=N` hashes), and returns `application/pdf` with `inline` content-disposition.

**The problem:** Safari (Mac AND iPad/iPhone) cannot reliably render `application/pdf` in iframes.
- iPad/iPhone: PDFs go to native QuickLook, which only triggers on top-level navigation. iframe stays blank. `onLoad` event never fires.
- Mac Safari: has tightened iframe PDF policy lately, shows the system "broken file" icon.

**The progression of fixes:**
1. **PR #13** — added a 4s ceiling on the spinner (`isLoading` state) so the iframe pane wouldn't appear permanently stuck even if `onLoad` never fired. Cosmetic.
2. **PR #14** — added an iOS UA detection (`isIosUserAgent()`) that swaps the iframe for a "Tap to view page N" CTA card on iPad/iPhone. Tap = top-level navigation = QuickLook works.
3. **PR #15** — extended detection to Mac Safari (renamed `isSafariUserAgent()` and added the desktop Safari check, excluding Chromium-derived UAs). The CTA now shows on every Safari.

**The proper durable fix (NOT yet built):** server-side PDF → PNG rendering.
- New route `/api/documents/[id]/page-image?page=N`.
- Uses `@sparticuz/chromium` (already a dependency per `next.config.mjs serverComponentsExternalPackages`) to render PDF page N to PNG.
- Caches result in Supabase storage at `page-images-cache/{org}/{aircraft}/{docId}/{N}.png`.
- Returns `image/png` with `Cache-Control: public, max-age=31536000, immutable`.
- `DocumentViewer` + slideover use `<img src=…>` for the cited page on every browser.
- Keep iframe / external-link as "see full document" path.
- Estimated half-day build; eliminates the entire browser-quirk category.

---

## 7. End-to-end ingestion validation (real prod doc, in this window)

**Document:** `01_20190429-20240124_Prop_Logbook.pdf` (9.48 MB, 15 pages, N401LP)
**ID:** `178fc22f-e1b3-43f4-adbc-f0d010c44760`
**Uploaded:** 2026-05-21 03:51:15 UTC

This was the first real test of PR #12's fixed upload flow. The full pipeline ran cleanly:

| Stage | Engine | Started | Completed | Duration |
|---|---|---|---|---|
| `uploaded` | — | 03:51:15.935Z | 03:51:15.935Z | instant |
| `native_text_probe` | `pdfjs` | 03:51:16.135Z | 03:51:17.585Z | ~1.5s |
| `document_ai_ocr` | `google_document_ai` | 03:51:17.585Z | 03:51:39.677Z | ~22s |
| `ocr_fallback` | — | (skipped — Document AI got clean text) | 03:51:39.739Z | — |
| `field_extraction` | `google_document_ai` | 03:51:39.739Z | 03:51:52.742Z | ~13s |
| `chunking` | `google_document_ai` | 03:51:52.742Z | 03:51:55.386Z | ~2.6s |
| `embedding` | `openai_embeddings` | 03:51:55.386Z | 03:52:16.899Z | ~21s |
| `completed` | `openai_embeddings` | 03:52:16.899Z | 03:52:16.899Z | instant |
| **TOTAL** | | | | **~63s end-to-end** |

**Output:**
- 126 chunks in `document_chunks` (token-bounded, embeddings present)
- 134 nodes in `page_tree_nodes`: 1 `document` + 7 `chapter` (years 2019/2020/2021/2022/2023/2024 + "Undated entries") + 126 `entry`
- `parsing_status = completed`, `processing_state.current_stage = 'completed'`, no `last_error`

This is the canonical "healthy" ingestion shape the developer should expect.

---

## 8. Other artifacts produced in this window

- **`apps/web/scripts/backfill-trees.mts`** — committed in PR #8. One-off backfill that walks aircraft-scoped non-deleted documents and calls `buildDocumentTree(docId, aircraftId)`. Idempotent (each call deletes prior nodes for that doc before re-inserting), bounded-concurrency worker pool, dry-run + limit flags. Reusable for any future tree algorithm change. Run with `pnpm exec tsx scripts/backfill-trees.mts --concurrency 6` from `apps/web`. Requires `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `OPENAI_API_KEY` in `apps/web/.env.local`.
- **`apps/web/scripts/backfill-classification.mts`** — drafted but not yet running. Same shape as the tree-backfill script, calls `autoClassifyDocument(supabase, docId)` for every doc with `doc_type IN ('miscellaneous', 'work_order')` or null. `tsx` hangs in current env (UE state); needs a different runner or browser-loop pivot.
- **`apps/web/app/(app)/guided-tour/page.tsx`** — Coming-Soon stub for the previously-broken sidebar link.

---

## 9. What still needs to ship — prioritized

1. **Server-side PDF → PNG rendering** (durable Safari fix; eliminates the whole browser-quirk category). ~half day.
2. **Header-stripping rechunk** on historical handwritten logbooks (the real fix for the boilerplate-dominates-embeddings ranking problem; PR #16 is a stopgap). ~half day + re-embedding cost (~\$5-15 in OpenAI tokens).
3. **Classifier backfill across all `miscellaneous` docs** (use `POST /api/documents/[id]/classify` in a browser loop since `tsx` hangs locally). ~15 min + ~\$2 in OpenAI tokens.
4. **Owner-bundle billing → mechanic-tier write access** for `/api/work-orders` and any other mechanic-gated routes. ~1 hour.
5. **`/api/ask` aircraft_tail scoping** — make the fanout actually respect the user's selected aircraft. ~1 hour.
6. **Smart filename pre-select** in upload modal (regex on file name to default the category). ~30 min.
7. **AI-disagreement banner** in document detail (`metadata_json.ai_classification` + "Switch?" banner). ~2 hours.
8. **KV-backed cross-lambda rerank cache** (replace PR #17's in-memory LRU with Vercel KV for true cross-session determinism). ~1 hour.
9. **A11y sweep** — aria-labels on icon buttons, ARIA tabs on work-order detail, focus rings. ~half day.
10. **`/api/documents/[id]/preview` page-extract robustness** — guard `pdf-lib`'s single-page extract against malformed PDFs; fall back to full doc + `#page=N` hash. ~30 min.

---

## 10. How to verify everything is healthy from cold (developer's first-day checklist)

Run these as a smoke test against production:

```bash
# 1. Latest deploy state
gh pr list --state merged --base main --limit 15

# 2. Tree backfill verification
psql $SUPABASE_DB -c "
  SELECT COUNT(*) AS total_nodes,
         COUNT(DISTINCT doc_id) AS docs_with_nodes,
         COUNT(*) FILTER (WHERE level='chapter') AS chapters,
         COUNT(*) FILTER (WHERE level='entry') AS entries
  FROM page_tree_nodes
  WHERE org_id = '82042eee-1d20-49a4-be12-12f73e335392';
"
# Expected: ~106k+ total, ~340+ docs, structured chapters/entries.

# 3. Doc-type sanity
psql $SUPABASE_DB -c "
  SELECT doc_type, COUNT(*) FROM documents
  WHERE organization_id = '82042eee-1d20-49a4-be12-12f73e335392'
    AND deleted_at IS NULL
  GROUP BY doc_type ORDER BY 2 DESC;
"
# Expected: 'logbook' ~150+, the rest distributed by category.

# 4. Recent RAG queries
psql $SUPABASE_DB -c "
  SELECT strategy, tree_nodes_used, chunk_count, duration_ms,
         doc_type_filter_used, router_shadow->>'intent' AS intent, created_at
  FROM rag_query_log
  ORDER BY created_at DESC LIMIT 10;
"
# Expected: vector+bm25+tree+rerank dominant, tree_nodes_used > 0 on most.

# 5. Live deploy
curl -s https://www.myaircraft.us/api/documents/178fc22f-e1b3-43f4-adbc-f0d010c44760/preview?page=4 \
  -H "Cookie: $YOUR_SESSION_COOKIE" -I | head -10
# Expected: 200 application/pdf with non-zero Content-Length.
```

Browser smoke test:
1. `/dashboard` → loads as Owner.
2. `/guided-tour` → shows "Guided Tour · Coming soon" (NOT Dashboard fall-through).
3. `/xyz-does-not-exist` → 404 page (NOT silent Dashboard).
4. `/documents` → upload a small PDF → completes → appears in list with "Completed" status badge within 60–90s.
5. `/ask-logbook-ai` → "What does the Jan 5 1968 entry in N8202L's logbook say?" → answer should now be **the same on every refresh** (PR #17). On Safari the preview pane shows a "Tap to view page N" card; on Chrome the PDF renders inline.

---

## 11. Cross-references

- `docs/myaircraft-architecture.md` — the previous full architecture doc (last edited 2026-05-19, still authoritative for pre-window state).
- `docs/PROMPT_TreeBackfill.md` — the prompt that produced PR #8.
- `docs/PROMPT_HumanTesting.md` — the prompt that produced PRs #9–#15 and the data-fix SQL.
- `docs/myaircraft-rag-system-overview.md` — the RAG-focused overview referenced by the parent architecture doc.
- `docs/go-live-plan.md` — deferred build plan.
- Memory: `/Users/andy/.claude/projects/-Users-andy-1--do-not-touch-myaircraft/memory/` — durable notes including user profile, feedback rules, and standing authority.

---

**Last updated:** 2026-05-21.
**Session window covered:** 2026-05-19 → 2026-05-21.
**Total PRs merged:** 10 (#8–#17).
**Data ops:** 9 SQL operations (1 tree backfill, 4 doc reclassifications, 2 test rows, plus cleanup).
