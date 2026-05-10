# Pricing Launch v1 — Operational Runbook

> Operational checklist for flipping aircraft.us from Beta to v1 (Standard + Pro live, billing on).

**Status:** 🟡 not yet executed. Pricing infrastructure complete (Phase 14); see `/docs/phase-14-pricing-tiers-report.md`.

**Locked strategy:** see `/docs/new implementation/context.md` Section 12. Do not modify without Andy's approval.

## Prerequisites (must be true before starting)

- [ ] Migrations 105–108 APPLIED to production
  - `apps/web/scripts/apply-105.ts` (org+aircraft tier columns)
  - `apps/web/scripts/apply-106.ts` (vision_index_jobs.scheduled_for)
  - `apps/web/scripts/apply-107.ts` (handwriting_pct + suggests_review)
  - `apps/web/scripts/apply-108.ts` (document_review_requests)
- [ ] Phase 14 sprints 14.1–14.6 deployed to production (commits up through `89e1562`)
- [ ] Stripe account live (currently in mock mode — see `lib/billing/products.ts` for the persona-tier track and decide whether to keep that wiring or replace with the new per-aircraft Stripe products)

## Step 1 — Wire real Stripe Products + Prices

Pricing config (`apps/web/lib/billing/pricing-config.ts`) defines every price point. For each volume bracket, create a Stripe Price under one Product per tier. Mapping:

| Stripe Product | Tier | Stripe Price | aircraft range | $/aircraft/mo |
|---|---|---|---|---|
| `aircraft.us — Standard` | standard | `price_standard_1_5`   | 1–5  | $99 |
| `aircraft.us — Standard` | standard | `price_standard_6_15`  | 6–15 | $79 |
| `aircraft.us — Standard` | standard | `price_standard_16_plus` | 16+ | $59 |
| `aircraft.us — Pro` | pro | `price_pro_1_5`   | 1–5  | $149 |
| `aircraft.us — Pro` | pro | `price_pro_6_15`  | 6–15 | $129 |
| `aircraft.us — Pro` | pro | `price_pro_16_plus` | 16+ | $109 |

**Use the Stripe MCP** (mcp__stripe__create_product / create_price) so the IDs land in env vars without manual copy/paste:

```
STRIPE_PRICE_STANDARD_1_5=price_xxx
STRIPE_PRICE_STANDARD_6_15=price_xxx
STRIPE_PRICE_STANDARD_16_PLUS=price_xxx
STRIPE_PRICE_PRO_1_5=price_xxx
STRIPE_PRICE_PRO_6_15=price_xxx
STRIPE_PRICE_PRO_16_PLUS=price_xxx
```

The webhook handler (`/api/webhooks/stripe`) needs to be extended to recognize these new price IDs and update `organizations.tier` accordingly. **DO NOT** retire the existing per-persona prices from `lib/billing/products.ts` until existing Owner/Mechanic/Bundle subscribers are migrated.

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
