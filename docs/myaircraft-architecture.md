# myaircraft.us — Full-Stack Architecture & Onboarding Guide

**Audience:** a developer seeing this codebase for the first time.
**Purpose:** explain the whole system end-to-end — front end, back end, the
document-ingestion pipeline, the RAG / "Ask Logbook AI" query engine, the data
model, the production build, and what was recently fixed and shipped.

Last updated: 2026-05-19.

---

## 1. What the product is

myaircraft.us is a SaaS for **aircraft maintenance records**. Two kinds of users:

- **Owner** — an aircraft owner. They upload their aircraft's paper logbooks and
  records, and they are the read-only customer of a maintenance shop.
- **Shop** — a maintenance shop (mechanics, service writers, admins). They do
  the maintenance work: work orders, estimates, invoices, parts, workforce.
- **Admin** — platform administration.

The headline AI feature is **"Ask Logbook AI"**: a user asks a plain-English
question ("how many annual inspections has this aircraft had?", "when were the
magnetos last serviced?") and the system answers it from the actual uploaded
documents, with **citations** that open the exact source PDF page.

Under the hood that means two hard problems, and the architecture is shaped by
them:

1. **Ingestion** — turn a messy scanned PDF (often handwritten logbooks) into
   clean, searchable, structured data.
2. **Retrieval (RAG)** — given a question, find the right evidence across
   potentially thousands of document chunks and generate a grounded answer.

---

## 2. Technology stack

| Layer | Technology |
|---|---|
| App framework | **Next.js 14** (App Router), TypeScript |
| Repo | pnpm monorepo (Turbo); the app lives in **`apps/web`** |
| Database | **Supabase** — Postgres 17 + **pgvector** |
| Auth | Supabase Auth (session cookies, `@supabase/ssr`) |
| File storage | Supabase Storage buckets: `documents`, `vision-pages`, `avatars` |
| Hosting | **Vercel** — auto-deploys on push to `main` |
| Embeddings | OpenAI **`text-embedding-3-large`** (1536-dim) |
| Generation | OpenAI **`gpt-4o`** (answers + the agent), **`gpt-4o-mini`** (HyDE, contextual blurbs, classification) |
| Reranker | **Cohere `rerank-v3.5`** cross-encoder |
| Vision embeddings | **ColQwen2** on **Modal** GPU (page-image retrieval) |
| OCR | **Google Document AI** (primary) → **AWS Textract** (fallback) → **GPT-4o vision** re-transcription (new, gated) |
| Payments | Stripe |
| Integrations | Click-to-OAuth directory (Google Drive, QuickBooks, FreshBooks, …) |

Everything is one deployable Next.js app — the "back end" is Next.js **API
routes** and **server components**; there is no separate backend service except
the OCR parser and the Modal GPU worker.

---

## 3. Repository layout

```
apps/web/
  app/
    (app)/        Authenticated application (dashboard, aircraft, work orders, …)
    (auth)/       Login / signup
    (marketing)/  Public marketing site
    demo/         Interactive demo (mock data, no login)
    api/          All API routes (the "back end")
  components/     React components (redesign/, home/, documents/, work-orders/, …)
  lib/            Business logic — the real engine
    ingestion/    The document-ingestion pipeline
    rag/          Retrieval, reranking, contextual, BM25, HyDE, tree, aggregation
    ocr/          OCR segment building, validation, rescore
    vision/       Vision RAG (ColQwen2 page-image retrieval)
    ai/           AI helpers (OpenAI vision, cards, classifiers)
    intelligence/ Compliance / pre-buy / AD reporting layer
    auth/         Tenant routing, session helpers
    billing/      Stripe, trials, paywall, per-persona entitlements
  scripts/        Eval harnesses (rag-eval.mjs, wave2-eval.mjs), maintenance scripts
supabase/migrations/   All DB schema migrations (timestamped .sql files)
docs/                  This file + the RAG system overview + the go-live plan
.github/workflows/     CI (the RAG retrieval-recall gate)
```

---

## 4. Front-end architecture

### 4.1 Route groups

The App Router is split into four groups:

- **`(marketing)`** — public pages (home, features, pricing, about, terms).
- **`(auth)`** — login, signup, onboarding.
- **`(app)`** — the authenticated product. Everything behind login.
- **`demo/`** — a fully interactive demo backed by mock data (`app/demo/_lib/mockData.ts`)
  so prospects can click around without an account.

### 4.2 Auth & multi-tenant routing

- **`middleware.ts`** runs on every request. It establishes the Supabase
  session and decides routing.
- **`lib/auth/tenant-routing.ts`** is the multi-tenant brain. The first path
  segment is classified as **either a real app route or an organization
  tenant-slug** using the `RESERVED_TOP_LEVEL_SEGMENTS` allowlist. Real routes
  pass through; tenant-slug paths are `rewrite()`-ten to the tenant-scoped view.
- **Important known behavior:** a genuinely unknown route (e.g. `/xyz`) is
  classified as a tenant slug and the tenant fallback lands the user on their
  dashboard rather than a 404. Fixing that needs a DB existence check in
  middleware — tracked in `AUDIT_REPORT.md`, not yet done.

### 4.3 The persona model

The runtime **persona** is `owner | shop | admin`. (Historically there was a
separate `mechanic` persona; it was merged into `shop` — migration 119 / the
"persona consolidation" pass. `mechanic` still legitimately exists as an *org
role* and a Stripe SKU, just not as a UI persona.)

- **`usePersona()`** (`lib/persona/use-persona.ts`) is the single accessor.
  Every UI surface that branches on persona reads it through this hook.
- It reads from **`AppContext`**, which hydrates the persona on mount and
  persists changes to `/api/me/persona`.
- The persona drives which sidebar renders, which agent tools are available,
  and which modules are visible.

### 4.4 The app shell & navigation

`components/redesign/AppLayout.tsx` is the authenticated shell. It defines two
sidebar nav trees:

- **`OWNER_NAV`** — Dashboard, Ask Logbook AI, **AIRCRAFT** section (Aircraft,
  Due List, Squawks, Estimates, Work Orders, Invoices, Logbook Entry,
  Approvals, Intelligence), Documents, **ECONOMICS** section, **EXPIRATION**
  section, Reports.
- **`SHOP_ADMIN_NAV`** — Dashboard, **AIRCRAFT** section, **PARTS & INVENTORY**
  section, Documents, **EXPIRATION** section, **WORK FORCE** section,
  Marketplace, Reports.

Sections are collapsible; the section's first child is its landing page.

### 4.5 Key app surfaces

- **`/my-aircraft` — the "Smart Home" screen.** Persona-aware. `page.tsx`
  (a server component) fetches aircraft + meter readings + open squawks +
  nearest-expiring doc, runs `generateProactiveCards()`, and mounts
  **`<SmartHome>`** which renders:
  - **`AIGreeting`** — time-aware greeting ("Good morning, Andy…").
  - **`ActionCardStack`** — the embeddable **AI Inbox** (`useAIInbox()` polls
    `/api/ai/inbox`; each card is an `ActionCard` with tap-to-do actions).
  - **`AircraftCard`** grid — one tile per aircraft (Hobbs/Tach, squawks,
    next expiry).
- **Work orders** — `/work-orders` list + `/work-orders/[id]` detail. The
  detail screen is a large client component with a 15-tab strip grouped into
  4 labelled sections (Execution / Communication / Financial / Outputs), an
  inline chat composer (`wo-chat-timeline`), checklist, timer, and quick
  add-part / add-labor forms.
- **Documents** — `components/documents/`: a documents table with status
  badges, an upload dropzone, and a detail slide-over with an **inline PDF
  preview**.
- **List views** — costs, estimates, logbook entries, manuals, tools, parts,
  etc. — each a consistent search-box + filter + table pattern.
- **Voice & camera** — `VoiceButton` (mic → `/api/voice/transcribe`) and
  `CameraButton` are available on home + work-order surfaces.
- **Billing** — `BillingProvider`, per-persona trials, a paywall screen, the
  bundle SKU, and anti-abuse logic.

### 4.6 How an answer is displayed

When "Ask Logbook AI" returns an answer it contains inline **`[N]` citation
markers**. The UI renders each `[N]` as a clickable link that opens the cited
page of the source PDF in a side panel, with the exact source span
highlighted. The response also carries `confidence`, `follow_up_questions`,
and `warning_flags`.

---

## 5. The document-ingestion pipeline

**Entry point:** `lib/ingestion/server.ts` → `ingestDocumentInline(documentId)`,
run as a background job after upload. Each stage is tracked on the `documents`
row via `markDocumentProcessingStage`.

```
User uploads a PDF
   │
 1 ▼  Upload — /api/upload or /api/upload/complete
        • persona × doc-type "Iron Wall" permission check
        • file → `documents` storage bucket; `documents` row created
   │
 2 ▼  Native-text probe
        • a digital PDF with real embedded text? → use that text, skip OCR
   │
 3 ▼  OCR (scanned documents)
        • Google Document AI extracts text  (strong on print, weak on handwriting)
        • AWS Textract is the fallback if Document AI fails
   │
 4 ▼  Vision-OCR re-transcription   ★ NEW — gated OFF by VISION_OCR_RETRANSCRIBE
        • garbled handwritten logbook pages are re-transcribed by GPT-4o vision
        • see §7 for the full description
   │
 5 ▼  Persist OCR artifacts
        • one `document_pages` row per page (text, confidence, classification)
        • `ocr_page_jobs`, `ocr_entry_segments`
   │
 6 ▼  Field / event extraction
        • structured maintenance events → `ocr_extracted_events`
          (event_date, event_type, work_description, tach/airframe time,
           AD/part references, mechanic — all start `review_status = 'pending'`)
   │
 7 ▼  Chunking — page text → `document_chunks` (~100 tokens each)
   │
 8 ▼  Embedding — OpenAI text-embedding-3-large → `document_embeddings`
   │
 9 ▼  Canonical layer
        • a curated/deduplicated subset → `canonical_document_chunks`
          + `canonical_document_embeddings`
        • THIS is the layer the live vector search actually queries
   │
10 ▼  Contextual retrieval (Wave 2)
        • each canonical chunk gets a `context_text` blurb (identifier line +
          1-2 sentence gpt-4o-mini summary + AD/part/date identifiers)
        • the embedding is regenerated over `context_text || chunk_text`
        • `chunk_text` itself is never modified — it stays the verbatim source
   │
11 ▼  Keyword + tree indexes
        • BM25 keyword index — per-aircraft + an org-wide "reference" index
        • PageIndex hierarchical tree → `page_tree_nodes`
   │
12 ▼  Vision RAG dispatch  (async, gated by VISION_AUTO_DISPATCH)
        • each page → PNG image (rendered out-of-band by a Colab/Modal GPU
          worker) → ColQwen2 embedding → `vision_pages` / `vision_embeddings`
        • lets a page be FOUND even when its OCR text is gibberish
   │
13 ▼  Event approval → logbook + intelligence
        • when an `ocr_extracted_events` row becomes `approved`, the DB trigger
          `promote_approved_event_to_logbook` fires and idempotently creates:
            – a `logbook_entries` row  (status `historical`, owner-visible)
            – a `maintenance_events` row  (the intelligence/reports data store)
```

**End state:** the document is searchable (text + vision), the owner's logbook
is populated, and the compliance/intelligence layer has data.

---

## 6. The query / RAG path — how a question is answered

Two layers: **`/api/ask`** (the conversational agent) calls **`/api/query`**
(the RAG engine).

### 6.1 `/api/ask` — the AI Command Center

1. Auth, organization resolution, rate limit (15/min/IP).
2. Resolve **persona** — this picks the agent's tools.
3. A **GPT-4o tool-calling agent** runs (max 3 rounds). Owner persona gets the
   `search_documents` tool; shop persona also gets `create_logbook_entry`,
   `search_parts`, `search_logbook`, `generate_checklist`.
4. **Scope.** One aircraft → run against it. "All Aircraft" → `classifyAskQuestion`
   decides `org_wide` (one pass) vs `per_aircraft` (fan-out — one agent pass
   per aircraft in parallel, results merged with renumbered `[N]` citations).
5. The `search_documents` tool calls `/api/query` internally.

### 6.2 `/api/query` — the RAG engine

```
 1  Auth, org context, monthly query-quota check
 2  P0 SECURITY — verify a body-supplied aircraft_id belongs to the caller's org
 3  Structured query parse (parseStructuredQuery)
       extracts a cleaned query + explicit signals: doc-type tokens, AD/SB
       numbers, part numbers, ATA chapters, the aircraft tail, date ranges
 4  Doc-type pre-filter — applied as a soft 0.5× score demotion, never a hard cut
 5  Aggregation detection — count / list / sum / first / last
 6  SQL-DIRECT FAST PATHS   ★ see §7
       • count (aircraft-scoped, resolvable topic) → answered by exact SQL
         count(*); hybrid retrieval is SKIPPED entirely
       • grand-total first/last → answered by exact ORDER BY event_date
 7  HyDE — gpt-4o-mini writes the hypothetical logbook entry that would answer
       the question; the VECTOR search uses the HyDE embedding (it sits closer
       to real logbook text); BM25 + tree keep the real query terms
 8  Hybrid retrieval (hybridRetrieve) — FOUR retrievers run concurrently:
       • Vector — search_canonical_documents RPC (cosine ANN over the Wave-2
         contextual canonical embeddings), org-scoped
       • BM25   — per-aircraft index + org reference index
       • PageIndex tree — hierarchical section-tree match (page_tree_nodes)
       • Vision — ColQwen2 page-image ANN + MaxSim re-rank (8s timeout)
 9  Merge + weighted blend — dedupe by chunk_id; score =
       vector·0.45 + bm25·0.35 + tree·0.20 + vision·0.25(bonus); then the
       doc-type soft demotion
10  Cross-encoder rerank — Cohere rerank-v3.5 re-orders a wide candidate pool
       by true relevance; keeps the top N
11  Answer generation (generateAnswer) — GPT-4o writes the answer grounded ONLY
       in the retrieved chunks, emitting inline [N] citation markers.
       Aggregation answers are built from the deduplicated structured-event list.
12  Citation anchoring — resolve each [N] to a document/page/snippet/bounding box
13  Confidence — high / medium / low / insufficient_evidence; capped at `low`
       if no citation actually resolved (an ungrounded answer can't claim high)
```

### 6.3 How poor OCR quality is currently handled

Garbled handwriting is the known weak point. It is mitigated three ways:
**vision RAG** (a page can be found by its image even if its text is gibberish),
**contextual retrieval** (the identifier blurb makes a garbled chunk findable by
aircraft / AD / part number), and **honest confidence** (weak evidence →
`low` / `insufficient_evidence`, never a fabricated answer). The **real fix** is
the new Vision-OCR re-transcription (§7).

---

## 7. RAG Next-Wave — what was just shipped (2026-05-19)

A planned improvement program. An investigation first established what was
**already done** so nothing was rebuilt:

| Improvement | Status found | Notes |
|---|---|---|
| CI eval harness | **Already done** | `.github/workflows/rag-eval.yml` runs `wave2-eval.mjs` on retrieval-path PRs |
| BM25 concurrent-write race | **Already done** | `bm25-index.ts` fingerprint-and-retry guard closes the race |
| PageIndex hierarchical tree | **Already done** | `page_tree_nodes` built at ingestion; used at query time |
| SQL-direct answers | **Partial** | only `count` was SQL-direct |
| Vision-OCR re-transcription | **Not started** | built now — Improvement 1 |
| Dual-embedding (HyDE + real blend) | Not started | deferred |
| Semantic answer cache | Not started | deferred |

Two improvements were then built and shipped (merge `ae690c23`):

### Improvement 1 — Vision-OCR re-transcription  (`lib/ingestion/vision-retranscribe.ts`)

Google Document AI garbles handwritten scanned logbook pages. A pilot
(`scripts/ocr-pilot.mjs`) showed GPT-4o vision beats Document AI on **37 of 40**
random logbook pages. So: Document AI stays the cheap first pass, and GPT-4o
**re-transcribes only the garbled pages**.

- **Trigger:** handwritten logbook page classification **+** a low-confidence /
  high-gibberish signal. (Page classification is the gate — the pilot showed a
  gibberish ratio alone is a poor discriminator.)
- **Transport:** `pdf-lib` extracts the page into a one-page PDF (headless, no
  canvas binding) and sends it to GPT-4o as a file input. *Why:* the app has no
  page-image renderer — `lib/vision/renderer.ts` is a stub, and real page PNGs
  are produced asynchronously by the external GPU worker, so no inline image is
  available at ingestion time.
- **Placement:** runs *before* chunking — it mutates the in-memory OCR text, so
  the clean text flows into `document_pages`, the OCR entry segments, and the
  canonical retrieval layer with no replace-and-rerun. A re-transcribed page's
  `ocr_confidence` is set to 0.95 so its derived segments clear the 0.86
  canonical-chunk gate.
- **Gated OFF by default.** Set **`VISION_OCR_RETRANSCRIBE=true`** to enable.
  Best-effort: any failure leaves the original OCR text untouched and never
  blocks ingestion. Forward-only.
  - ⚠️ **Do not enable in production** until a test upload of a handwritten
    logbook confirms the re-transcription quality.

### Improvement 2 — SQL-direct first/last + count early-return  (`app/api/query/route.ts`, `lib/rag/structured-events.ts`)

- **count** queries already answered from an exact SQL `count(*)` — but
  `/api/query` still ran the full four-retriever hybrid pass first and then
  *discarded* the chunks. Now a count question scoped to one aircraft with a
  resolvable topic **skips that retrieval entirely** (a latency/cost win;
  the answer is byte-identical).
- **first/last** — a grand-total first/last ("most recent maintenance record",
  "first logbook entry") is now answered by an exact `ORDER BY event_date`
  query (`firstLastMaintenanceEvent`). A *work-type* first/last ("last annual")
  deliberately stays on the LLM-extraction path, because `event_type` /
  `description` are free text and an ILIKE could pick a record that merely
  *mentions* the term. On any miss it falls through to the existing path —
  zero regression.

**Verification status:** `tsc` clean; the CI retrieval-recall gate
(`wave2-eval.mjs`) passed; the production Vercel build passed; the new
`firstLastMaintenanceEvent` SQL was confirmed correct against live production
data. The full 23-case `rag-eval.mjs` answer-accuracy harness was **not** run
(it needs an authenticated session cookie) — it remains an optional, non-
blocking post-merge check, and `git revert -m 1 ae690c23` is the one-line undo.

---

## 8. What is strong now

- **Hybrid retrieval, not just vectors.** Four independent retrievers (vector,
  BM25, PageIndex tree, vision) plus a Cohere cross-encoder rerank — far more
  robust than a single embedding search.
- **Contextual retrieval (Wave 2).** Every canonical chunk carries an
  identifier + summary blurb. Measured retrieval recall@20 jumped roughly
  **4×**: aircraft-scoped page-recall 8% → 31%, document-recall 15% → 62%.
- **Structured truth for counts & history.** `maintenance_events` (~2,300 real
  rows) and `logbook_entries` (~2,300) are populated from a single source
  (`ocr_extracted_events`) via a DB trigger. Count and first/last questions are
  answered by exact SQL, not by an LLM counting excerpts.
- **Honest confidence.** An answer with no resolved citation is capped at `low`
  confidence — the system says what it doesn't know instead of fabricating.
- **Org isolation (P0 security).** `/api/query` verifies any body-supplied
  `aircraft_id` belongs to the caller's org, and chunk hydration is
  org-filtered — closing a cross-org data-leak.
- **A regression gate in CI.** Every PR touching retrieval code runs
  `wave2-eval.mjs` against DB-verified questions — a recall regression can't
  silently merge.
- **Vision fallback for bad OCR.** Page images are embedded, so a page is
  findable even when its OCR text is gibberish; and now (gated) GPT-4o can
  re-transcribe that text at the source.
- **Type-safe build.** `tsc` is clean and `next.config` no longer ignores
  build errors.

---

## 9. Known gaps & deferred work

| Item | Status |
|---|---|
| **Enable Vision-OCR** (`VISION_OCR_RETRANSCRIBE`) | Shipped dark — enable after a quality test upload |
| **Full `rag-eval.mjs`** (23-case answer-accuracy) | Optional post-merge check; needs a session cookie to run |
| **Dual-embedding** (blend HyDE + real-query vectors) | Deferred — measure-first; marginal expected gain |
| **Semantic answer cache** (All-Aircraft fan-out) | Deferred — premature pre-go-live; correctness risk |
| **`router-classifier.ts`** intent router | Built but intentionally NOT wired into `/api/query` — a separate eval-gated change |
| **`document_chunks` staleness after re-transcription** | The raw keyword-fallback layer keeps the parser's original text; the canonical (retrieval) layer gets the corrected text |
| **Unknown route → dashboard** | A genuinely unknown URL resolves to the dashboard, not a 404 — needs a tenant-existence check in middleware |
| **Wave 3C — applicability engine** | Not started; safety-critical, deferred to a reviewed session |
| **Dormant modules** (inspections, meter readings, expiration tracking) | Tables/UI scaffolded, no workflow yet |

---

## 10. Data model — key tables

| Table | Role |
|---|---|
| `documents` | Uploaded files + metadata + processing state |
| `document_pages` | Per-page OCR text, confidence, classification, image path |
| `ocr_extracted_events` | Structured maintenance events from OCR — the single source of truth |
| `document_chunks` / `document_embeddings` | Raw chunk text + embeddings (keyword-fallback layer) |
| `canonical_document_chunks` / `canonical_document_embeddings` | The curated layer the live vector search uses; carries Wave-2 `context_text` |
| `page_tree_nodes` | PageIndex hierarchical section tree |
| `vision_pages` / `vision_embeddings` | Page images + ColQwen2 visual embeddings |
| `logbook_entries` | Owner-facing logbook — `historical` (OCR-transcribed) + mechanic-authored |
| `maintenance_events` | The intelligence/reports layer's event store |
| `compliance_items` / `aircraft_ad_applicability` | Compliance + AD tracking |
| `queries` / `citations` | Stored Q&A history + resolved citations |
| `work_orders` / `work_order_lines` / … | Shop operations |

**One source, two projections:** `ocr_extracted_events` is the single source;
on approval the `promote_approved_event_to_logbook` trigger projects it into
`logbook_entries` (owner-facing) **and** `maintenance_events` (intelligence).

---

## 11. Production build & deployment

### 11.1 Pipeline

- **Hosting:** Vercel, project `myaircraft01`. The repo is GitHub
  `myaircraftus/claude`, app root `apps/web`.
- **Auto-deploy:** every push to **`main`** triggers a **production** build and
  deploy; every PR / branch push triggers a **preview** deploy.
- **Build:** `next build` (Next.js 14). Type checking is enforced —
  `next.config.mjs` no longer sets `ignoreBuildErrors`.
- **Branch → review → merge:** feature branch → PR → CI checks → merge to
  `main` (merge commit) → production deploy.

### 11.2 CI gate

`.github/workflows/rag-eval.yml` — the **RAG retrieval-recall gate**. On any PR
that touches retrieval-path code (`apps/web/lib/rag/**`, `app/api/query/**`,
`app/api/ask/**`, `lib/ingestion/**`, migrations) it runs `scripts/wave2-eval.mjs`,
which checks that DB-verified questions still return the gold (document, page)
from the `search_canonical_documents` RPC. It is read-only and skips cleanly on
fork PRs that lack secrets.

### 11.3 Local checks before merge

- `npx tsc --noEmit` — must be 0 errors. (Run with
  `NODE_OPTIONS="--max-old-space-size=8192"` on large checkouts.)
- A local `next build` will fail at the static-export of a couple of
  Supabase-touching pages **if `.env.local` is absent** — that is an
  environment limitation, not a code defect; the Vercel build (with env vars)
  is the authoritative build gate.

### 11.4 Eval harnesses

- **`scripts/wave2-eval.mjs`** — retrieval-recall tripwire (RPC level). Runs in
  CI. Read-only.
- **`scripts/rag-eval.mjs`** — full 23-case answer-accuracy harness. Hits
  `/api/ask`, so it needs `RAG_EVAL_COOKIE` (an authenticated session cookie)
  and `RAG_EVAL_BASE_URL`. Run it manually before/after a retrieval change.

### 11.5 Environment variables (selected)

| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, … | Supabase |
| `OPENAI_API_KEY` | Embeddings + generation |
| `COHERE_API_KEY` | Reranker (absent → transparent no-op) |
| `VISION_AUTO_DISPATCH` | Enables async vision-page embedding dispatch |
| **`VISION_OCR_RETRANSCRIBE`** | **NEW** — `true` enables GPT-4o vision OCR re-transcription |
| `VISION_OCR_CONFIDENCE_THRESHOLD` / `VISION_OCR_GIBBERISH_THRESHOLD` | Optional re-transcription trigger tuning |
| Stripe / Google / QuickBooks keys | Payments + integrations |

---

## 12. Recent change history (production)

In rough order, all shipped to `main` and live:

1. **Enterprise audit** — P0 security fix (cross-org leak), admin-review freeze
   fix, performance, navigation, DB hardening (indexes, primary keys, RLS).
2. **RAG Wave 1** — Cohere reranker, org reference BM25 index, soft doc-type
   filter, persona "Iron Wall" upload parity, Vision RAG, the eval harness;
   plus HyDE, aggregation multi-step retrieval, and All-Aircraft fan-out.
3. **RAG Wave 2** — Contextual Retrieval (all 11,111 canonical chunks
   contextualized + re-embedded; ~4× recall lift).
4. **Logbook Phase 1 + 2** — `historical` logbook entries; 2,323 OCR events
   promoted to owner-visible entries; the auto-promote DB trigger.
5. **RAG Wave 3B** — `maintenance_events` backfilled (intelligence layer
   bridged); 8 intelligence files' column names fixed.
6. **Persona consolidation** — `mechanic` UI persona merged into `shop`; a
   clean 3-persona model; ~42 latent bugs fixed.
7. **tsc → 0** — all type errors resolved; `ignoreBuildErrors` removed.
8. **UI bug pass** — UUID guard on dynamic aircraft routes, a global 404 page,
   the 4-section work-order tab grouping, `/workforce` index redirect.
9. **Route-allowlist fix** — `/squawks`, `/sop-library`, `/styleguide` were
   silently rendering the dashboard (a tenant-routing allowlist gap); plus a
   crash fix in the AI action-card.
10. **Final pass** — sidebar nav labels, a `/my-aircraft` hydration fix
    (`VoiceButton`), `SELECT *` → explicit columns on the flights endpoint,
    `React.memo` on list components, and an accessibility sweep (aria-labels,
    focus rings, form-input labels).
11. **RAG Next-Wave** *(this document's headline)* — Vision-OCR re-transcription
    (shipped dark) + SQL-direct first/last + count-query early-return.

---

## 13. Where to start reading the code

| To understand… | Start at |
|---|---|
| Ingestion | `lib/ingestion/server.ts` → `ingestDocumentInline` |
| Vision-OCR re-transcription | `lib/ingestion/vision-retranscribe.ts` |
| The RAG query engine | `app/api/query/route.ts` |
| The conversational agent | `app/api/ask/route.ts` |
| Retrieval / rerank / HyDE / BM25 / tree | `lib/rag/` |
| Structured count/first/last | `lib/rag/structured-events.ts` |
| The app shell & nav | `components/redesign/AppLayout.tsx` |
| The home screen | `app/(app)/my-aircraft/page.tsx` + `components/home/` |
| Multi-tenant routing | `middleware.ts` + `lib/auth/tenant-routing.ts` |
| The data model | `supabase/migrations/` |
| The system overview (RAG-focused) | `docs/myaircraft-rag-system-overview.md` |
| Deferred build plan | `docs/go-live-plan.md` |
```
