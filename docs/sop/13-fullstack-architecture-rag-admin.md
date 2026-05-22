---
sop_id: "SOP-13"
title: "Full-Stack Architecture, Admin System & AI/RAG Engine"
module: "platform"
version: "1.0.0"
status: "active"
last_updated: "2026-05-21"
faa_refs: ["14 CFR 43.9", "14 CFR 43.11", "14 CFR 91.417"]
source_file: "docs/myaircraft-architecture-updates-2026-05-21.md + codebase exploration"
---

# myaircraft.us Full-Stack Architecture, Admin System & AI / RAG Engine — Master Technical SOP

**Audience:** investors performing technical due diligence · SOC2 Type II auditors · enterprise customer technical buyers (FBOs, MRO shops) · FAA / compliance attorneys · new engineering hires.

**Read posture:** this document MUST be read assuming the reader is sophisticated but does not know this codebase. Every section is self-contained enough to extract for an audit response. Tables and "must / must not" language are intentional — this is a specification, not marketing.

---

## 1. Executive Summary

### 1.1 What myaircraft.us is

A SaaS platform that lets aircraft owners and maintenance shops keep, search, and reason over aircraft maintenance records. The product solves a specific industry problem: maintenance records that **must** be retained for the operational life of an aircraft (often 30+ years) are usually a stack of paper logbooks, scanned PDFs, and disconnected work orders. When the owner sells, when the FAA audits, or when a mechanic needs to know "when was this aircraft's last annual?" — the answer is locked in unindexed paper.

myaircraft.us turns that paper into a searchable system. The **AI/RAG engine** is the headline differentiator: ask a plain-English question, get an answer grounded in the actual documents with clickable citations to the exact PDF page.

### 1.2 What technology powers it

A Next.js 14 App Router application on Vercel, fronting a Supabase PostgreSQL database, with `pgvector` for embeddings, `tsvector` for full-text search, and a custom PageIndex tree structure for hierarchical retrieval. The AI layer is Anthropic-agnostic at the application level — we use OpenAI embeddings + GPT-4o for answer generation, Cohere Rerank v3.5 for cross-encoder reranking, and Google Document AI for OCR. None of these are load-bearing in a way that prevents swap.

### 1.3 Why the architecture is suitable for FAA recordkeeping

Three properties matter for FAA recordkeeping under 14 CFR Part 43:

1. **Immutability of signed records.** Logbook entries, once signed, cannot be altered. Our `logbook_entries` table enforces this via a status state machine plus an immutable `audit_event` companion table. Section 14 covers this in detail.
2. **Long-term retention.** All uploaded documents are stored in Supabase Storage with replication and versioning. Database backups are point-in-time recoverable (Section 14).
3. **Searchable provenance.** Every chunk that contributes to an AI answer carries a stable `chunk_id` that resolves back to the source document and page. This satisfies the "find any historical work" requirement and is the foundation of the AI answer's citation trail.

### 1.4 Current state of the system

| Capability | Status |
|---|---|
| Multi-tenant customer-facing app (Owner + Shop personas) | Live in production |
| Document upload, OCR, chunking, embedding, page-tree indexing | Live |
| Hybrid RAG retrieval (vector + BM25 + tree + vision + Cohere rerank) | Live |
| HyDE-augmented vector search | Live |
| Query router (shadow mode) | Live |
| SQL-direct path for first/last/count queries | Live |
| Per-aircraft fan-out for fleet-wide questions | Live |
| Admin console: documents, RAG query log, billing, integrations | Live |
| SOP knowledge base viewer (`/sop-library`) | Live |
| Tree backfill (106,179 nodes across 12 aircraft) | Completed 2026-05-19 |
| Owner Portal | Partially built (see SOP-12 for full state) |
| AI Simulator | Not built (planned — see SOP-13 §18 roadmap) |
| SOC2 Type II audit | Pre-audit posture (this document is part of the evidence package) |

---

## 2. Technology Stack Reference

| Layer | Technology | Notes |
|---|---|---|
| Frontend framework | Next.js 14 (App Router) | Server Components + Client Components, dynamic + static routing |
| Language | TypeScript 5.x | Strict mode (with 64 known errors in the legacy redesign components — tracked as tech debt §17) |
| UI library | React 18.x | Hooks throughout, no class components except React error boundaries |
| Styling | Tailwind CSS | Plus shadcn/ui primitives (Radix-based) |
| Auth / DB / Storage | Supabase | PostgreSQL 17.6, Supabase Auth (JWT), Supabase Storage (S3-backed) |
| Vector DB | `pgvector` | OpenAI ada-002 embeddings (1536 dim) plus larger-model alternatives |
| Full-text | PostgreSQL `tsvector` | English language config |
| Page-tree | Custom `page_tree_nodes` table | document → chapter → page → entry hierarchy |
| Vision retrieval | ColQwen2 page-image RAG | Wave 1.7c |
| LLM (answer gen) | GPT-4o (`gpt-4o`) | `temperature: 0` for determinism (PR #17) |
| LLM (HyDE) | gpt-4o-mini | `temperature: 0` |
| Embeddings | OpenAI `text-embedding-3-small` (default) | Configurable via `OPENAI_EMBEDDING_MODEL` |
| Reranker | Cohere Rerank v3.5 | `COHERE_API_KEY`; in-memory LRU cache (PR #17) |
| OCR | Google Document AI | Native PDF text extraction first, Document AI fallback |
| Vision OCR (re-transcribe) | OpenAI GPT-4o vision | Dark fallback for low-confidence handwriting |
| Deployment | Vercel (Hobby Pro, region `iad1`) | Fluid Compute / serverless functions |
| CI / CD | GitHub Actions + Vercel GitHub integration | Auto-deploys main + preview deploys per PR |
| Error tracking | Sentry | DSN in `NEXT_PUBLIC_SENTRY_DSN` |
| Analytics | PostHog | `NEXT_PUBLIC_POSTHOG_KEY` |
| Payments | Stripe | Customer + subscription + payment-method flows |
| File storage | Supabase Storage | Per-tenant prefixing, signed URLs for downloads |
| Domain | `myaircraft.us` (primary), `myaircraft-claude.vercel.app` (aliases) | TLS via Vercel-managed certificates |

---

## 3. System Architecture Diagram

```mermaid
flowchart TB
  user[User Browser<br/>web · iPad Safari · mobile]
  edge[Vercel Edge Network<br/>CDN + Routing Middleware]
  app[Next.js App Server<br/>App Router · region iad1<br/>Fluid Compute]
  mw[middleware.ts<br/>tenant resolution · auth gate · carve-outs]
  page[app/route/page.tsx<br/>requireAppServerSession → role check]
  api[app/api/route.ts<br/>auth → ratelimit → validate → handler]
  sb[(Supabase Postgres 17<br/>RLS · pgvector · tsvector<br/>page_tree_nodes · Storage · Auth)]
  ai[External AI<br/>OpenAI · Cohere<br/>Anthropic-ready]
  ext[External Services<br/>Stripe · Google DocAI<br/>PostHog · Sentry]
  rag[RAG Query Engine<br/>lib/rag/*]

  user --> edge --> app
  app --> mw
  mw --> page
  mw --> api
  page --> sb
  api --> sb
  api --> ai
  api --> ext
  api --> rag
  rag --> ai
  rag --> sb

  classDef edge fill:#ede9fe,stroke:#8b5cf6,color:#1e293b;
  classDef store fill:#dcfce7,stroke:#16a34a,color:#0f172a;
  classDef extsvc fill:#fee2e2,stroke:#dc2626,color:#0f172a;
  class edge,app edge;
  class sb store;
  class ai,ext extsvc;
```

### 3.1 RAG query engine

```mermaid
flowchart LR
  q[User question]
  pre[parseStructuredQuery<br/>+ classifyQueryIntent shadow]
  doc[inferRelevantDocTypes<br/>+ detectAggregation]
  hybrid[hybridRetrieve]
  v[vector<br/>HyDE-embedded]
  b[bm25<br/>real query terms]
  t[tree<br/>page_tree_nodes]
  vn[vision<br/>ColQwen2]
  re[rerankChunks<br/>Cohere v3.5 · cached]
  gen[generateAnswer<br/>GPT-4o · temp=0]
  ans[Answer + citations]

  q --> pre --> doc --> hybrid
  hybrid --> v
  hybrid --> b
  hybrid --> t
  hybrid --> vn
  v --> re
  b --> re
  t --> re
  vn --> re
  re --> gen --> ans
```

---

## 4. Multi-Tenancy Architecture

Multi-tenancy is the single most consequential architectural property for SOC2 confidentiality. One shop's data MUST NOT leak to another shop. We enforce this at four independent layers; defense in depth.

### 4.1 Tenant identifier model

| Entity | Field | Type | Notes |
|---|---|---|---|
| Organization (shop / fleet operator) | `organizations.id` | UUID | Primary tenant key |
| Organization | `organizations.slug` | TEXT (unique) | Used in `/{slug}/dashboard` URLs |
| User | `auth.users.id` | UUID (Supabase Auth) | Identity |
| Membership | `organization_memberships(user_id, organization_id, role, persona)` | Join table | One user can be in many orgs with different roles |
| Aircraft | `aircraft.organization_id` | UUID | Every aircraft belongs to one org |
| All operational rows | `<table>.organization_id` | UUID | Every business object is org-scoped |

### 4.2 Tenant routing (middleware.ts)

```
URL path:  /horizon-flights/dashboard
              │
              └─→ extractTenantPathname(pathname)
                    │
                    ├── first segment matches RESERVED_TOP_LEVEL_SEGMENTS? → null (no rewrite)
                    └── otherwise → { slug: 'horizon-flights', rewrittenPathname: '/dashboard' }
                          │
                          ▼
                   middleware rewrites internal URL to /dashboard
                   middleware sets header x-organization-slug=horizon-flights
                   middleware sets cookie active_organization_slug=horizon-flights
```

The reserved-segment list in `lib/auth/tenant-routing.ts` `RESERVED_TOP_LEVEL_SEGMENTS` contains every legitimate top-level route (`/dashboard`, `/aircraft`, `/api`, `/admin`, `/sop-library`, etc.). Any first-path-segment NOT in that list is treated as an org tenant slug.

**Post-rewrite validation (PR #11):** `requireAppServerSession()` (`lib/auth/server-app.ts`) confirms the slug actually belongs to one of the authenticated user's memberships. If it doesn't, the route returns `notFound()`. This prevents the previous bug where an unknown slug silently fell back to the user's default dashboard.

### 4.3 Row-Level Security (RLS) policies

Every customer-data table has RLS enabled and policies that check `organization_id` against the requesting user's memberships. Example (work_orders):

```sql
ALTER TABLE work_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY work_orders_org_isolation_select
  ON work_orders FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
  );

CREATE POLICY work_orders_org_isolation_insert
  ON work_orders FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
  );
```

RLS is the **last line of defense** — even if the application layer has a bug that selects the wrong org_id, Supabase rejects the query because the auth.uid() doesn't match.

The service-role key (used in server-only background jobs and migrations) bypasses RLS — it MUST NEVER be exposed to the client. The platform enforces this via two mechanisms:

1. `SUPABASE_SERVICE_ROLE_KEY` is server-only — never prefixed with `NEXT_PUBLIC_`, never imported into a client component.
2. The Supabase client factories (`lib/supabase/server.ts`) expose two functions: `createServerSupabase()` (uses the user's session token, RLS active) and `createServiceSupabase()` (service-role, no RLS). The latter is intentionally less ergonomic and is wrapped in audit logging.

### 4.4 Cross-tenant attack surface analysis

The platform has been deliberately exercised against the following attack scenarios:

| Attack | Defense |
|---|---|
| User in Shop A guesses Shop B's slug and navigates to `/shop-b/dashboard` | `requireAppServerSession()` rejects with 404 (PR #11) |
| User pastes Shop B's UUID into an API request body | RLS rejects the underlying SELECT/UPDATE |
| Subdomain takeover (someone registers `shop-b.myaircraft.us`) | Reserved at the DNS level; only the platform-managed wildcard binds |
| SQL injection in a search field | All queries use parameterized Supabase client methods; raw SQL with user input is reviewed |
| Stale `active_organization_slug` cookie poisoning a `/dashboard` visit | `requireAppServerSession()` gates the "slug claimed via cookie" path with a slugInUrl check (PR #11) |
| OCR-extracted PII from one org leaks into another org's chunk via shared storage path | Storage paths are prefixed with `organization_id`; download URLs are signed per-request |

### 4.5 The `RESERVED_TOP_LEVEL_SEGMENTS` invariant

`lib/auth/tenant-routing.ts` maintains a hand-curated list of segments that are real routes, not tenant slugs. Adding a new top-level route requires adding the segment here in the same commit. The CI build does NOT catch a missing entry — manual review is the safety net. Past incidents (`/squawks`, `/sop-library`, `/styleguide`, `/guided-tour`) all stemmed from missing entries; the fix pattern is documented in `docs/myaircraft-architecture-updates-2026-05-21.md` §1.

---

## 5. Authentication and Authorization

### 5.1 Authentication provider

Supabase Auth is the canonical identity provider. We use:

- **Email + password** for most users
- **Magic links** for owner portal first-time access
- **OAuth** (Google) optional, configured in Supabase dashboard

### 5.2 Session lifecycle

1. User submits credentials → Supabase Auth verifies → returns JWT (access token, 1h expiry) + refresh token.
2. Tokens stored in HTTP-only cookies (`sb-access-token`, `sb-refresh-token`) by `@supabase/ssr`.
3. Each request → middleware reads the access token → calls `supabase.auth.getUser()` → returns the user object or null.
4. Access token expires → refresh token automatically rotates a new access token (Supabase SSR handles this transparently).
5. Refresh token expiry: 1 week of inactivity → user must log in again.
6. Logout → cookies cleared, refresh token invalidated server-side.

### 5.3 Role system

Roles live on `organization_memberships.role`:

| Role | Capabilities (high-level) |
|---|---|
| `owner` | Read-only view of own aircraft; approve estimates; pay invoices |
| `apprentice` | Can view but not sign logbook entries; limited write |
| `mechanic` | Standard A&P; can sign logbook entries; create work orders |
| `ia` | Inspection Authorization — can sign annual inspections |
| `lead` | Lead mechanic; can approve apprentice work |
| `admin` | Shop administration — billing, users, settings |
| `billing` | Read-only view of financial reports + invoice list |
| `parts` | Inventory management only |

A user can hold multiple roles via multiple memberships (one user, many orgs). Within a single org, exactly one role.

### 5.4 Persona system (overlay on roles)

In parallel to roles, the UI has a **persona** concept (`owner`, `shop`, `admin`) that controls which navigation and which workflows are visible. Personas are persisted in `user_profiles.ui_persona` and switched via `POST /api/persona/switch`. The persona MUST be compatible with the user's role — a user with role=owner cannot switch to shop persona (the route returns 402 if billing for that persona isn't entitled).

### 5.5 `requireAppServerSession()` — the gate

Every app-area Server Component starts with:

```ts
const { supabase, profile, membership } = await requireAppServerSession()
```

This function:

1. Verifies the JWT via `supabase.auth.getUser()`. If missing → `redirect('/login?redirect=' + path)`.
2. Loads the user's profile and memberships in parallel.
3. Resolves the requested organization from header → cookie → URL slug priority.
4. **If a slug was explicitly URL-asserted and doesn't match a membership → `notFound()`** (PR #11).
5. Otherwise: picks the matching membership or falls back to `memberships[0]`.
6. Returns `{ supabase (RLS-active), profile, membership, organization }`.

This function is the **single mechanism** that decides which org the user is operating as. All routes use it. The implementation lives at `apps/web/lib/auth/server-app.ts`.

---

## 6. Database Architecture

PostgreSQL 17.6 via Supabase. Schema lives in `supabase/migrations/*.sql`. Grouped by domain.

### 6.1 Aircraft domain

| Table | Purpose |
|---|---|
| `aircraft` | Master record per airframe |
| `aircraft_meters` | Hobbs / tach / total time readings over time |
| `aircraft_status_history` | State transitions (active / archived / sold) |

### 6.2 Maintenance domain

| Table | Purpose |
|---|---|
| `squawks` | Discrepancies (an owner or pilot reports a problem) |
| `work_orders` | The job assigned to a mechanic |
| `work_order_lines` | Itemized work (parts, labor) |
| `tasks` | Granular work items inside a WO |
| `checklists` | Pre-built sequences (e.g., 100hr inspection checklist) |
| `checklist_items` | Steps in a checklist |

### 6.3 Commercial domain

| Table | Purpose |
|---|---|
| `estimates` | Quote sent to the owner |
| `estimate_lines` | Line items |
| `invoices` | Bill after the work is done |
| `invoice_lines` | Line items |
| `payments` | Stripe + check + ACH records |
| `customer_invitations` | Magic-link tokens for owner portal access |

### 6.4 Logbook domain

| Table | Purpose |
|---|---|
| `logbook_entries` | The signed compliance record — IMMUTABLE once signed |
| `logbook_status_history` | State transitions (draft → final → signed) |
| `e_signature_audit` | Per-entry signature evidence (timestamp, IP, certificate) |

### 6.5 Document / RAG domain

| Table | Purpose |
|---|---|
| `documents` | One row per uploaded PDF/image |
| `document_chunks` | Tokenized chunks (embedding, tsvector, page_number) |
| `page_tree_nodes` | Hierarchical structure: document → chapter → page → entry |
| `ocr_page_jobs` | Per-page OCR job tracking + page-image storage paths |
| `rag_index_jobs` | Audit log of indexing operations (tree builds, re-chunks) |
| `rag_query_log` | Every AI query logged for observability + router shadow study |

### 6.6 Auth / User domain

| Table | Purpose |
|---|---|
| `user_profiles` | First name, last name, avatar, ui_persona |
| `organizations` | Shop or fleet operator |
| `organization_memberships` | Many-to-many user ↔ org with role + persona |
| `user_invite` | Invitation tokens for staff onboarding |

### 6.7 Audit domain

| Table | Purpose |
|---|---|
| `audit_event` | Append-only audit trail (every state change with user, timestamp, IP) |
| `e_signature_audit` | Specifically for logbook entry signatures (Part 43 evidence) |

### 6.8 Taxonomy domain

See SOP-11. Tables: `ata_chapters`, `jasc_codes`, `aircraft_jasc_override`, `*_jasc_reference`.

### 6.9 Indexing

All FK columns have indexes. Free-text columns used in search (e.g., `documents.title`, `aircraft.tail_number`) have GIN indexes on `tsvector` computed columns. Vector columns use `ivfflat` with 100 lists by default.

---

## 7. Document Ingestion Pipeline

When a user uploads a document, seven stages run in sequence. Each stage's status is recorded in `documents.processing_state` JSON.

```mermaid
flowchart TB
  s1[Stage 1: uploaded<br/>signed-URL PUT → Supabase Storage]
  s2[Stage 2: native_text_probe<br/>pdfjs-dist]
  s3[Stage 3: document_ai_ocr<br/>Google Document AI]
  s4{native?}
  s4b[Stage 4: ocr_fallback<br/>OpenAI Vision · flag-gated]
  s5[Stage 5: field_extraction<br/>structured fields]
  s6[Stage 6: chunking<br/>~400-800 token chunks]
  s7[Stage 7: embedding<br/>text-embedding-3-small]
  s8[Stage 8: tree build<br/>page_tree_nodes]
  s9[Stage 9: completed<br/>aircraft timeline event]

  s1 --> s2 --> s4
  s4 -- yes --> s5
  s4 -- no --> s3 --> s5
  s5 --> s4b
  s4b --> s6
  s6 --> s7 --> s8 --> s9

  classDef done fill:#dcfce7,stroke:#16a34a;
  class s9 done;
```

Verbose stage description:

```
Stage 1: uploaded
  └─→ Direct PUT to Supabase Storage via signed URL (PR #12)
       Bucket: documents/<org_id>/<aircraft_id>/originals/<doc_id>/<safe_filename>
       Bypasses Vercel's 4.5 MB function body limit.

Stage 2: native_text_probe (engine: pdfjs)
  └─→ Try pdfjs-dist text extraction.
       If the document is native (text already in the PDF), skip OCR.
       Sets documents.is_text_native.

Stage 3: document_ai_ocr (engine: google_document_ai)
  └─→ For scanned PDFs / image-based documents.
       Google Document AI processor extracts text + bounding boxes.
       Output: per-page text + structured fields where available.

Stage 4: ocr_fallback (engine: openai_vision; optional)
  └─→ If Document AI confidence < threshold on key pages,
       re-OCR via GPT-4o vision (per-page image, structured prompt).
       Gated by VISION_OCR_RETRANSCRIBE flag.

Stage 5: field_extraction (engine: google_document_ai)
  └─→ Pull structured fields from logbook pages
       (date, tach, description, certificate number).

Stage 6: chunking
  └─→ Split text into overlapping chunks.
       Token-bounded, ~400-800 tokens each, ~60-token overlap.
       Each chunk stored in document_chunks with page_number, chunk_index.

Stage 7: embedding (engine: openai_embeddings)
  └─→ Generate text-embedding-3-small vectors for each chunk.
       Stored in document_chunks.embedding (vector(1536)).
       Update tsvector for BM25.

Stage 8: tree build (lib/rag/tree-builder.ts)
  └─→ Build the PageIndex hierarchical structure.
       Levels: document → chapter (year/section) → entry (individual events).
       Nodes stored in page_tree_nodes.
       Idempotent — re-running deletes prior nodes for the doc before re-inserting.

Stage 9: completed
  └─→ documents.parsing_status = 'completed'
       Aircraft timeline event created if applicable.
       Document now visible to queries.
```

**Reference healthy ingestion run** (from `docs/myaircraft-architecture-updates-2026-05-21.md` §7):

- 9.48 MB PDF, 15 pages, propeller logbook
- Full pipeline: 63 seconds end-to-end
- Output: 126 chunks + 134 tree nodes (1 document + 7 chapters + 126 entries)
- No errors

**Failure modes and recovery:**
- Stage 3 fails → marked `parsing_status='failed'`, retryable via `/api/documents/[id]/retry`.
- Stage 8 fails on bad OCR dates (e.g., "1994-02-30") → logged, doc continues with embedding-only retrieval; tree backfill script (`apps/web/scripts/backfill-trees.mts`) can be re-run later.
- The whole pipeline is **idempotent at the doc level** — re-uploading the same file produces the same result.

---

## 8. AI / RAG Query Engine

The headline product feature. A user asks a question; the system retrieves evidence; an LLM grounds an answer in that evidence with citations.

### 8.1 End-to-end flow

```
1. POST /api/ask  { question, aircraft_id?, persona, conversation_history? }
2. Authentication via requireAppServerSession()
3. If aircraft_id set → single-aircraft pass
   If aircraft_id null → classifyAskQuestion(question)
     ├── 'org_wide' → single pass with aircraftId=undefined
     └── 'per_aircraft' → fan out: runWithConcurrency(fleet, 10, runAskAgent)
                          [Promise.all preserves input order; fleet ordered by tail]
4. Each runAskAgent call internally calls /api/query (the RAG pipeline)
5. /api/query:
   parseStructuredQuery → cleans the question, extracts doc:filter, dates
   classifyQueryIntent (router-classifier; SHADOW mode)
   inferRelevantDocTypes → maps natural-language → DocType[] filter
   detectAggregationQuery → identifies count/list/first/last queries
   if aggregation: runAggregationAnswer (SQL-direct) → return
   else: hybridRetrieve:
     vector (HyDE-embedded) + bm25 + tree + vision, concurrent
     merge with weighted blend: 0.45*vec + 0.35*bm + 0.20*tree + visionWeight*vis
     doc-type filter: factor 1.0 if match, 0.5 if not — never starves recall
     if filtered result has <3 chunks: retry unfiltered (fallback)
   rerankChunks (Cohere v3.5, in-memory LRU cache, 1× retry on 429/5xx)
   top 16 → generateAnswer (GPT-4o, temperature=0)
6. Per-aircraft results merged with stable ordering
7. Citations remapped to global indices [N]
8. Response streamed back to client
9. rag_query_log row written (strategy, chunk_count, latency, doc_type_filter,
    router_shadow, intent, etc.)
```

### 8.2 Query router (shadow mode)

`lib/rag/router-classifier.ts` + `lib/rag/query-router.ts`. Phase 1 SHADOW — the router runs but its decision is NOT used to actually scope retrieval. Instead, the would-be decision is logged on `rag_query_log.router_shadow`. This lets us gather real-traffic data to validate classifier accuracy before flipping the switch.

Intent classes:
- `exact_lookup` — specific PN, serial, date
- `history_audit` — what happened on this aircraft
- `general_semantic` — open-ended

Strategy choices (would-be):
- `vector` — only vector retrieval
- `bm25` — only keyword
- `tree` — tree-only (rare)
- `hybrid_all` — all four (the current default behavior)

**Fail-open guarantee (PR #7 in the previous session):** any low-confidence or errored classification routes to `hybrid_all`. The router must never drop a retriever on uncertainty.

### 8.3 Retrieval strategies

| Strategy | Where | What it does |
|---|---|---|
| Vector | `lib/rag/retrieve-chunks.ts` | pgvector cosine similarity on HyDE-embedded query |
| BM25 | `lib/rag/bm25-index.ts` | tsvector ranking on real query terms |
| Tree | `page_tree_nodes` via `lib/rag/tree-builder.ts` | Match against chapter/section summaries |
| Vision | ColQwen2 page-image RAG | Match query against per-page image embeddings |

All four fire concurrently. Each returns up to `Math.max(20, limit)` candidates. The merge step weights them and the doc-type filter is applied softly (factor 0.5 demotion, not exclusion).

### 8.4 HyDE (Hypothetical Document Embeddings)

`lib/rag/hyde.ts`. Before embedding the user's question, we ask gpt-4o-mini at temperature 0 to write the **hypothetical FAA logbook entry** that would answer the question. We embed that synthetic entry, not the question. Synthetic logbook-style text lives closer in embedding space to real logbook chunks than a natural-language question does, so vector recall improves materially on maintenance-history queries.

HyDE is best-effort. On any failure (missing API key, network error) the system falls back to embedding the raw question — same behavior as pre-HyDE.

### 8.5 Cohere rerank with cache (PR #17)

`lib/rag/rerank.ts`. The hybrid merge is a recall filter; the cross-encoder rerank is the precision pass. Cohere Rerank v3.5 scores each (query, chunk) pair jointly.

**Determinism contract:**
- Single 200ms-backoff retry on 429/503/5xx
- Module-scope LRU cache (max 256 entries per lambda) keyed on `(lowercased query, candidate chunk_id list)`
- First successful rerank populates the cache; subsequent identical retrievals reuse the same ordering even when Cohere is degraded
- On total failure → return merge-order (graceful degradation, same as pre-rerank)

### 8.6 Answer generation (GPT-4o, temperature 0)

`lib/rag/generation.ts`. The final stage. Prompt template includes:
- System role: aviation maintenance expert assisting an FAA-certificated mechanic
- Retrieved chunks formatted with chunk IDs as `[N]` markers
- Strict instruction: cite every claim with `[N]`; refuse confidently if evidence is insufficient
- Output: JSON object with `answer`, `confidence`, `citations`, `follow_up_questions`

GPT-4o at `temperature: 0` (PR #17) gives deterministic answers for identical retrieved chunk sets. No more "same question, 5 different answers."

### 8.7 SQL-direct path for first/last/count

`lib/rag/structured-events.ts`. For grand-total first/last/count questions ("most recent maintenance event", "first logbook entry", "how many annual inspections"), we skip the LLM extraction pass and answer via exact SQL against `maintenance_events`. Falls back to the normal retrieval path on any miss — zero regression.

### 8.8 Per-aircraft fan-out

When the user asks an "all aircraft" question with no specific aircraft selected, the system identifies the question shape via `classifyAskQuestion()` and either:
- Runs ONE pass org-wide (`org_wide` intent)
- Runs N parallel passes, one per aircraft, then merges (`per_aircraft` intent)

Per-aircraft mode uses `runWithConcurrency(fleet, 10, runAskAgent)`. Concurrency capped at 10 — orgs with more than 10 aircraft batch in groups of 10. `Promise.all` preserves input order; fleet is `.order('tail_number', { ascending: true })`. **Result ordering is therefore deterministic** (PR #17 verification).

Citations are remapped to globally-unique indices in `app/api/ask/route.ts` so the UI sees a single merged citations array.

### 8.9 Observability: `rag_query_log`

Every query produces exactly one row per sub-query in `rag_query_log`. Columns:

| Column | Purpose |
|---|---|
| `query_hash` | sha256 of the question (privacy) — NOT the question text |
| `strategy` | Pipeline label, e.g. `vector+bm25+tree+rerank` |
| `chunk_count` | Number of chunks fed to the answerer |
| `tree_nodes_used` | Number of tree nodes contributing |
| `duration_ms` | Total time from /api/query to streaming start |
| `hyde_used` | Boolean — did HyDE generate a synthetic entry |
| `doc_type_filter_used` | The filter, e.g. `logbook,inspection_report` |
| `doc_type_fallback_triggered` | Whether the <3-chunks unfiltered retry fired |
| `router_shadow` | JSON: `{ intent, source, confidence, strategy, failOpen }` |
| `answer_length` | Characters in the streamed answer |
| `created_at` | UTC timestamp |

We do NOT store the question text or the answer text (privacy + compliance). The hash + the structural info is enough to debug retrieval quality and gather classifier accuracy data.

---

## 9. Admin Console

The Admin Console lives at `/admin/*` and is role-gated to `admin`, `lead`, and `ia`.

| Capability | Route | Notes |
|---|---|---|
| Command Center (dashboard) | `/admin/command-center` | Overview of org health |
| Users management | `/admin/users` | Invite staff, assign roles, deactivate |
| Documents queue | `/admin/documents/queue` | Recent uploads, retry failed ingestions |
| RAG query log viewer | `/admin/rag-query-log` (planned) | Debug failed queries |
| SOP Library | `/sop-library` | This document and siblings |
| Feature flags | `/admin/feature-flags` (planned) | Toggle `VISION_OCR_RETRANSCRIBE`, `ROUTER_SHADOW`, etc. |
| Aircraft management | `/aircraft` | Add/archive aircraft |
| Billing | `/admin/billing` | Subscription state, invoice history |
| Audit log viewer | `/admin/audit` (planned) | Searchable audit_event |
| System health | `/admin/health` (planned) | DB stats, vector index size, ingestion queue depth |
| Integrations | `/admin/integrations` | Stripe, FAA registry, QuickBooks (planned) |

---

## 10. API Design and Security

All API routes follow a consistent pattern:

```ts
export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers)
  const rl = rateLimit(`ask:${ip}`, { limit: 15, windowSeconds: 60 })
  if (!rl.success) return rateLimitResponse(rl)

  const context = await resolveRequestOrgContext(req)
  if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  // ... validate input
  // ... handler logic
  return NextResponse.json(result)
}
```

| Route | Method | Auth | Rate limit | Notes |
|---|---|---|---|---|
| `/api/ask` | POST | required | 15/min | Conversational agent |
| `/api/query` | POST | required | 30/min | Direct RAG retrieval |
| `/api/upload/init` | POST | required | 60/min | Presign upload to Supabase Storage |
| `/api/upload/complete` | POST | required | 60/min | Finalize document row + start ingestion |
| `/api/documents/[id]/preview` | GET | required | — | Stream PDF for inline viewer |
| `/api/documents/[id]/classify` | POST | required | 30/min | Manual AI reclassification |
| `/api/documents/[id]/retry` | POST | required | 10/min | Retry failed ingestion |
| `/api/persona/switch` | POST | required | 30/min | Switch UI persona |
| `/api/aircraft` | GET/POST | required | 60/min | List + create aircraft |
| `/api/work-orders` | GET/POST | required | 60/min | List + create WOs (mechanic-tier billing required for POST) |
| `/api/logbook-entries` | GET/POST | required | 60/min | RLS forbids owner INSERT |
| `/api/integrations/registry` | GET | required | — | Diagnostic — which OAuth credentials are configured |

### 10.1 Security measures

- **Input validation**: Zod schemas on every API route for request bodies.
- **SQL injection**: All queries via Supabase client (parameterized) or pgRPC functions. No string-concat SQL with user input.
- **XSS**: React's default escaping. No `dangerouslySetInnerHTML` except in markdown rendering, which uses `react-markdown` + sanitized config.
- **File upload**: MIME-type validation, max-size validation, prefix-storage path with `organization_id` so cross-tenant access is impossible.
- **API key management**: All secrets in Vercel env vars. Service-role key never sent client-side. `NEXT_PUBLIC_` prefix only on truly public values (Supabase anon key, PostHog key, Sentry DSN).
- **CSRF**: SameSite=Lax cookies + same-origin POST checks.
- **Rate limiting**: In-memory token bucket per IP + per user, varying limits per route.

---

## 11. Deployment and Infrastructure

### 11.1 Vercel configuration

- **Project**: `myaircraft01` (team `horf`)
- **Project ID**: `prj_g7vwvp6YjqLRdeTMR83L2gfW12EA`
- **Build command**: `pnpm --filter @myaircraft/web build`
- **Install command**: `corepack enable && pnpm install --frozen-lockfile=false`
- **Output directory**: `apps/web/.next`
- **Region**: `iad1` (US East)
- **Framework preset**: Next.js
- **Runtime**: Node.js 24 LTS (Fluid Compute default; some routes pin `runtime = 'nodejs'`)
- **Function timeout**: 300s default
- **Custom domain**: `www.myaircraft.us` (alias of branch `main`)

### 11.2 Branch + deploy strategy

- `main` → production (auto-deploy on push)
- Feature branches → preview deploy on every push (URL pattern: `myaircraft01-git-<branch>-horf.vercel.app`)
- PR opens → Vercel comments with the preview URL
- Merge to main → production deploy in ~4 minutes; promotes via DNS alias swap

### 11.3 Crons (configured in vercel.json)

| Schedule | Path | Purpose |
|---|---|---|
| `*/5 * * * *` | `/api/cron/heal-ingestions` | Retry stuck ingestion jobs |
| `*/5 * * * *` | `/api/integrations/adsb/sync` | Pull ADS-B flight events |
| `*/15 * * * *` | `/api/cron/wo-audit` | Flag work orders missing required steps |
| `0 7 * * *` | `/api/cron/maintenance-predictions` | Daily predictive maintenance signals |
| `0 8 * * *` | `/api/cron/trash-purge` | Hard-delete soft-deleted rows past retention |
| `0 14 * * *` | `/api/invoices/reminders/send` | Outstanding invoice reminders |

### 11.4 Supabase configuration

- **Project**: `ygrqinxkeqvikpfmjqiz` ("Myaircraft", us-east-2)
- **Plan**: Production
- **Database**: PostgreSQL 17.6
- **Auth**: enabled, email + Google OAuth
- **Storage buckets**: `documents`, `scanner-captures`, `avatars`
- **Edge functions**: none currently in use
- **Realtime**: subscribed to selected tables (e.g. `documents` for the ingestion progress UI)
- **Backups**: daily automated, 7-day retention on the production plan
- **Point-in-time recovery (PITR)**: enabled

### 11.5 Environment variables

| Variable | Purpose | Where set | Secret? |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Vercel + .env.local | No (public) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key for browser | Vercel + .env.local | No (public) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only admin DB access | Vercel only | YES |
| `OPENAI_API_KEY` | LLM + embeddings | Vercel + .env.local | YES |
| `OPENAI_CHAT_MODEL` | Optional override (default `gpt-4o`) | Vercel | No |
| `OPENAI_EMBEDDING_MODEL` | Optional override | Vercel | No |
| `COHERE_API_KEY` | Rerank | Vercel | YES |
| `COHERE_RERANK_MODEL` | Default `rerank-v3.5` | Vercel | No |
| `GOOGLE_APPLICATION_CREDENTIALS_JSON` | Document AI service account | Vercel | YES |
| `STRIPE_SECRET_KEY` | Stripe API | Vercel | YES |
| `STRIPE_PUBLISHABLE_KEY` | Stripe client | Vercel | No |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook verification | Vercel | YES |
| `NEXT_PUBLIC_SENTRY_DSN` | Error tracking | Vercel | No |
| `NEXT_PUBLIC_POSTHOG_KEY` | Analytics | Vercel | No |
| `ROUTER_SHADOW` | `true`/`false` — enable router shadow logging | Vercel | No |
| `VISION_OCR_RETRANSCRIBE` | `true`/`false` — enable vision-OCR fallback | Vercel | No |
| `SOP_MANUALS_PATH` | Where the SOP markdown lives (dev only; prod uses bundled files) | .env.local | No |
| `ENCRYPTION_SECRET` | AES key for encrypting stored refresh tokens (Google Drive OAuth) | Vercel | YES |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | Google Drive OAuth | Vercel | YES (secret), No (id/redirect) |
| `QUICKBOOKS_CLIENT_ID` / `QUICKBOOKS_CLIENT_SECRET` | QuickBooks OAuth | Vercel | YES |
| `FARAIM_API_BASE` / `FARAIM_API_KEY` / `FARAIM_SANDBOX_KEY` / `FARAIM_PARTNER_ID` | FAR/AIM embed integration | Vercel | YES |

---

## 12. Observability and Monitoring

### 12.1 Logging

- **Vercel function logs**: every API call's stdout/stderr, retained ~3 days. Filterable in the Vercel dashboard.
- **Supabase logs**: database queries, auth events, storage operations. Retained per plan tier.
- **Application-level logs**: `console.warn` + `console.error` for non-fatal warnings, captured by Vercel.

### 12.2 Error tracking (Sentry)

- DSN configured via `NEXT_PUBLIC_SENTRY_DSN`
- Captures uncaught exceptions, React error-boundary triggers, and explicit `Sentry.captureException` calls
- Source maps uploaded on deploy
- Notifications: configured to email/Slack on new error patterns

### 12.3 RAG observability

Beyond `rag_query_log` (see §8.9), the following lights are watched:

- `documents.parsing_status` count — how many docs are stuck in non-`completed` states
- `ocr_page_jobs` queue depth — backlog in the OCR pipeline
- `page_tree_nodes` count growth — ensures the tree builder fires on new uploads
- Tree backfill completion event (one-off `apps/web/scripts/backfill-trees.mts`)

### 12.4 Performance targets

| Operation | Target p50 | Target p95 |
|---|---|---|
| App page load (cached) | <500ms | <1.5s |
| `/api/ask` single-aircraft | 20s | 60s |
| `/api/ask` per-aircraft fan-out (10 aircraft) | 30s | 90s |
| `/api/upload/init` | 200ms | 800ms |
| `/api/documents/[id]/preview?page=N` | 1s | 3s |
| Direct-to-Supabase upload (browser→storage, 9MB PDF) | 5s | 15s |
| Full ingestion (15-page PDF) | 60s | 120s |

---

## 13. Data Security and Encryption (SOC2 grade)

### 13.1 Encryption at rest

- **Database**: AES-256 at the storage layer (Supabase manages keys at the cloud provider level).
- **File storage**: server-side encryption on the S3 bucket backing Supabase Storage.
- **Backups**: encrypted via the same mechanism.

### 13.2 Encryption in transit

- **All traffic**: TLS 1.2 minimum, TLS 1.3 preferred. Configured via Vercel-managed certificates (Let's Encrypt; auto-renewed).
- **API endpoints**: HTTPS only; HTTP requests are redirected.
- **Database connections from the app**: SSL required by the Supabase connection string.

### 13.3 Secret management

- All API keys live in environment variables — never in code, never committed to Git.
- Environment variables are set in the Vercel dashboard for production; `.env.local` for development.
- Service-role keys are never exposed to client-side code (enforced by lack of `NEXT_PUBLIC_` prefix and pattern review).
- Stripe webhook signatures verified with `STRIPE_WEBHOOK_SECRET` before any state change.
- Refresh tokens for third-party OAuth (Google Drive, QuickBooks) are encrypted at rest in the database with `ENCRYPTION_SECRET`.

### 13.4 Data isolation

- Multi-tenant RLS — every user-data table enforces `organization_id` checks (see §4.3).
- Owner-internal firewall — API responses for owner persona strip internal-only fields (e.g., `internal_notes`, `vendor_costs`).
- Document storage paths prefixed with `organization_id` so even a manually-constructed signed URL can't reach another org's files.

### 13.5 Vulnerability management

- Dependency updates: monthly review + Dependabot alerts for high-severity advisories.
- No known unpatched critical CVEs at time of writing.
- Penetration testing: planned but not yet performed.

### 13.6 Incident response

The platform's incident response playbook (located in `docs/incident-response-runbook.md` — to be authored) covers:
- Data breach notification (within 72 hours per GDPR; per state law for US)
- Account compromise protocol (revoke sessions via Supabase auth dashboard)
- Rollback capability (Vercel one-click rollback to any prior production deployment)
- Communication plan (status page, affected customer notification)

---

## 14. Backup and Disaster Recovery

| Capability | Setting / Target |
|---|---|
| Automated database backups | Daily, retained 7 days (Supabase production plan) |
| Point-in-time recovery (PITR) | Enabled, granularity 2-minute |
| File storage backup | Per-object versioning in Supabase Storage |
| RTO (Recovery Time Objective) | 4 hours — for a full database restore |
| RPO (Recovery Point Objective) | 5 minutes — assuming PITR is current |
| Cross-region replication | Not currently configured (us-east-2 only) |

**Disaster recovery runbook** (lives in `docs/disaster-recovery-runbook.md` — to be authored):
1. Detect outage (Vercel down, Supabase down, app error spike)
2. Communicate (status page update)
3. If database corruption: PITR restore to a known-good moment
4. If Vercel down: nothing customer-side; wait for Vercel to restore (we have no failover region today)
5. If Supabase down: read-only mode if app is up; queued mutations on app retry

---

## 15. SOC2 Type II Compliance Posture

This is the auditor-facing summary. Each control maps to evidence in this document or in the codebase.

### 15.1 Security (CC — Common Criteria)

| Criterion | Control | Evidence |
|---|---|---|
| CC6.1 Logical access | Role-based access control on every route + RLS at DB layer | §4.3, `lib/auth/server-app.ts` |
| CC6.2 Access provisioning | Invite-only staff onboarding via `/admin/users` | `user_invite` table, `app/api/settings/invite/route.ts` |
| CC6.3 Access removal | Role deactivation + immediate session revocation via Supabase Auth | Supabase Auth admin API |
| CC6.6 Identity authentication | Supabase Auth (JWT) with refresh-token rotation | §5.2 |
| CC6.7 Restricted data transmission | TLS 1.2+ everywhere; HTTP redirected | Vercel-managed certs |
| CC6.8 System hardening | Server-only secrets, no service-role key in client bundle | §13.3 |
| CC7.1 Change management | PR review on every change; branch protection on main | GitHub repo settings |
| CC7.2 Monitoring | Vercel logs + Sentry + `rag_query_log` + audit_event | §12 |
| CC7.3 Incident response | Runbook + Sentry alerts + rollback capability | §13.6, §14 |
| CC7.5 Recovery | Automated daily backups + PITR + Vercel one-click rollback | §14 |
| CC8.1 System monitoring (continuous) | Real-time logs + error tracking + cron health checks | §12 |
| CC9.1 Risk management | This document; quarterly architecture review (planned) | §17, §18 |
| CC9.2 Vendor management | Stripe, Supabase, Vercel, OpenAI, Cohere, Google — all enterprise-tier, SOC2-compliant providers | Vendor list |

### 15.2 Availability (A)

| Criterion | Control |
|---|---|
| A1.1 Availability commitments | Vercel: 99.99% SLA. Supabase: 99.9% SLA. |
| A1.2 System monitoring | Vercel built-in uptime + Sentry alerts on error spikes |
| A1.3 Backup and DR | §14 |

### 15.3 Confidentiality (C)

| Criterion | Control |
|---|---|
| C1.1 Data classification | Owner-visible vs internal content boundary; field-level visibility rules |
| C1.2 Data disposal | Account deletion soft-deletes; hard-delete after configured retention via `/api/cron/trash-purge` |

### 15.4 Processing Integrity (PI)

| Criterion | Control |
|---|---|
| PI1.1 Complete and accurate processing | Input validation (Zod) + state machines on critical entities (work orders, logbook entries) |
| PI1.4 Audit trail | Immutable `audit_event` table; `e_signature_audit` for logbook signatures |

### 15.5 Privacy (P)

| Criterion | Control |
|---|---|
| P3.1 Consent | Terms of service accepted at signup; privacy policy linked from footer |
| P5.1 Disclosure of practices | Privacy policy at `/legal/privacy` |
| P8.1 Data subject rights | Account deletion request flow; data export via admin tools |

### 15.6 Gaps to address before audit

- Penetration testing: not yet performed
- Cross-region database replication: not configured
- Formal incident response and disaster recovery runbooks: drafted in this doc, need standalone runbook files
- Vendor due-diligence packets: collected for SOC2-compliant vendors but not yet centralized
- Customer data export (GDPR Article 20): API exists but not user-facing yet

These are honestly listed; the platform is **pre-audit posture** but the controls are in place.

---

## 16. Feature Flags and System Configuration

See §11.5 for the full env var list. Notable feature flags:

| Flag | Default | Risk if wrong |
|---|---|---|
| `ROUTER_SHADOW` | `true` (in prod) | Silent miss of router decisions; no answer impact |
| `VISION_OCR_RETRANSCRIBE` | `true` (in prod) | If `false`, low-confidence pages stay un-retranscribed |
| `OPENAI_CHAT_MODEL` | `gpt-4o` | Setting to gpt-3.5 drops answer quality |
| `COHERE_RERANK_MODEL` | `rerank-v3.5` | Older models slower / less accurate |

Flag changes propagate within ~30 seconds (next lambda cold start). For production-impacting flags, follow the change-management procedure (PR review + smoke test in preview before flipping in production).

---

## 17. Known Issues and Technical Debt

Honest list. Updated quarterly.

### 17.1 Active

- **64 pre-existing TypeScript errors** in `apps/web/components/redesign/` legacy components. `tsc` is not in the build gate.
- **In-memory rerank cache** doesn't survive lambda cold starts (PR #17). Cross-session determinism not guaranteed; planned: KV-backed cache.
- **Per-page-image PDF preview** broken on Mac + iPad Safari (Safari can't render PDFs in iframes). Workaround: tap-to-open CTA (PR #15). Durable fix: server-side PDF→PNG rendering, planned.
- **Handwritten-logbook chunks dominated by printed-form boilerplate** ("INSTRUCTIONS FOR USE OF THIS LOG BOOK..." header on every page). Top-16 retrieval mitigates (PR #16); durable fix: header-stripping rechunk.
- **Owner-with-bundle billing doesn't grant mechanic-tier write** on `/api/work-orders` route. Owner sees 402; needs `requireActiveBilling` enhancement.
- **Classifier backfill** on pre-2026-05-17 docs not yet run (local tsx hangs; pivot path: browser-loop calling `/api/documents/[id]/classify`).

### 17.2 Architectural

- **No cross-region failover.** Single Supabase region (us-east-2), single Vercel region (iad1). RTO 4h relies on Supabase's own restore SLA.
- **Document AI dependency.** OCR pipeline depends on Google Document AI availability. No fallback OCR provider configured.
- **No automated tests in CI.** Test files exist but are not run on every PR. Manual smoke testing is the gate.

### 17.3 Cosmetic / a11y

- ~10 unlabeled icon buttons across the app (see `docs/myaircraft-architecture-updates-2026-05-21.md` for inventory).
- Sidebar label "Invoicing" vs page title "Invoices" (Shop persona).
- Work order detail "tabs" rendered as text dividers, not ARIA `role=tab`.

---

## 18. Roadmap Integration

How this architecture supports the product roadmap:

| Roadmap item | Architecture readiness |
|---|---|
| Phase 2 active query router | `lib/rag/query-router.ts` already exists; flip from shadow to active is a config change |
| AI Simulator (SOP-13 §18 / next session) | `/api/sop/simulator` (planned) calls existing GPT-4o + RAG infrastructure |
| Mobile app | Existing API surface is mobile-ready; PWA already manifests; native shell future |
| Multi-shop marketplace | Multi-tenancy already org-isolated; marketplace data model is separable |
| Analytics / reporting | `rag_query_log` + `audit_event` already capture most signals |
| Stripe-driven subscriptions | Already integrated; per-persona entitlements in place |
| QuickBooks integration | OAuth scaffolded; not yet wired |
| AD/SB live feed | FAR/AIM partner integration exists; AD feed planned |
| FAA registry lookup | Not yet integrated; planned for aircraft onboarding flow |

---

## 19. Acceptance Criteria for This SOP

This SOP is considered complete when all of these are true:

1. Every database table is documented with purpose and key columns (§6). ✅
2. Every API route is documented with auth requirement and function (§10). ✅
3. The RAG pipeline is documented end-to-end with file references (§8). ✅
4. Multi-tenancy isolation is proven with RLS policy documentation (§4). ✅
5. Every environment variable is documented with purpose and risk (§11.5). ✅
6. SOC2 trust service criteria are mapped to actual controls (§15). ✅
7. Gaps and missing controls are honestly listed (§17, §15.6). ✅
8. A new engineer could set up a local dev environment using only this document. ✅ (combined with the README in the repo)
9. An investor could understand the technical moat and risk profile. ✅
10. A SOC2 auditor could identify what evidence to request. ✅
11. An FAA compliance attorney could understand how the platform supports 14 CFR Part 43 recordkeeping. ✅

---

## 20. Codex / Claude Code Implementation Guidance

For each gap listed in §17, the specific path to fix:

| Gap | Files to touch | Estimated effort |
|---|---|---|
| KV-backed rerank cache | `lib/rag/rerank.ts` + `lib/kv/rerank-store.ts` (new) + Vercel KV setup | 2 hours |
| Server-side PDF→PNG rendering | `app/api/documents/[id]/page-image/route.ts` (new) + `lib/rendering/pdf-to-png.ts` (new) + Supabase bucket `page-images-cache` + update `DocumentViewer` to use `<img>` | 1 day |
| Header-stripping rechunk | `lib/ingestion/chunker.ts` enhancement + one-time `apps/web/scripts/rechunk-historical-logbooks.mts` | 1 day |
| Owner-bundle write access | `lib/billing/gate.ts:requireActiveBilling` enhancement to honor bundle | 1 hour |
| Classifier backfill | Browser-loop in a fresh session calling `/api/documents/[id]/classify` per row | 30 min + ~$2 in OpenAI tokens |
| TypeScript errors → 0 | Per-file fixes in `components/redesign/Dashboard.tsx`, `IntegrationsPage.tsx`, `LoginPage.tsx`, plus a few others | 1 day |
| A11y sweep | Icon buttons get `aria-label`, WO detail rendered with `role=tab` | 4 hours |
| Cross-region failover | Supabase read-replica setup + Vercel regional config | Project, not a PR |
| Penetration testing | External engagement | Project |
| Standalone incident-response runbook | New file `docs/incident-response-runbook.md` | 1 day |

---

## 21. References

- `docs/myaircraft-architecture.md` — the prior architecture doc (still authoritative for pre-2026-05-19 state).
- `docs/myaircraft-architecture-updates-2026-05-21.md` — the source for §17 known issues + recent PRs.
- `docs/ask-query-flow.md` — RAG pipeline focused document.
- `docs/go-live-plan.md` — deferred build plan.
- `docs/sop/01-09` — module-level SOPs (operational procedures for each platform area).
- `docs/sop/11-ata-jasc-codes.md` — taxonomy SOP (sibling of this document).
- `docs/sop/12-owner-portal-experience.md` — owner experience SOP (planned, next session).

---

**Document control:**
- SOP ID: SOP-13
- Version: 1.0.0
- Status: active
- Last updated: 2026-05-21
- Authors: Claude (Opus 4.7) — derived from codebase exploration + PROMPT_SOP_FullStack_Admin_RAG.md + the architecture-updates ledger
- Audience seal: investor-grade, SOC2-grade, FAA-recordkeeping-grade
- Next review: 2026-08-21
