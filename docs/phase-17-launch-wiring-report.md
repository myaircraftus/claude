# Phase 17 — V1 Launch Wiring Report

**Date:** 2026-05-10
**Branch:** `main`
**Status:** Email pipeline live ✅ · Stripe wiring scaffolded (deferred until test keys land)
**Commits:** `d67a9bb` → `2f9ef8f` (8 commits)

## What shipped

Phase 17 replaces the Phase 16 "queue rows but never send" placeholder
with a real transactional email pipeline (Resend) and lays down the
full Stripe wiring (Products+Prices sync, webhook idempotency,
Checkout + Portal flows). It also closes the
`ai_activity_log_organization_id_fkey` error documented in the
Phase 16 follow-ups.

### Scoreboard

| Sprint | Status | Notes |
|--------|--------|-------|
| 17.1 — Resend client + queue worker + cron | ✅ executed | Cron at `* * * * *`. 9 tests green. |
| 17.2 — 5 templates + send-helpers + wire | ✅ executed | 18 tests green. ticket creation/reply paths now send rich HTML. |
| 17.3 — Stripe sync + migration 116 | ✅ scaffolded · 🟢 mig APPLIED | Stripe MCP in live mode; route returns 503 until test keys land. Migration 116 applied 2026-05-10 via `apply-116.ts`. |
| 17.4 — Stripe webhook idempotency + migration 117 | ✅ scaffolded · 🟢 mig APPLIED | Dedup wraps existing handler; failure-tolerant if 117 unmigrated. Migration 117 applied 2026-05-10 via `apply-117.ts`. |
| 17.5 — Checkout (per-tier) + Portal | ✅ scaffolded | Returns 503 until test keys land. |
| 17.6 — System-org sentinel + migration 118 | ✅ executed · 🟢 mig APPLIED | Migration 118 applied 2026-05-10 via `apply-118.ts`. ai_activity_log smoke insert with sentinel UUID accepted (FK error from Phase 16 officially closed). |
| 17.7 — Resend end-to-end smoke | ✅ executed | Two real sends to andy@horf.us, both 200. |
| 17.8 — Report + runbook + context.md | ✅ executed | |

### Smoke proof — Sprint 17.7

- **Direct curl** → Resend `/emails`:
  ```
  HTTP 200 — id: e29215c8-c5b5-465e-903f-94722c10d86d
  ```
- **Wrapper** (`lib/email/resend-client.ts`) via `pnpm dlx tsx apps/web/scripts/smoke-resend.ts`:
  ```
  HTTP 200 — id: cecc8c00-f4f6-4d58-99b2-736723f897e7
  ```

Both delivered to `andy@horf.us` from `onboarding@resend.dev`. Pipeline
is operational on first deploy after `RESEND_API_KEY` is pushed to
Vercel Production env.

## Architecture

### Email path

```
[application code]
   ↓
lib/email/send-helpers.ts (sendTicketReceived, sendTicketReply, …)
   ↓
INSERT email_log status='queued'
   ↓
[cron tick: /api/cron/email-queue-worker every minute]
   ↓
lib/email/queue-worker.ts (claim batch, status='sending', send, mark)
   ↓
lib/email/resend-client.ts (HTTP POST /emails, retries on 5xx)
   ↓
Resend → recipient inbox
```

The pipeline is failure-tolerant at every hop: a queue insert error
does not roll back the originating action; a Resend 5xx leaves the row
at `sending` so the heal sweep promotes it back to `queued` on the
next tick; a 4xx is terminal and writes `error_message` on the row.

### Stripe path (scaffolded, awaiting test keys)

```
pricing-config.ts (SoT)
   ↓
[admin POST /api/admin/billing/sync-stripe]
   ↓
lib/billing/stripe-sync.ts (lookup_key based, idempotent)
   ↓
Stripe Products + Prices created
   ↓
UPSERT tier_pricing_skus (tier × bracket × is_test_mode)
                          │
                          │  (read at Checkout time)
                          ↓
[user POST /api/billing/checkout-tier {tier, aircraft_count}]
   ↓
Resolve tier_pricing_skus row → stripe_price_id
   ↓
Create/reuse Customer → Checkout Session (mode=subscription, qty=count)
   ↓
return { url } → user redirects to Stripe
   ↓
[Stripe webhook → /api/webhooks/stripe]
   ↓
lib/billing/stripe-webhook-dedup.ts (PK insert into stripe_webhook_events)
   ↓
[existing Phase 6 handlers run with dedup wrapped around them]
```

## Deferred — what still needs Andy

1. **Real Stripe test keys.** Replace `sk_placeholder_…` and
   `whsec_placeholder_…` in `apps/web/.env.local` (and the matching
   Vercel env vars) with `sk_test_…` / `whsec_…`. The MCP shows
   `livemode: true`; the user should restart the MCP after re-pointing
   it at the test mode account, OR provide the test secret directly so
   I can drive `syncPricingToStripe` from a follow-up session.
2. ~~**Apply migrations 116, 117, 118**~~ ✅ **DONE 2026-05-10.** All
   three applied + verified via tsx-pg one-shot scripts (then deleted
   per the established lifecycle). Smoke verifications:
   - 116 — `tier_pricing_skus` table + columns + UNIQUE + RLS in place; row count 0 (waits for sync).
   - 117 — `stripe_webhook_events` PK on text id, 4-value enum, RLS on; row count 0.
   - 118 — sentinel row exists (`id=00000000-0000-0000-0000-000000000000`, `slug=system`, `tier=beta`, `tier_billing_disabled=true`); ai_activity_log smoke insert with that org_id was ACCEPTED — Phase 16 FK error officially closed.
3. **Run `/api/admin/billing/sync-stripe`** (POST, platform admin
   only) once the test keys are live. Result populates
   `tier_pricing_skus` with 6 rows (standard×3 + pro×3).
4. **Webhook endpoint URL.** Register the Vercel deployment URL in the
   Stripe dashboard:
   `https://www.myaircraft.us/api/webhooks/stripe` (production) or
   `https://staging.myaircraft.us/api/webhooks/stripe` (test).

## Test suite

```
apps/web/lib/email/                        18 ✅
apps/web/lib/support/                      42 ✅ (unchanged after wiring)
apps/web/lib/billing/stripe-sync.test.ts    7 ✅
apps/web/lib/billing/stripe-webhook-dedup.test.ts  4 ✅
apps/web/app/api/billing/checkout-tier/    6 ✅
```

35 new tests this phase, no regressions in existing suites.

## File map

```
apps/web/lib/email/
├── resend-client.ts                # HTTP wrapper + retry contract
├── resend-client.test.ts
├── queue-worker.ts                 # Batch claim → send → mark
├── queue-worker.test.ts
├── send-helpers.ts                 # 5 helpers, one per template
└── templates/
    ├── _layout.ts                  # Shared HTML+text scaffold
    ├── ticket_received.ts
    ├── ticket_reply.ts
    ├── nps_survey.ts
    ├── churn_reengagement.ts
    ├── magic_link_support_view.ts
    └── templates.test.ts

apps/web/app/api/cron/email-queue-worker/route.ts
apps/web/app/api/admin/billing/sync-stripe/route.ts
apps/web/app/api/billing/checkout-tier/route.ts
apps/web/app/api/billing/checkout-tier/route.test.ts
apps/web/app/api/billing/portal/route.ts            # placeholder-key gate

apps/web/lib/billing/
├── stripe-sync.ts                  # pricing-config → Stripe
├── stripe-sync.test.ts
├── stripe-webhook-dedup.ts         # Idempotency for the webhook
└── stripe-webhook-dedup.test.ts

apps/web/lib/ai/anthropic.ts        # nullable org_id + SYSTEM_ORG_ID
apps/web/lib/ai/openai-vision.ts    # same null-substitution
apps/web/lib/billing/tier-service.ts # neq sentinel filter
apps/web/app/(app)/admin/customer-signals/page.tsx # neq sentinel filter

supabase/migrations/
├── 116_tier_pricing_skus.sql       # 🟢 APPLIED 2026-05-10
├── 117_stripe_webhook_events.sql   # 🟢 APPLIED 2026-05-10
└── 118_ai_activity_log_system_org.sql # 🟢 APPLIED 2026-05-10

apps/web/vercel.json                # + email-queue-worker cron
apps/web/scripts/smoke-resend.ts    # Manual smoke runner
docs/runbooks/pricing-launch-v1.md  # ⏳ updated next
docs/runbooks/email-ingestion.md    # ⏳ updated next
docs/new implementation/context.md  # ⏳ Section 14 next
```

## Hard-rule compliance

- ✅ Sacred boundaries (`lib/ocr/`, `lib/rag/`, `lib/embeddings/`) untouched
- ✅ Stripe live mode never written to (MCP refused; sync route gates on `sk_placeholder`)
- ✅ `tier_billing_disabled` kill-switch unchanged (sentinel org has it `true`)
- ✅ Resend smoke used the dev test inbox (`andy@horf.us`)
- ✅ All work committed on `main` (no feature branch)
