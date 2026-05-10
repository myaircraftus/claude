# Phase 16 — AI Operations Command Center Report

**Date:** 2026-05-10
**Branch:** `main` (in sync with `origin/main`)
**Test suite:** 🟢 **654 / 654** across 43 test files (up from 583 at Phase 15.5 close).
**Sacred boundaries:** ✅ Zero diff in `apps/web/lib/ocr`, `apps/web/lib/rag`, `apps/web/lib/embeddings`.

## Headline

All 11 Phase 16 sprints complete. The platform has gained:

- A unified **support ticket service** end-to-end: public form,
  in-app help widget, email webhook, customer-side magic-link detail,
  admin inbox + per-ticket detail with AI-drafted replies.
- A **two-tier AI triage worker** that auto-resolves common questions
  (password reset / tier lookup / doc indexing / pricing) and
  escalates everything else to admin queue with a Sonnet-drafted
  reply staged for one-click send.
- **Client + server error capture** with stack-hash grouping and
  auto-firing P1 alerts on rate spikes.
- A **system health dashboard** + cost-roll-up cron + automatic
  health alerts.
- An **AI ops assistant** chat — read-only tool agent that answers
  operational questions using the same DB the dashboards read.
- A **/admin/command-center** unified dashboard (now the admin
  homeRoute) with counts + needs-you-now + recent + health + cost +
  customer signals.
- A **floating feedback widget** + nightly **churn signal detector**
  + **/admin/customer-signals** triage page.
- Public **/status** page + auto-built KB at **/support/help**.
- The **"Generate Claude Code Prompt"** killer feature with full
  context packaging, file grep, sacred-boundary rules in every prompt,
  and an audit trail for outcome tracking.

## Sprint outcomes

| Sprint | Title | Commit | Tests added |
|---|---|---|---|
| 16.2 | Customer ticket service + form + email webhook + help widget | `235200b` | 26 |
| 16.3 | AI tier-0/1 triage + auto-resolve + migration 110 | `0e17f12` | 16 |
| 16.4 | Admin support inbox + ticket detail + escalation + P0 banner | `fe819d4` | — |
| 16.5 | Error capture (client + server) + grouping + admin view | `329c864` | 11 |
| 16.6 | Health dashboard + cost tracking + alert generators + migration 111 | `7e0011e` | — |
| 16.7 | `/admin/command-center` (admin homeRoute) | `99083b2` | — |
| 16.8 | AI ops assistant (read-only tool agent) + migration 112 | `6f91813` | 8 |
| 16.9 | Feedback widget + NPS + churn signals + customer-signals page | `c5121b7` | — |
| 16.10 | Public `/status` page + KB at `/support/help` | `ea117f0` | — |
| 16.11 | Generate Claude Code prompt + audit trail + migration 113 | `7f51905` | 10 |
| 16.12 | Final report + context.md lock | (this commit) | — |

**+71 new tests** across the phase. Test suite went from 583 (end of
Phase 15.5) → **654** (end of Phase 16). Zero pre-existing tests
removed or skipped.

## Migrations status

All four Phase 16 migrations are written and committed but **NOT
applied to production**. Andy applies via the established tsx-pg
pattern.

| File | Status | Adds |
|---|---|---|
| `109_ops_spine.sql` | ✅ APPLIED 2026-05-09 (Phase 15.5 Task 1) | 5 spine tables, ops_inbox view, RLS, 13 enum types |
| `110_ticket_replies.sql` | ✅ APPLIED 2026-05-10T07:57Z | ticket_replies (10 cols), email_log (18 cols), suggested_response + triage_classification cols on support_tickets, inc_support_ticket_ai_response RPC, 6 RLS policies |
| `111_cost_snapshots.sql` | ✅ APPLIED 2026-05-10T07:57Z | cost_snapshots (9 cols), cost_source enum, UNIQUE(snapshot_date, source), admin-only RLS, 4 indexes |
| `112_ops_assistant_conversations.sql` | ✅ APPLIED 2026-05-10T07:57Z | ops_assistant_conversations (6 cols), ops_assistant_messages (9 cols), ops_assistant_role enum, 3 RLS policies |
| `113_ops_event_prompts.sql` | ✅ APPLIED 2026-05-10T07:57Z | ops_event_prompts (14 cols), prompt_outcome enum, source_type CHECK, admin select/insert/update policies, 3 indexes |

### Smoke verification (2026-05-10T08:00–08:06Z)

All four smoke tests passed end-to-end via in-process scripts that
mirror the route handlers (Vercel deployment was lagging at smoke
time so we exercised the lib code directly with the production
service-role client). Smoke scripts deleted after success per the
established lifecycle.

- **110 — support triage**: submitted ticket TKT-20260510-0001 ("How
  do I reset my password?") via `/api/public/support/submit`. Ran
  `triageBatch(supabase, 5)`. Result: pattern matched
  `password_reset` (confidence 0.95) → wrote one ticket_replies row
  with is_from_ai=true + ai_action_taken='auto_resolved:password_reset'
  → flipped status new → ai_triaging → resolved → set
  resolution_summary. ✅
- **111 — cost snapshots**: ran `rollUpDay(today)`. Wrote 5 rows
  (anthropic 0¢, modal 3¢ from 1 completed job × 3¢ placeholder,
  stripe/vercel/supabase 0¢ each). `checkCostSpike()` returned
  `today_cents=3 / trailing_30d_avg_cents=0 / spike=false`. ✅
- **112 — ops assistant**: created a conversation, asked "How many
  open support tickets?". Sonnet picked the right tool —
  `querySupportTickets(status='new,ai_triaging,awaiting_admin,
  awaiting_customer')` — got `{tickets:[]}`, returned "**0 open
  support tickets.**" with the SQL-equivalent shape. Persisted user
  + tool + assistant rows in ops_assistant_messages. ✅
- **113 — Claude Code prompt**: generated a prompt against ticket
  TKT-20260510-0001. All 7 sections present (Fix / Reproduction /
  Affected / Relevant files / Suggested fix / Test requirements /
  Hard rules). 1782 chars total. Audit row inserted into
  ops_event_prompts with generated_by_user_id + used_at populated. ✅

### Known follow-up from smoke

- `ai_activity_log` insert during triage threw a foreign-key
  constraint error because the test ticket has `organization_id=NULL`
  (public submission) and ai_activity_log has FK to organizations.
  The triage worker tolerates it (catch + ignore — see
  lib/ai/anthropic.ts), so functionality isn't blocked. Future polish:
  make organization_id nullable on ai_activity_log, OR have triage
  pass a sentinel "system" org id for unscoped tickets. Recorded
  for Phase 17 backlog.

### Vercel deployment status (smoke time)

`/api/admin/ops-assistant` and `/admin/command-center` were 404 /
307-redirect-to-login at smoke time, indicating the Vercel deploy
was still rolling out the latest sprints (16.7+). The migrations
themselves are live and the lib code works correctly against
production data; the customer-facing UI for the assistant + command
center will become reachable on Andy's next page load once the
deploy completes.

### Apply order (no circular deps but order for log clarity)

```
110 → 111 → 112 → 113
```

Each migration is independent of the others; the only ordering
constraint is that 110 must follow 109 (already done) because it
ALTERs support_tickets (109).

## Cron schedules added (apps/web/vercel.json)

| Path | Schedule | Purpose |
|---|---|---|
| `/api/cron/support-triage` | `* * * * *` | Pick up new tickets, run AI triage tier 0+1 |
| `/api/cron/health-alerts` | `*/5 * * * *` | Roll up costs, fire worker/queue/cost/failed alerts |
| `/api/cron/churn-signals` | `30 7 * * *` | Daily churn-risk detection |

Auth: every cron route accepts `x-vercel-cron` header (set
automatically by Vercel) OR `CRON_SECRET` env var (`?secret=` query
or `Authorization: Bearer`).

## Feature flags + rollout plan

Phase 16 is **opt-in by infrastructure** — nothing breaks for
customers if migrations 110-113 stay un-applied:

- `/api/cron/support-triage` no-ops gracefully when ticket_replies
  isn't applied (tries to insert, returns 503-with-hint, falls back).
- `/admin/health` shows zeros for cost_snapshots if 111 isn't applied.
- `/admin/ops-assistant` returns 503 from the persistence path if
  112 isn't applied.
- The Generate Prompt button modal returns 503-with-hint if 113
  isn't applied.

**Recommended rollout:**

1. **Day 0**: apply 110 → smoke `/api/cron/support-triage` once via
   manual `curl ?secret=...&limit=1`. Verify a new ticket lands in
   `awaiting_admin` with a non-empty `suggested_response`.
2. **Day 1**: apply 111 → wait for the `*/5 * * * *` cron tick,
   verify a row in cost_snapshots for today.
3. **Day 2**: apply 112 → load `/admin/ops-assistant`, ask
   "How many open tickets?", verify the model uses
   querySupportTickets and returns a number.
4. **Day 3**: apply 113 → on a real (not-yet-resolved) ticket, click
   "Generate Claude Code Prompt", verify the modal renders the full
   markdown and clicking Copy persists `used_at`.

Each step is independently reversible (no destructive DDL — additive
only).

## Sacred boundary verification

```bash
$ git diff --stat origin/main~12 -- \
    apps/web/lib/ocr \
    apps/web/lib/rag \
    apps/web/lib/embeddings
(empty)
```

Per the locked Phase 16 hard-rule 11 (also added to context.md
Section 4 in this sprint), the AI ops assistant is **read-only —
never mutates data, never sends emails, never executes side effects.
Mutations always require admin click-through.** The 10 tools shipped
in Sprint 16.8 are all SELECTs against existing tables. The
prompt-generator (Sprint 16.11) reads files from disk but never
writes; new files are only created by the admin pasting the prompt
into Claude Code, which is its own session entirely.

## Open follow-ups (deferred to future phases)

- **Real email send (SendGrid / Postmark)** — `email_log` queues rows;
  a future job replaces `delivery_status='queued'` with real provider
  API calls. Runbook + envelope spec in
  `docs/runbooks/email-ingestion.md`.
- **Real status page subscribe** — `/status` shows the placeholder
  copy. Wiring needs the same email provider as outbound transactional.
- **SMS / Slack / PagerDuty notifications** — alert_events fire
  in-product banners only; v2 cross-channel.
- **Persona-strict route guards (Phase 15 F2)** — captured in
  `docs/v2-backlog.md`. Phase 16 didn't depend on it; future Phase 17
  sprint scoped at ~1 sprint.
- **AI suggests fixes (mutating tools)** — the prompt generator
  produces a paste-ready prompt; a future "AI applies the fix to a
  branch and opens a PR" loop is explicitly OUT of scope per the
  Phase 16 brief. Humans review before any code lands.
- **Worker heartbeat write-path expansion** — `vision_worker_heartbeat`
  has 1 row in production; the Phase 11 write path works but workers
  are off most of the time. As more worker types come online (Modal,
  Replicate, RunPod), each needs its own heartbeat upsert.
- **`triageBatch` parallelism** — currently sequential to keep
  Anthropic call-rate predictable. If ticket volume grows, fan out
  with `Promise.allSettled` capped at 5 concurrent.
- **NPS + CSAT trigger surfaces** — `/api/feedback` accepts NPS/CSAT
  payloads but the modal popup triggers (post-invoice, post-WO-resolve)
  are deferred until v1 billing data exists.
- **Per-error detail page** — `/admin/observability/errors` lists
  groups; clicking through to a detail page with the full stack +
  affected-users count + related tickets is a future polish sprint.
- **Bulk actions on `/admin/support/all`** — single-action per ticket
  is enough for v1 volume; bulk-resolve and bulk-assign scoped for
  Phase 17 if support volume warrants.
- **Public ticket-view from KB entries** — KB entries don't carry
  the access_token so they can't deep-link into the public ticket
  detail page. Future sprint can add anonymized full-thread display
  once admin curation is on.

## What's now shippable end-to-end

A customer can:

1. Submit a ticket via `/support` (public form) OR via the in-app `?`
   help widget OR via `support@myaircraft.us` once email parse is
   wired (mock works locally per the runbook).
2. Receive a magic-link email (queued in `email_log`) with their
   ticket number to view the thread.
3. Read AI's response within 60 seconds (cron `* * * * *`).
4. Reply through the magic link or in-app, restarting the loop.

Andy can:

1. Open `/admin/command-center` and see the entire morning at a
   glance — counts, needs-you-now, recent, health, cost, signals.
2. Triage support inbox at `/admin/support/inbox`, click any ticket,
   Approve & Send the AI's draft (or edit it first).
3. View errors at `/admin/observability/errors`, mark "Known issue"
   when relevant, click "Generate Claude Code Prompt" on any
   unresolved ticket to package the full context for a fix.
4. Ask the AI ops assistant questions about platform state and
   trust the answers because every tool call shows its inputs +
   outputs.

## Files added/modified this phase (file map)

**New service modules:**

- `apps/web/lib/support/tickets.ts` — single ticket service
- `apps/web/lib/support/ai-triage.ts` — tier-0 + tier-1 triage worker
- `apps/web/lib/observability/error-capture.ts` — client + server capture
- `apps/web/lib/ops/cost-tracker.ts` — daily cost roll-ups
- `apps/web/lib/ops/assistant.ts` — read-only tool agent
- `apps/web/lib/ops/status-check.ts` — public /status backing
- `apps/web/lib/ops/prompt-generator.ts` — Claude Code prompt assembly

**New API routes:**

- `/api/support` GET/POST — rewritten to use the new schema
- `/api/admin/support` GET/PATCH — rewritten to use the new schema
- `/api/admin/support/[id]/reply` POST — admin send
- `/api/admin/support/counts` GET — nav badge
- `/api/public/support/submit` POST — unauth ticket submission
- `/api/public/support/reply` POST — unauth magic-link reply
- `/api/webhooks/support-email` POST — email ingestion (mock)
- `/api/cron/support-triage` GET — triage cron
- `/api/observability/error` POST — client error capture
- `/api/cron/health-alerts` GET — system health cron
- `/api/admin/ops-assistant` GET/POST — chat endpoint
- `/api/cron/churn-signals` GET — daily churn detection
- `/api/admin/ops-prompt` POST/PATCH — prompt generator

**New pages (admin):**

- `/admin/command-center` (now the admin homeRoute)
- `/admin/support` (rewrite of legacy)
- `/admin/support/inbox`, `/all`, `/[ticketNumber]`
- `/admin/observability/errors`
- `/admin/health`
- `/admin/ops-assistant`
- `/admin/customer-signals`

**New pages (public):**

- `/support` — submit form
- `/support/tickets/[ticketNumber]` — magic-link detail
- `/support/help` — KB
- `/status` — system health

**New components:**

- `components/support/HelpWidget.tsx` — floating ? button
- `components/observability/ClientErrorBoundary.tsx`
- `components/feedback/FeedbackWidget.tsx` — thumbs-up/down
- `components/admin/SupportBanner.tsx` — P0 SLA breach banner
- `components/admin/GeneratePromptButton.tsx`
- `app/(app)/admin/command-center/AutoRefresh.tsx`
- `app/support/support-form.tsx`, `tickets/[…]/reply-form.tsx`
- `app/(app)/admin/support/[ticketNumber]/admin-reply-form.tsx`
- `app/(app)/admin/ops-assistant/ops-chat.tsx`

**New tests (71 cases):**

- `apps/web/lib/support/tickets.test.ts` (26)
- `apps/web/lib/support/ai-triage.test.ts` (16)
- `apps/web/lib/observability/error-capture.test.ts` (11)
- `apps/web/lib/ops/assistant.test.ts` (8)
- `apps/web/lib/ops/prompt-generator.test.ts` (10)

**Migrations (4 NOT applied):**

- `supabase/migrations/110_ticket_replies.sql`
- `supabase/migrations/111_cost_snapshots.sql`
- `supabase/migrations/112_ops_assistant_conversations.sql`
- `supabase/migrations/113_ops_event_prompts.sql`

**Other:**

- `apps/web/vercel.json` — 3 new cron schedules
- `docs/runbooks/email-ingestion.md` — provider hand-off recipe
- `apps/web/lib/persona/config.ts` — admin homeRoute → command-center
- `apps/web/lib/persona/home-widgets.test.ts` — homeRoute assertion
- `apps/web/components/redesign/AppLayout.tsx` — mounts HelpWidget +
  ClientErrorBoundary + FeedbackWidget
- `apps/web/app/(app)/admin/layout.tsx` — mounts SupportBanner
- `apps/web/app/(app)/admin/page.tsx:247` — feedback table → feedback_items
- `apps/web/app/api/feedback/route.ts` — rewritten to use feedback_items
- `apps/web/components/admin/support-table.tsx` — DELETED (orphan)
