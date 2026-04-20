# ARCHITECT.md — Reference for AI Agents

> **Purpose:** Canonical reference. Agents should READ this first, not re-explore the codebase.
> Every session, the first Agent should read this file. Keep it updated.

## Repo Layout

**Main repo:** `/Users/andy/1. do not touch/myaircraft`
**Web app:** `apps/web/` (Next.js 14.2.3 App Router)
**Mobile:** `apps/mobile/` (Expo/React Native)
**Parser:** `apps/parser/` (Python PDF parser service)

## Tech Stack

- **Framework:** Next.js 14.2.3 App Router, route groups `(app)` and `(auth)`
- **DB:** Supabase PostgREST — project `buhrmuzgyzamowkaybjg`
- **Auth:** Supabase Auth, cookie-based sessions via `@supabase/ssr`
- **Storage:** Supabase Storage (documents bucket)
- **AI:** OpenAI (embeddings, chat), Google Document AI (OCR)
- **Background jobs:** Trigger.dev (`trigger/jobs/`)
- **Deploy:** Vercel — project `myaircraft-claude`, alias `www.myaircraft.us`
- **Package manager:** pnpm at `/Users/andy/.local/bin/pnpm` (no local Node.js!)
- **Deploy cmd:** `/Users/andy/.local/bin/vercel deploy --prod`
- **Build runs on Vercel** — don't try `pnpm build` locally

## Key Paths

### Auth & Middleware
- `apps/web/middleware.ts` — protected routes, tenant routing
- `apps/web/lib/supabase/server.ts` — server supabase client
- `apps/web/lib/supabase/browser.ts` — client supabase client
- `apps/web/lib/supabase/request-user.ts` — helper to get user + org from request
- `apps/web/lib/auth/context.ts` — auth context
- `apps/web/lib/roles.ts` — role constants: `ADMIN_AND_ABOVE`, `MECHANIC_AND_ABOVE`

### Pages (App Routes)
- `(app)/dashboard/` — main dashboard
- `(app)/aircraft/` — fleet list + detail
- `(app)/aircraft/[id]/` — aircraft detail (uses `components/redesign/AircraftDetail.tsx`)
- `(app)/aircraft/[id]/squawks/` — squawks view
- `(app)/ask/` — AI Ask/Command page
- `(app)/documents/` — document library
- `(app)/documents/upload/` — upload page (reads `?aircraft=<id>` query param)
- `(app)/marketplace/` — parts marketplace
- `(app)/settings/` — user/org settings
- `(app)/admin/` — platform admin
- `(app)/mechanic/` — NEW Codex mechanic-only area
- `(app)/work-orders/` — work orders
- `(app)/invoices/` — invoicing
- `(app)/customers/` — customer management

### Marketing Pages (from Codex)
- `app/about/`, `app/blog/`, `app/contact/`, `app/features/`, `app/pricing/`, `app/privacy/`, `app/scanning/`, `app/terms/`

### API Routes
- `api/upload/` (legacy FormData) — DEPRECATE
- `api/upload/init/` + `api/upload/complete/` — new signed URL flow (USE THIS)
- `api/aircraft/` + `[id]` + `[id]/*` (detect-findings, analyze-discrepancies, tracking, etc.)
- `api/documents/` + `[id]/preview/`
- `api/logbook-entries/` — NEW from Codex
- `api/estimates/` — NEW from Codex
- `api/marketplace/` — parts/documents/seller-plan
- `api/reminders/ai-parse/` — NEW AI reminder parsing
- `api/squawks/structure/` — NEW squawk structuring
- `api/ocr/` (canonicalize, review, arbitrate, benchmark, drift, pages)
- `api/webhooks/stripe/` — has signature verification
- `api/auth/` (login, logout, callback)
- `api/work-orders/[id]/checklist/` + `[id]/pdf/` — NEW
- `api/integrations/oauth/` — NEW OAuth flow
- `api/admin/`, `api/support/`, `api/feedback/`, `api/team/` — NEW admin

### Shared Components
- `components/shared/` — topbar, sidebar, command-palette, feedback-dialog, support-dialog
- `components/redesign/` — new redesigned components (AircraftDetail, Dashboard, DocumentsPage, etc.)
- `components/admin/` — admin UI
- `components/aircraft/` — faa-registry-tab, document-vault-tree
- `components/ask/` — ask-experience, document-viewer-boundary
- `components/documents/` — upload-dropzone, category-filter, gdrive-picker
- `components/marketplace/`
- `components/ui/` — shadcn primitives + custom (toast, confirm, dialog, button, etc.)

### Library Code
- `lib/ingestion/server.ts` (1,669 lines) — document ingestion pipeline
- `lib/ocr/` — OCR providers and orchestration
- `lib/documents/` — taxonomy, classification, books, processing-health
- `lib/rag/` — retrieval, citation-anchors, query-parser
- `lib/intelligence/` — reports, quality, drift
- `lib/aircraft/` — NEW aircraft-specific logic
- `lib/faa/registry.ts` — FAA lookup (with HTML scrape fallback)
- `lib/work-orders/` — NEW work-order logic
- `lib/marketplace/` — NEW marketplace logic
- `lib/integrations/` — external integrations
- `lib/rate-limit.ts` — in-memory rate limiter
- `lib/utils.ts` — escapeHtml, escapeLike, formatCurrency

## Database (Supabase)

**Project ref:** `buhrmuzgyzamowkaybjg`
**Migrations:** `supabase/migrations/001-040.sql`

### Key Tables
- `organizations`, `organization_memberships` (role enum: owner/admin/mechanic/pilot/viewer/auditor)
- `aircraft` — tail_number, make, model, faa_registry_data (JSONB)
- `documents` — status enum: queued → parsing → ocr_processing → chunking → embedding → completed/failed
- `document_pages`, `document_chunks`, `document_embeddings`
- `document_canonical_chunks`, `document_canonical_embeddings`
- `work_orders`, `work_order_lines`, `work_order_checklists` (NEW)
- `invoices`, `invoice_lines`, `payments`
- `customers`
- `squawks`
- `reminders`
- `maintenance_events`, `maintenance_requests`, `maintenance_drafts`
- `logbook_entries` (NEW)
- `estimates` (NEW)
- `parts_library`, `parts_orders`
- `marketplace_parts`, `marketplace_documents`
- `ocr_page_jobs`, `ocr_entry_segments`, `ocr_extracted_events`
- `organization_company_templates` (NEW)
- `pending_invitations`
- `faa_registry_cache`
- `audit_log`

### Status Enums
- **Document:** queued, parsing, ocr_processing, chunking, embedding, completed, failed
- **WO:** draft, open, in_progress, on_hold, awaiting_parts, completed, closed, invoiced, archived, cancelled
- **Invoice:** draft, sent, paid, partially_paid, overdue, void

## Conventions

### Auth Pattern (every protected API route)
```typescript
const supabase = createServerSupabase()
const { data: { user } } = await supabase.auth.getUser()
if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

const { data: membership } = await supabase
  .from('organization_memberships')
  .select('organization_id, role')
  .eq('user_id', user.id)
  .not('accepted_at', 'is', null)
  .single()
if (!membership) return NextResponse.json({ error: 'No organization' }, { status: 403 })
const orgId = membership.organization_id

// For writes, check role:
if (!MECHANIC_AND_ABOVE.includes(membership.role)) {
  return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
}
```

### JSON body parsing
```typescript
let body
try { body = await req.json() } catch {
  return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
}
```

### Client toasts
```typescript
const { addToast } = useToast()
addToast({ type: 'success', message: '...' })
addToast({ type: 'error', message: '...' })
```

### Confirm dialogs
```typescript
const confirm = useConfirm()
const ok = await confirm({ title: '...', message: '...' })
if (!ok) return
```

### JSX in ternaries
Wrap multiple siblings in fragment: `cond ? <A/> : <><B/><C/></>`

### useSearchParams
Wrap pages in `<Suspense>` — required by Next.js 14 static generation.

### Supabase joins
Returns arrays, often needs `as any[]` casting for typed components.

## Gotchas

1. **No local Node.js** — can't run `pnpm build`/`next build` locally. Ship to Vercel to test build.
2. **Credentials in /docs/** — now gitignored but MUST be rotated: AWS keys, GCP service account.
3. **Two upload paths coexist** — legacy `/api/upload` vs new `/api/upload/init`+`complete`. Use new one.
4. **FAA API is dead (503)** — fallback to HTML scraping in `lib/faa/registry.ts`.
5. **Encryption key** — `process.env.APP_SECRET`, throws if missing.
6. **Stripe webhook** — signature verified with `STRIPE_WEBHOOK_SECRET`.
7. **Tenant routing** — URL prefix `/<org-slug>/` supported by middleware but mostly unused.
8. **Redesign layer** — `components/redesign/` is parallel UI; `aircraft/[id]/page.tsx` uses it.

## Deploy Flow

```bash
cd "/Users/andy/1. do not touch/myaircraft"
/Users/andy/.local/bin/vercel deploy --prod
```
Aliases to `https://www.myaircraft.us`. Build takes ~1–2 min.

## Git Flow

- **Main branch:** `main`
- **Worktrees:** `.claude/worktrees/nostalgic-ramanujan` (branch `claude/nostalgic-ramanujan`), `.claude/worktrees/goofy-perlman`
- Work DIRECTLY on main (user's preference) — commit & push, then deploy.
- NEVER force push. Always new commits.

## Open Issues (from audit)

### 🔴 Critical
- [ ] Rotate exposed AWS + GCP credentials (now gitignored)
- [ ] Document upload button from aircraft detail header doesn't navigate (works via direct URL though)
- [ ] Squawk dictation button not working
- [ ] Squawk photo button not working
- [ ] Logbook entry generation is inconsistent
- [ ] Various internal buttons not wired up

### 🟡 Medium
- [ ] Duplicate "Codex Upload Smoke Test" documents in library (test pollution)
- [ ] 1 Failed Doc showing in admin — investigate
- [ ] Document detail modal shows raw aircraft UUID instead of tail number
- [ ] Storage usage hardcoded to 0 in settings

### 🟢 Content
- [ ] Need admin CMS for marketing content (images/videos)
- [ ] Need real integration logos (Stripe, Google Drive, FAA, Document AI, etc.)
- [ ] SEO pass — sitemap, meta tags, blog skeleton

## Active Work Log

_Agents append completed work here. Keeps context of what's already been done._

### 2026-04-20 (Claude, autonomous night run)
- ✅ Gitignored credentials (docs/*.csv, documentai-key.json, .env.deploy, .codex-bin/, .playwright-cli/)
- ✅ Created this ARCHITECT.md reference doc
- 🔄 Committing Codex work to main
