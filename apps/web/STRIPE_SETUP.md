# Stripe + Persona-Aware Billing Setup

Final wiring step for the persona-aware billing system. Code is already in place; this doc just walks through what to configure on the Stripe and Supabase side so the trial / paywall / bundle flow works in production.

## Mental model

- **One row per (org, persona) in `entitlements`.** `'owner'` and `'mechanic'` are independent; an org can have an owner trial, a paywalled mechanic, or a bundle subscription.
- **Trial only starts after a card is on file.** This is the single biggest abuse defense — no anonymous email farms running 30-day trials forever.
- **Read access stays after a trial expires; write access does not.** Users see their data with a paywall overlay, not a hard 404. Re-subscribing instantly restores write.

## 1. Create three Stripe products

In Stripe dashboard → Products → **+ Add product**, create:

| Product | Recurring price | Trial | Description |
|---|---|---|---|
| **Aircraft Owner** | $49/month | none (we control the trial server-side) | Logbooks, AD tracking, fleet dashboard, AI search |
| **A&P Mechanic** | $79/month | none | Work orders, invoicing, customer portal, parts catalog |
| **Owner + Mechanic Bundle** | $99/month | none | Both surfaces, single subscription |

Important: leave the trial fields empty in Stripe. The 30-day trial is enforced server-side in `lib/billing/trial.ts` after card-on-file capture.

For each product, click into the price row and copy the **Price ID** (starts with `price_…`).

## 2. Add the price IDs to env vars

Set in Vercel (Production + Preview) and `.env.local`:

```bash
STRIPE_PRICE_OWNER_MONTHLY=price_...
STRIPE_PRICE_MECHANIC_MONTHLY=price_...
STRIPE_PRICE_BUNDLE_MONTHLY=price_...
```

These are read in [`apps/web/lib/billing/products.ts`](lib/billing/products.ts) and used by:
- The checkout endpoint to create subscriptions
- The webhook handler's `skuForPriceId()` to know which entitlement rows to update

## 3. Webhook endpoint

Add a webhook endpoint in Stripe → Developers → Webhooks pointing to:

```
https://myaircraft.us/api/webhooks/stripe
```

Subscribe to these events:
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`
- `checkout.session.completed`  ← used for both subscription mode and **setup mode** (card-on-file capture)

Copy the signing secret and set as `STRIPE_WEBHOOK_SECRET` in Vercel.

## 4. Apply the Supabase migration

Run [`supabase/migrations/058_per_persona_entitlements.sql`](../../supabase/migrations/058_per_persona_entitlements.sql). This:

- Creates `entitlements` table with `UNIQUE (organization_id, persona)`
- Adds `stripe_payment_method_id`, `payment_method_card_fingerprint`, `payment_method_added_at`, `stripe_setup_intent_id` columns to `organizations`
- Creates `signup_attempts` table for IP/email/card rate limiting
- Backfills existing orgs into the new entitlement model

## 5. Turn on email verification (Supabase dashboard)

Auth → Providers → Email → toggle **"Confirm email"** on. This blocks throwaway email signups from reaching the trial-start gate. Without this, the start-trial endpoint will still rate-limit by email/IP/card fingerprint, but a verified inbox is the cleanest first line of defense.

## How the abuse defenses layer together

`lib/billing/trial.ts` runs all five checks in order on every `/api/billing/start-trial` call:

1. **`no_payment_method`** — org has no `stripe_payment_method_id` yet. UI surfaces "Add card to start trial."
2. **`card_already_used`** — `payment_method_card_fingerprint` matches another org's. Same physical card cannot run two free trials.
3. **`email_trial_limit`** — same email already started a trial in the last 365 days (tracked in `signup_attempts`).
4. **`ip_rate_limit`** — same IP started > 3 trials in the last 24 hours.
5. **`persona_already_active`** — entitlement already in `'trial'` or `'active'` state for that persona.

Anything that fails returns a typed `blocked` field so the client can show an appropriate message.

## End-to-end flow

```
sign up → /onboarding (persona) → /onboarding/billing
  → "Add card" → Stripe-hosted Checkout (mode: setup)
  → webhook captures payment_method + fingerprint
  → returns to /onboarding/billing?setup=success
  → client calls /api/billing/start-trial
  → entitlement row goes from 'none' → 'trial', trial_ends_at = now() + 30d
  → redirect to /owner or /mechanic
```

When the trial expires, the entitlement is `'paywalled'`. The PaywallScreen overlay covers the persona's main surface (except `/settings`, so the user can re-subscribe). Choosing **Bundle** at re-subscribe time unlocks both personas at once via the webhook's `applySubscriptionToEntitlements` upsert.

## Cross-persona behavior (the part you specifically asked about)

- An owner who clicks the mechanic toggle in the AppLayout sidebar:
  - If they have an active mechanic entitlement → routed straight to `/mechanic`
  - Otherwise → `<CrossPersonaUpsell>` modal opens with three options:
    - **Start 30-day mechanic trial** — only enabled if `mechanic.state === 'none'` (one trial per persona, ever)
    - **Subscribe to A&P Mechanic** — Stripe Checkout, $79/mo
    - **Get the bundle** — Stripe Checkout, $99/mo, grants both
- Same flow in reverse for a mechanic clicking the owner toggle.

## Local testing

For local Stripe testing without local Node, use Stripe's hosted test mode:

1. Switch the Stripe keys to test mode (`sk_test_…`)
2. Use the test card `4242 4242 4242 4242` with any future date / any CVC
3. To test card-already-used dedup, use `4242 4242 4242 4242` once, then try again under a different email — it should be blocked
4. To fast-forward a trial expiry, set `trial_ends_at` to a past date in the entitlements table and reload the persona surface — PaywallScreen should overlay
