# Work log

Reverse-chronological record of freelance work on this codebase. Client-facing — each entry explains **why** before **what**, links to the commit when available, and notes how the change was verified.

---

## 2026-05-25 — Consolidate WO unread polling: one shared poller + tab-hidden pause

**Background.** While diagnosing the `/api/aircraft` infinite-loop bug (previous entry), the user noticed `/api/owner/work-orders/messages-unread` was also firing repeatedly — roughly every 6 seconds, ~10 calls per minute. Investigation showed this was **not** an infinite loop (no unstable `useEffect` deps), but rather two independent components each polling the same endpoint on a 12-second timer:

- [UnifiedLauncher](apps/web/components/launcher/UnifiedLauncher.tsx) — needs the rollup so the floating "Ask · Help · Messages" pill can show a red dot.
- [WorkOrderChatBubble](apps/web/components/chat-bubble/work-order-chat-bubble.tsx) — needs the same rollup so the WO-chat bubble's red dot lights up too.

Two pollers, same endpoint, slightly staggered → ~10 requests/min just sitting on the page doing nothing. Polling also continued when the tab was hidden, wasting requests when the user wasn't even looking.

**Fix.** Introduced a single shared poller via React Context. Both floating consumers now subscribe to a `useUnreadRollup()` hook that reads from one `UnreadRollupProvider` mounted in [AppLayout.tsx:1155](apps/web/components/redesign/AppLayout.tsx:1155). The provider polls `messages-unread` exactly once for the whole tree, broadcasts the latest message, and:

- **Pauses polling when `document.visibilityState === 'hidden'`** — zero requests when the user is on another tab.
- **Fires immediately on `visibilitychange` → 'visible'** — the badge updates the moment the user returns, no waiting for the next 12s tick.

Each consumer still computes its own `hasUnread` flag (they have different "last seen" semantics — the launcher tracks `mac.launcher.lastSeenMessageAt`, the bubble tracks `wo-chat-last-seen:*` per-WO keys), but the network fetch happens once instead of twice.

**Impact on request volume:**

| Scenario | Before | After |
|---|---:|---:|
| Tab visible, owner / shop persona | ~10/min (2 pollers × 12s) | ~5/min (1 poller × 12s) |
| Tab visible, admin / mechanic persona | ~5/min (Launcher only) | ~5/min (unchanged) |
| Tab hidden | ~5–10/min (kept polling) | 0/min (paused) |

For a user who leaves `/ask` open in a background tab all day, this drops from ~3 000 wasted requests/8h to zero.

**Files changed.** 4 files:

- New — [apps/web/lib/chat/unread-rollup-context.tsx](apps/web/lib/chat/unread-rollup-context.tsx) — `UnreadRollupProvider` + `useUnreadRollup()` hook. Single poller, visibility-aware.
- Updated — [apps/web/components/redesign/AppLayout.tsx](apps/web/components/redesign/AppLayout.tsx) — wraps both floating consumers in the provider, with the persona mapped to the chat persona (`'shop'` for shop, `'owner'` for everything else).
- Updated — [apps/web/components/launcher/UnifiedLauncher.tsx](apps/web/components/launcher/UnifiedLauncher.tsx) — removed the local `setInterval`/`fetch`, replaced with `useUnreadRollup()` + a small effect to recompute `hasUnread` against `mac.launcher.lastSeenMessageAt`.
- Updated — [apps/web/components/chat-bubble/work-order-chat-bubble.tsx](apps/web/components/chat-bubble/work-order-chat-bubble.tsx) — same pattern; preserves the per-WO `wo-chat-last-seen:*` semantics for `hasUnread` + `unreadPreview`.

**Verified.** `tsc --noEmit` is clean on all four files (only pre-existing errors elsewhere unchanged). End-to-end browser verification was blocked by auth (`/ask` requires a logged-in session in the preview), but the changes are localised: the dev server picks them up via HMR. After a hard refresh of `/ask`, the network tab should show `messages-unread` firing once every 12s (not twice), and stop entirely when the tab is hidden.

**Commit.** _Pending._

---

## 2026-05-25 — Session cleanup: ignore `.tmp/`; `useTenantRouter` stabilised

Two small follow-ups at the end of the inspector + audit session:

**Gap 1.** Debug scripts created during the audit (`.tmp/inspect-doc.mjs`, `.tmp/render-pdf-pages.py`) dump JSON and render PDF pages into `.tmp/`. Without an ignore rule, every future `git status` would show `?? .tmp/` (≈ 29 MB after one run) as noise, and a careless `git add .` would commit it.

**Fix 1.** Added `.tmp/` to [.gitignore](.gitignore) under a new "Local scratch / debug artifacts" section so the directory is invisible to git for everyone.

**Gap 2.** The user opened `/ask?aircraft=<id>` and saw the network tab firing `/api/aircraft` continuously in a back-to-back loop, never stopping. Beyond the obvious perf hit, this also re-ran the dedup + canonical-match logic on every iteration, occasionally racing the user's own dropdown selection via `router.replace`. The same root cause was previously suspected during the session's `/admin/command-center` `TypeError: Cannot read properties of null (reading 'useContext')` crash — that one was masked by a stale `.next` webpack cache.

**Root cause.** `useTenantRouter()` in [tenant-link.tsx](apps/web/components/shared/tenant-link.tsx) returned a fresh object literal every render — it spread the underlying Next.js router and constructed new arrow-function wrappers for `push` / `replace` / `prefetch`. Consumers like the aircraft-loader effect at [ask-experience.tsx:495](apps/web/components/ask/ask-experience.tsx:495) listed `router` in their dep array, so each `setAircraft(...)` re-render produced a "new" router → effect re-fires → fetch → setState → render → loop. Next.js's `useRouter()` itself is stable; the instability was entirely in our wrapper.

**Fix 2.** Wrapped the returned object in `useMemo` keyed on `[router, tenantSlug, demo]` so the reference is stable across renders. Inlined `ctx` inside the memo so dependency tracking stays correct. One-line-of-logic change at the root, but it impacts all **42 files** that call `useTenantRouter` — any of them with `router` in a `useEffect` deps array had a latent version of this same bug.

**Files changed.** 2 files:

- Committed — [.gitignore](.gitignore) — new `.tmp/` ignore.
- Working tree (not yet committed) — [apps/web/components/shared/tenant-link.tsx](apps/web/components/shared/tenant-link.tsx) — `useMemo` wrap of `useTenantRouter` return value.

**Verified.** Gitignore: `.tmp/` no longer appears in `git status` output. `tenant-link.tsx`: end-to-end browser verification in the preview environment was blocked by auth (`/ask` requires a logged-in session); the change is small, targeted, and structurally correct. The user's live dev server picks up the fix via HMR — after a hard refresh of `/ask`, `/api/aircraft` should fire **once** on mount, not continuously.

**Commit.** `.gitignore` → `498ef386`. `tenant-link.tsx` → pending (operator to commit + push).

---

## 2026-05-25 — Inspector polish + first real-doc audit findings

**Two follow-up bug fixes to the inspector** (both surfaced while a real platform admin used it), and a documented audit of one real propeller logbook that revealed material problems in the existing field-extraction pipeline. Fixes ship in this commit; the extraction bugs are scoped for the next session.

**Fix 1 — PDF side pane was always showing page 1 of N.** The first cut of [inspect-pdf-pane.tsx](apps/web/components/admin/inspect-pdf-pane.tsx) reused the shared `DocumentViewer` from `components/ask`, which is intentionally designed for Ask-AI citation rendering: it always appends `?page=N` to `/api/documents/[id]/preview`, and the preview route uses `pdf-lib` to extract that page as a *standalone single-page PDF*. Great for citation snippets, wrong for an admin inspector where the operator wants to scroll context around the chunk they're looking at. Rewrote the pane to load the full PDF once and seek via hash mutation (`contentWindow.location.hash = 'page=N'`) — same browser-native PDF viewer, no per-jump reload, page indicator now correctly reads `N / 15` on a 15-page doc.

**Fix 2 — OCR tab was silently empty even when Summary showed 15 pages.** The OCR tab's `document_pages` SELECT requested columns (`ocr_raw_text`, `page_classification`, `classification_confidence`, `arbitration_confidence`, `page_image_path`) that don't exist on `document_pages` — those live on the sibling `ocr_page_jobs` table. PostgREST rejected the whole query, `data` came back `null`, the length check evaluated to 0, and the user saw a misleading "No `document_pages` rows for this document yet — text-native PDF" empty state. Fixed by (a) restricting the `document_pages` SELECT to columns that actually exist there, (b) separately fetching `ocr_page_jobs` and merging per-page-number for the richer fields, (c) surfacing query errors as a red error card so this class of bug can't masquerade as "empty" again.

**Audit — propeller logbook `178fc22f-…` (N401LP, 15 pages, OCR confidence 0.96 avg).** I read pages 4–10 of the PDF visually with my multimodal vision and compared every entry against what the pipeline stored. The OCR step is doing fine; **the field extractor is the problem.** Three concrete findings, all material for production-readiness:

1. **Entry recall is ~37%.** Pages 4–9 each contain 3 or 4 distinct logbook entries in the standard ASA-SP-L 4-up layout. The extractor produces exactly **one event per page** every time. Counted across pages 4–10 I see ~19 entries in the PDF; only 7 events in `ocr_extracted_events`. Every "list all 100-hour inspections" query, every AD-applicability computation, and every owner-facing historical logbook view is therefore wrong by ~63%.

2. **The 7 events that DO exist are field-blended Frankensteins.** Page 4's stored event has date+tach from the Chino 7/22/2019 entry but work_description+mechanic from the Infinity 4-29-2019 annual — a row that doesn't correspond to any real entry. Page 5's stored event is a three-way blend (date from Chino 4/25/2020, tach from Chino 1/23/2020, work_desc from Long Beach 11/23/2019 prop-removal, ia_number from yet another row). 5 of 7 stored events have at least one field from the wrong entry.

3. **Confidence scores are not measuring per-field accuracy.** Every row stores `confidence_overall = confidence_date = confidence_tach = confidence_mechanic` — the same value, always the page-level OCR confidence. So events with provably wrong work_description and provably wrong mechanic are auto-approved at 0.96, projected into `logbook_entries` and `maintenance_events` by the trigger, and never reach the human review queue. Bad data is silently flowing into the source-of-truth tables.

Bonus side findings: the **most recent entry in the book** (page 10, JDA Services 1/24/2024) has no `canonical_document_chunks` row, so vector retrieval cannot reach it; meanwhile pages 11–14 (blank "FACTORY BULLETINS" forms and pages containing the literal string `"Notes"`) **are** in the canonical layer — promotion logic is keeping noise and dropping signal.

**Root cause (best guess pending code-read in the next session).** The `field_extraction` stage at [server.ts:1817](apps/web/lib/ingestion/server.ts:1817) appears to call the extractor LLM with the full per-page text and ask for one event, instead of a list of events. On a 4-up ASA logbook page this manifests exactly as observed.

**What's deferred to the next session (a fork from here).** (1) Rewrite the field-extraction prompt to return a list of events per page; (2) crop the page image into entry-level sub-regions before extraction (the visual layout is consistent and exploitable); (3) measure per-field confidence independently rather than copying page OCR confidence; (4) fix canonical-promotion to keep real-content pages and drop blank forms; (5) add a "logbook page produced fewer than 2 events" tripwire that flags for human review.

**Files changed in this commit.** 3 files — only the inspector polish ships now; the audit work is documented above for the next session to pick up:

- New — [apps/web/app/(app)/admin/documents/[id]/inspect/page.tsx](apps/web/app/(app)/admin/documents/[id]/inspect/page.tsx) — full inspector (Summary / OCR / Chunks / Canonical+Context / Extracted events tabs, two-column layout with sticky source-PDF pane, per-row "→ p.N" jump pills, active-page emerald tint, error cards on failed queries).
- New — [apps/web/components/admin/inspect-pdf-pane.tsx](apps/web/components/admin/inspect-pdf-pane.tsx) — full-PDF iframe pane with hash-based page navigation (no per-jump reload).
- Updated — [apps/web/app/(app)/admin/documents/admin-documents-client.tsx](apps/web/app/(app)/admin/documents/admin-documents-client.tsx) — "Inspect pipeline content →" link in the expanded-row panel header.

Temporary audit scripts (`scripts/inspect-doc.mjs`, `scripts/render-pdf-pages.py`) and rendered page images under `.tmp/pdf-pages/` are intentionally **not** committed — they're local debug artifacts kept for the follow-up session to reuse.

**Verified.** Local `tsc --noEmit` on the inspector files is clean (pre-existing errors elsewhere unchanged). The OCR-tab fix compiles and renders against a real doc — confirmed in the live `/admin/documents/<id>/inspect?tab=ocr` page after restart. The audit was performed against the actual production Supabase using the service role from `apps/web/.env.local` (read-only SELECTs).

**Commit.** _This commit._

---

## 2026-05-25 — Pipeline Inspector: source-PDF side panel

**Gap.** The first cut of the Pipeline Inspector showed *what the pipeline produced* (OCR text, chunks, canonical chunks with `context_text`, extracted events) but not *what the original document actually looked like*. To find ingestion bugs the operator has to compare the two — "the OCR for page 7 says X, but the PDF page 7 actually shows Y" — and that meant flipping between tabs and a separate `/documents/[id]` browser tab.

**Fix.** Inspector is now a two-column view on `xl+` screens: tabs on the left, the source PDF on the right. The PDF column is sticky so it stays visible while scrolling a long chunks list. Each pipeline item (OCR page, chunk, canonical chunk, extracted event) now carries a small "→ p.N" pill that updates the right pane to that page without losing scroll position. The currently-shown page is tinted emerald in the list, so you can tell at a glance which chunk corresponds to the PDF page you're inspecting.

URL state is `?tab=X&page=N&chunk=<id>` — fully linkable. The PDF pane reuses the existing `DocumentViewer` (the same component the Ask AI side panel and the `/documents/[id]` page use), so PDF rendering, page navigation, and the citation-snippet highlight all behave identically.

**Files changed.** 2 files:

- New — [apps/web/components/admin/inspect-pdf-pane.tsx](apps/web/components/admin/inspect-pdf-pane.tsx) — thin client wrapper that dynamic-loads the existing `DocumentViewer` and synthesizes the citation prop from page + optional chunk id.
- Updated — [apps/web/app/(app)/admin/documents/[id]/inspect/page.tsx](apps/web/app/(app)/admin/documents/[id]/inspect/page.tsx) — two-column layout, `?page=N` parsing, `JumpToPage` link component, per-row jump pills and active-page tinting in OCR / Chunks / Canonical / Events tabs.

**Verified.** Local `tsc --noEmit` pass shows no new TypeScript errors in either file. End-to-end browser verification deferred for the same reason as the previous inspector entry — admin-gated route, needs a real Supabase session + ingested documents.

**Operational note.** Production admin credentials were shared in the chat during this session. Recommend rotating the `info@myaircraft.us` password and enabling MFA — the DB CHECK constraint locks platform-admin to that single email, so that login is effectively the master key.

**Commit.** _Pending._

---

## 2026-05-25 — Pipeline Inspector for one document

**Gap.** A new developer taking over the RAG ingestion pipeline (production-readiness pass) needed to see the actual *content* produced at each pipeline stage for a given document — what OCR extracted from each page, how many chunks were produced and where they split, which chunks got promoted to the canonical retrieval layer, what `context_text` Wave 2 added, and whether embeddings actually exist. The platform already had per-stage *timing* visibility (`/admin/documents` table + `IngestionProgressCard`) but nothing showed the content itself. Without it, finding ingestion bugs meant writing one-off SQL.

**Fix.** New admin route `/admin/documents/[id]/inspect` (platform-admin only, gated by the existing `/admin` layout). Five tabs, all server-rendered, navigation via `?tab=` query string so every view is linkable:

- **Summary** — doc metadata header, stats grid (OCR page count, avg confidence, chunk counts, canonical counts, contextualization coverage, embedding coverage, extracted-event status), full pipeline-stage timeline from `ingestion_progress`.
- **OCR** — every `document_pages` row as an expandable item with page number, OCR engine confidence (colour-banded against the review-queue rescore thresholds), classification, char count, image path, and the full raw OCR text.
- **Chunks** — every `document_chunks` row (paginated past PostgREST's 1 000-row cap) with chunk_index, page range, token/char counts, section title, full chunk text. Page-break markers (▸) highlight where the splitter crossed onto a new page so cuts at section boundaries are easy to verify.
- **Canonical + Context** — every `canonical_document_chunks` row with the Wave 2 `context_text` blurb, the verbatim cited `chunk_text`, "ctx" / "emb" presence badges, and a top-of-page stats strip ("X of Y raw chunks promoted · Z with context_text · W with embeddings — ⚠ missing flagged"). This is the tab that surfaces the most common silent failure modes — a chunk that exists but has no embedding will silently never be retrieved.
- **Extracted events** — full `ocr_extracted_events` table for the doc with per-field confidence, mechanic / IA info, review status. The events that get auto-promoted (via the `promote_approved_event_to_logbook` trigger) into both `logbook_entries` and `maintenance_events`.

The inspector is discoverable from the existing admin pipeline monitor — clicking a row to expand it now also shows an "Inspect pipeline content →" link in the panel header.

**Files changed.** 2 files:

- New — [apps/web/app/(app)/admin/documents/[id]/inspect/page.tsx](apps/web/app/(app)/admin/documents/[id]/inspect/page.tsx)
- Updated — [apps/web/app/(app)/admin/documents/admin-documents-client.tsx](apps/web/app/(app)/admin/documents/admin-documents-client.tsx) (added the Inspect link inside the expanded row panel)

**Verified.** Local `tsc --noEmit` pass shows no new TypeScript errors in either file (pre-existing errors elsewhere in the repo are unchanged). End-to-end browser verification deferred — the route is admin-gated and depends on a real Supabase session + a populated org with documents, which can't be exercised from this session's environment. The first real verification will be the next admin login.

**Why this matters for the production push.** This is the foundation for every following debugging step. Once you can see a real document's chunks and embeddings side-by-side with its OCR text, the next questions ("is the splitter cutting mid-sentence?", "did Wave 2 actually run on this doc?", "do all canonical chunks have embeddings?") become observations instead of theories. The not-built stretch tabs — PageIndex tree and Vision pages — are deferred until a first pass over real documents tells us what we actually need next.

**Commit.** _Pending._

---

## 2026-05-24 — Marketing header now auth-aware

**Gap.** Signed-in users visiting `/` (and any other marketing page — `/pricing`, `/features`, `/blog`, `/about`, `/scanning`, etc.) saw "Sign in" and "Get started" buttons in the top-right header. The buttons made it look like the user had been logged out, even though the session was still valid (clicking "Sign in" would immediately bounce to `/dashboard` because `middleware.ts` already redirects authed users away from auth routes). The experience was confusing for returning users.

**Why this happened.** `apps/web/middleware.ts` redirects authenticated users away from `/login` (and other auth routes) but does **not** touch marketing routes. The `PublicLayout` header is a client component that always rendered the signed-out CTAs without checking auth state.

**Fix.** In [apps/web/components/marketing/vite/PublicLayout.tsx](apps/web/components/marketing/vite/PublicLayout.tsx):

- Added an `isAuthed` state and a `useEffect` that hits `GET /api/me`.
- When authed, both the desktop and mobile headers show a single blue **Dashboard** button linking to `/dashboard`.
- When signed out, the existing "Sign in" + "Get started" CTAs are preserved unchanged — no marketing regression.

**Implementation note.** The first attempt used the browser-side Supabase client (`createBrowserSupabase` → `auth.getUser()`) to detect auth state. It returned `null` user even when a valid session existed — because Supabase auth cookies in this project are HttpOnly and invisible to JavaScript. Switched to `fetch("/api/me")`, which is served by an existing route that uses the server-side Supabase client (`createServerSupabase()`) and reads HttpOnly cookies correctly. Returns 200 when authed, 401 otherwise.

**Files changed.** 1 file — `apps/web/components/marketing/vite/PublicLayout.tsx`.

**Verified.** Local dev server at `localhost:3001`:
- Signed-out path: "Sign in" + "Get started" remain visible — no regression confirmed via screenshot.
- Signed-in path: single "Dashboard" button shows — confirmed by user in their browser after refresh.
- No console errors, clean HMR recompile.

**Commit.** _Pending._

---

## 2026-05-24 — Dev server launch config fix (internal)

**Small infra fix.** `.claude/launch.json` was running `npm run dev -- --port 3001`. The repo's root `package.json` runs `turbo run dev` which doesn't accept a `--port` flag and bailed with `unexpected argument '--port' found`.

**Fix.** Replaced with `pnpm --filter @myaircraft/web dev --port 3001` so the port flag reaches `next dev` directly. This is internal — only affects the AI-assisted dev workflow, not the product.

**Verified.** Dev server starts on port 3001; homepage renders cleanly.

**Commit.** _Pending._

---

## 2026-05-24 — Repo housekeeping: untrack `.claude/settings.local.json`

**Small repo fix.** `.claude/settings.local.json` was listed in `.gitignore` but had been tracked before the ignore rule was added — so it kept showing in `git status` and changes kept getting committed. Ran `git rm --cached` so the gitignore rule actually takes effect from this commit forward. Local file untouched.

**Commit.** _Pending._

---

## 2026-05-24 — WORKLOG + Stop hook automation (internal)

**Setup.** Stood up the freelance work-tracking workflow so the client has a single document to read for transparency.

- `WORKLOG.md` at repo root — this file.
- `.claude/hooks/check-worklog.ps1` — Stop hook that nudges if source changed but `WORKLOG.md` wasn't updated this session.
- `.claude/commands/worklog.md` — `/worklog` slash command for manual updates.
- `.claude/settings.json` — wires the Stop hook into the existing hook config.

**Commit.** _Pending._

---
