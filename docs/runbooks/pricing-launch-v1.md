# Pricing Launch v1 — Operational Runbook

> Operational checklist for flipping aircraft.us from Beta to v1 (Standard + Pro live, billing on).

**Status:** 🟡 wiring complete (Phase 17), waiting on real Stripe test keys + migration apply.
Phase 17 launch wiring report: `/docs/phase-17-launch-wiring-report.md`.

**Locked strategy:** see `/docs/new implementation/context.md` Section 12. Do not modify without Andy's approval.

## Prerequisites (must be true before starting)

- [x] Migrations 105–108 applied (Phase 14)
- [x] Migrations 109–115 applied (Phase 16)
- [ ] **Migration 116 — `tier_pricing_skus`** APPLIED to production
- [ ] **Migration 117 — `stripe_webhook_events`** APPLIED to production
- [ ] **Migration 118 — system organization sentinel** APPLIED to production
- [x] Phase 17 sprints 17.1–17.7 deployed to production (commits up through `2f9ef8f`)
- [ ] Real Stripe test keys in env: `STRIPE_SECRET_KEY=sk_test_…` and `STRIPE_WEBHOOK_SECRET=whsec_…` (replacing the Phase 14 `sk_placeholder_…` stubs)
- [ ] `RESEND_API_KEY` pushed to Vercel Production env
- [ ] Stripe webhook endpoint registered: `https://www.myaircraft.us/api/webhooks/stripe` (live URL after launch)

## Step 1 — Wire real Stripe Products + Prices

> **Phase 17 update:** The manual env-var-per-price flow is replaced by
> `tier_pricing_skus` + `lib/billing/stripe-sync.ts`. One admin POST
> creates all 6 Products+Prices and persists their IDs to the table.
> Runtime code reads from the table, not from env.

1. Land real Stripe test keys in env (replace placeholders):
   - `STRIPE_SECRET_KEY=sk_test_…`
   - `STRIPE_WEBHOOK_SECRET=whsec_…`
2. Apply migration `116_tier_pricing_skus.sql` (Supabase dashboard SQL editor).
3. Hit the sync endpoint as platform admin:
   ```
   curl -X POST https://www.myaircraft.us/api/admin/billing/sync-stripe \
        -H "Cookie: <your admin session cookie>"
   ```
4. Confirm via dashboard: 6 Stripe Products created with `metadata.lookup_key = tier_<slug>_<bracket>_v1`, 6 Prices each at the right `unit_amount`. Verify a row in `tier_pricing_skus` for each.

The mapping the sync produces (exactly what pricing-config.ts says):

| Stripe Product | Tier | lookup_key | aircraft range | $/aircraft/mo |
|---|---|---|---|---|
| `Standard (1–5 aircraft)` | standard | `tier_standard_1to5_v1`   | 1–5  | $99 |
| `Standard (6–15 aircraft)` | standard | `tier_standard_6to15_v1`  | 6–15 | $79 |
| `Standard (16+ aircraft)` | standard | `tier_standard_16plus_v1` | 16+ | $59 |
| `Pro (1–5 aircraft)` | pro | `tier_pro_1to5_v1`   | 1–5  | $149 |
| `Pro (6–15 aircraft)` | pro | `tier_pro_6to15_v1`  | 6–15 | $129 |
| `Pro (16+ aircraft)` | pro | `tier_pro_16plus_v1` | 16+ | $109 |

The webhook handler at `/api/webhooks/stripe` already maps Phase 6
per-persona price IDs back to entitlement rows; for the per-tier
flow, the metadata field `organization_id` on the Checkout session
gives the webhook the right org. **DO NOT** retire the Phase 6
persona prices in `lib/billing/products.ts` until existing
Owner/Mechanic/Bundle subscribers are migrated.

## Step 1.5 — Apply migrations 117 + 118

```
117_stripe_webhook_events.sql    # idempotency log for the webhook
118_ai_activity_log_system_org.sql # closes ai_activity_log FK error
```

Both are committed in `supabase/migrations/`. Apply via Supabase
dashboard SQL editor (paste each file's contents). Order doesn't
matter — they're independent of each other.

## Step 2 — Set tier on each existing org

Use `/admin/billing/orgs` (Phase 14 Sprint 14.5). The page lists every org with current tier (all `'beta'` by default), aircraft count, and "Change tier" buttons.

For each prospective customer:
1. Open `/admin/billing/orgs`, find the org.
2. Click `→ standard` or `→ pro` per their commitment.
3. Verify the row's "Monthly" cell now shows the correct calculated price.
4. **Leave `tier_billing_disabled = true`** (the kill-switch) until step 3.

Tier change writes a `tier_history` audit row with the operator's user_id and the change time.

## Step 3 — Flip `tier_billing_disabled` per org as they upgrade

For each org that has signed:
1. Confirm the customer's Stripe payment method is attached (via Stripe portal or `/api/billing/portal`).
2. Use the "Disable billing" / "Enable billing" toggle in `/admin/billing/orgs`.
3. Verify in Stripe dashboard that the customer's first invoice generates correctly.

The kill-switch is an OR check: while ON, `getEffectiveTier()` returns `'beta'` regardless of the nominal tier. This means even if the tier was set to `'pro'` in step 2, no charges happen until step 3.

## Step 4 — Test one real charge end-to-end

Use an internal test account:
1. Create a test org with 1 aircraft via `/onboarding`.
2. From `/admin/billing/orgs`, set `tier='standard'`.
3. Toggle billing enabled.
4. Add a real payment method (e.g. Stripe test card `4242 4242 4242 4242`).
5. Trigger a Stripe invoice via the customer portal flow.
6. Verify webhook lands cleanly + `tier_billing_disabled` stays in the right state.
7. Refund the test charge.

## Step 5 — Marketing announcement

Pricing page (`/pricing`) is already live and reads from `pricing-config.ts`, so the prices customers see match what they'll be billed.

Recommended announcement contents:
- "Beta is ending on `<date>` for new signups; existing Beta users get grandfathered pricing or a 30-day notice."
- Link to `/pricing`
- Direct CTA to upgrade via `/admin/billing/orgs` (or self-serve upgrade flow if built)

## Step 6 — Migrate Beta users — Andy decides

Two options:
1. **Grandfather pricing** for all current Beta users (e.g. fix at $79/aircraft for Standard / $129/aircraft for Pro for life). Implement by setting their tier appropriately + leaving `tier_billing_disabled=true` indefinitely (or via a future `grandfathered_pricing` column).
2. **30-day notice** + auto-flip on day 31. Code this as a tier_history row with `reason='auto-migration after 30-day notice'` set to standard/pro on day 31, billing enabled.

Default if nothing is decided: stay in Beta indefinitely (`tier_billing_disabled=true`), no charges.

## Operational levers

- **Per-aircraft tier override:** `aircraft.tier_override` lets a single aircraft on a Standard org get Pro processing. UI for this isn't built yet (Phase 14 follow-up); set via SQL or future admin page.
- **Force-bump batch queue:** `/admin/billing/batch` "Process Standard queue now" button bumps all Standard scheduled_for to NOW so workers process immediately. Useful for emergencies (cron failure, customer demo).
- **Disable billing for everyone instantly:** SQL — `UPDATE organizations SET tier_billing_disabled = true;`. Effective the next request; getEffectiveTier collapses everyone to beta.
- **Disable Modal fallback during a billing test:** unset `MODAL_API_KEY` in Vercel — only Colab queue worker processes jobs. Modal stub kicks in for any worker call.

## Rollback

If something goes wrong post-launch:
1. **Kill billing** — `UPDATE organizations SET tier_billing_disabled = true;` (everyone collapses to beta, no new charges).
2. **Revert tier changes** — replay tier_history INSERTs in reverse order, OR `UPDATE organizations SET tier='beta';` for the affected orgs.
3. **Revert Stripe** — pause/cancel the Stripe Subscriptions through the dashboard (or via `mcp__stripe__cancel_subscription`).

## Open follow-ups (logged in phase-14 report)

- Per-doc expedite ($5 button on Standard tier docs) — UI not built
- Volume-tier UI on signup vs admin override — not built; admins manually set tier today
- Status page (/status) — not built
- SOC 2 actually achieved — currently disclosed as "in progress" in `/security`
