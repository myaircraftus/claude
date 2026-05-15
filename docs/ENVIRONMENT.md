# Environment & Credentials Reference

**Generated:** 2026-05-14
**Scope:** every environment variable the `apps/web` app reads, with presence status across local + Vercel.

> **Security note.** This file documents variable **names, purpose, and
> presence only**. It contains **no secret values** — and must never
> contain any. Actual keys live in `apps/web/.env.local` (git-ignored)
> and in Vercel's encrypted env store. Never paste a real key into this
> file, a commit, a chat log, or a screenshot.

## Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Variable is set in this location |
| ❌ | Not set |
| — | Not expected / not applicable here |
| 🔑 | Secret — must stay encrypted, never logged |
| ⚙️ | Non-secret config / model name / feature flag |

Presence columns: **Local** = `apps/web/.env.local`, **Prod** = Vercel
Production, **Prev** = Vercel Preview.

---

## 1. Supabase (database + auth)

| Variable | Local | Prod | Prev | Type | Purpose |
|----------|:----:|:----:|:----:|:----:|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | ✅ | ✅ | ⚙️ | Project REST/Realtime URL (`https://ygrqinxkeqvikpfmjqiz.supabase.co`). Public. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | ✅ | ✅ | ⚙️ | Anon JWT — RLS-scoped, safe for the browser. |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | ✅ | ✅ | 🔑 | Service-role JWT — bypasses RLS. Server-only. |
| `DATABASE_URL` | ✅ | ❌ | ❌ | 🔑 | Direct Postgres connection string. **Local/migration-only** — the app uses the Supabase client at runtime, so prod doesn't need it. Keep it out of Vercel. |

**Status: complete.** Runtime Supabase access is fully provisioned in all three locations.

---

## 2. OpenAI

| Variable | Local | Prod | Prev | Type | Purpose |
|----------|:----:|:----:|:----:|:----:|---------|
| `OPENAI_API_KEY` | ✅ | ✅ | ✅ | 🔑 | Chat, embeddings, vision OCR. |
| `OPENAI_CHAT_MODEL` | ✅ | ✅ | ✅ | ⚙️ | Default `gpt-4o`. |
| `OPENAI_EMBEDDING_MODEL` | ✅ | ✅ | ✅ | ⚙️ | Default `text-embedding-3-large`. |
| `OPENAI_OCR_MODEL` | ❌ | ❌ | ❌ | ⚙️ | Optional — vision OCR model override. Code falls back to a built-in default. |
| `OPENAI_PROMPT_VERSION` | ❌ | ❌ | ❌ | ⚙️ | Optional — prompt-version tag for activity logs. Defaults in code. |
| `OPENAI_RULE_VERSION` | ❌ | ❌ | ❌ | ⚙️ | Optional — rule-version tag. Defaults in code. |

**Status: complete.** The three optional vars only override built-in defaults; no action needed unless you want to pin them.

---

## 3. Anthropic (Claude)

| Variable | Local | Prod | Prev | Type | Purpose |
|----------|:----:|:----:|:----:|:----:|---------|
| `ANTHROPIC_API_KEY` | ❌ | ✅ | ✅ | 🔑 | Claude API for the AI assistant / ops assistant. |

**⚠️ Gap:** `ANTHROPIC_API_KEY` is **not in `.env.local`**. Anthropic-backed
features won't run in local dev until you add it. Production/Preview are fine.

---

## 4. Google (OAuth · Document AI · Cloud)

| Variable | Local | Prod | Prev | Type | Purpose |
|----------|:----:|:----:|:----:|:----:|---------|
| `GOOGLE_CLIENT_ID` | ✅ | ✅ | ✅ | ⚙️ | Google Drive OAuth client ID. |
| `GOOGLE_CLIENT_SECRET` | ✅ | ✅ | ✅ | 🔑 | Google Drive OAuth client secret. |
| `GOOGLE_REDIRECT_URI` | ✅ | ✅ | ✅ | ⚙️ | OAuth callback (`/api/gdrive/callback`). |
| `GOOGLE_CLOUD_PROJECT` | ✅ | ✅ | ✅ | ⚙️ | GCP project ID for Document AI. |
| `GOOGLE_DOCUMENT_AI_SERVICE_ACCOUNT_JSON` | ✅ | ✅ | ✅ | 🔑 | Service-account JSON (inline) for Document AI OCR. |
| `GOOGLE_APPLICATION_CREDENTIALS` | ✅ | ❌ | ❌ | ⚙️ | **Local-only** — filesystem path to a service-account JSON. Prod/Preview use the inline JSON var above instead. |
| `DOCUMENT_AI_LOCATION` | ✅ | ✅ | ✅ | ⚙️ | Document AI region (e.g. `us`). |
| `DOCUMENT_AI_PROCESSOR_ID` | ✅ | ✅ | ✅ | ⚙️ | Document AI processor ID. |

**Status: complete.** Both the Google Drive OAuth app and the Document AI
processor are fully wired. `GOOGLE_APPLICATION_CREDENTIALS` being local-only
is correct — prod reads the inline JSON.

---

## 5. Stripe (billing)

| Variable | Local | Prod | Prev | Type | Purpose |
|----------|:----:|:----:|:----:|:----:|---------|
| `STRIPE_SECRET_KEY` | ✅ | ✅ | ✅ | 🔑 | Server-side Stripe API key (test mode currently). |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | ✅ | ✅ | ✅ | ⚙️ | Browser Stripe.js key. |
| `STRIPE_WEBHOOK_SECRET` | ✅ | ✅ | ✅ | 🔑 | Verifies `/api/webhooks/stripe` signatures. |
| `STRIPE_USE_MOCK` | ❌ | ✅ | — | ⚙️ | When `true`, billing uses the mock client. |
| `STRIPE_PRICE_OWNER_MONTHLY` | ❌ | ✅ | ❌ | ⚙️ | Price ID — owner persona SKU. |
| `STRIPE_PRICE_MECHANIC_MONTHLY` | ❌ | ✅ | ❌ | ⚙️ | Price ID — shop persona SKU (legacy "mechanic" name). |
| `STRIPE_PRICE_BUNDLE_MONTHLY` | ❌ | ✅ | ❌ | ⚙️ | Price ID — owner+shop bundle. |
| `STRIPE_PRICE_PER_AIRCRAFT` | ❌ | ❌ | ❌ | ⚙️ | Per-aircraft metered price ID. Optional. |
| `STRIPE_PRICE_PRO` / `_FLEET` / `_ENTERPRISE` | ✅ | ✅ | ✅ | ⚙️ | Tier price IDs (Phase 14 pricing). |
| `STRIPE_PRODUCT_PREBUY` / `_LENDER` / `_INSURER` | ❌ | ❌ | ❌ | ⚙️ | One-off product IDs. Optional. |

**Status: functional.** See `apps/web/STRIPE_SETUP.md` for the full pricing
SKU map. The `STRIPE_PRICE_*` vars missing locally only matter if you run
the billing flow in local dev.

---

## 6. Email

| Variable | Local | Prod | Prev | Type | Purpose |
|----------|:----:|:----:|:----:|:----:|---------|
| `RESEND_API_KEY` | ✅ | ✅ | ✅ | 🔑 | Resend transactional email (Phase 17). |
| `RESEND_FROM_DEFAULT` | ✅ | ❌ | ❌ | ⚙️ | Default From address. Code has a fallback. |
| `RESEND_REPLY_TO_DEFAULT` | ✅ | ❌ | ❌ | ⚙️ | Default Reply-To. Code has a fallback. |
| `RESEND_TEST_INBOX` | ✅ | ❌ | ❌ | ⚙️ | Smoke-test inbox. Local-only. |
| `GMAIL_USER` | ❌ | ✅ | ❌ | ⚙️ | Gmail SMTP sender (legacy / inbound). |
| `GMAIL_APP_PASSWORD` | ❌ | ✅ | ❌ | 🔑 | Gmail app password. |
| `SENDGRID_INBOUND_KEY` | ❌ | ❌ | ❌ | 🔑 | Inbound-parse webhook key. Optional. |
| `SUPPORT_EMAIL_WEBHOOK_SECRET` | ❌ | ❌ | ❌ | 🔑 | Support inbound webhook secret. Optional. |

**Note:** `RESEND_FROM_DEFAULT` / `RESEND_REPLY_TO_DEFAULT` are not in Vercel —
production sends use the in-code defaults. Set them in Vercel if you want
to override the From/Reply-To globally.

---

## 7. AI / Vision compute

| Variable | Local | Prod | Prev | Type | Purpose |
|----------|:----:|:----:|:----:|:----:|---------|
| `MODAL_API_KEY` | ✅ | ✅ | ❌ | 🔑 | Modal GPU endpoint key (vision pipeline). |
| `MODAL_ENDPOINT_URL` | ✅ | ✅ | ❌ | ⚙️ | Modal endpoint URL. |
| `MODAL_TOKEN_ID` | ✅ | ✅ | ❌ | 🔑 | Modal token ID. |
| `MODAL_TOKEN_SECRET` | ✅ | ✅ | ❌ | 🔑 | Modal token secret. |
| `HUGGINGFACE_API_KEY` | ✅ | ✅ | ❌ | 🔑 | HuggingFace inference. |
| `RUNPOD_API_KEY` | ❌ | ❌ | ❌ | 🔑 | RunPod GPU. Optional fallback. |
| `REPLICATE_API_TOKEN` | ❌ | ❌ | ❌ | 🔑 | Replicate models. Optional. |
| `AWS_ACCESS_KEY_ID` | ✅ | ✅ | ❌ | 🔑 | AWS Textract OCR. |
| `AWS_SECRET_ACCESS_KEY` | ✅ | ✅ | ❌ | 🔑 | AWS Textract OCR. |
| `AWS_REGION` | ✅ | ✅ | ❌ | ⚙️ | AWS region. |
| `VISION_DISPATCH_MODE` | ✅ | ✅ | ✅ | ⚙️ | Vision job dispatch strategy. |
| `VISION_GPU_HOST` | ✅ | ✅ | ✅ | ⚙️ | GPU host for vision jobs. |
| `VISION_AUTO_DISPATCH` | ✅ | ✅ | — | ⚙️ | Auto-dispatch vision jobs flag. |
| `VISION_FALLBACK_MODE` / `_THRESHOLD` / `VISION_TEXT_WEIGHT` | ❌ | ❌ | ❌ | ⚙️ | Optional vision tuning. Defaults in code. |
| `PARSER_SERVICE_URL` | ✅ | ✅ | ✅ | ⚙️ | External PDF parser service URL. |
| `PARSER_SERVICE_SECRET` | ✅ | ✅ | ✅ | 🔑 | Parser service auth secret. |

**Note:** vision compute vars are missing from **Preview** — vision jobs
won't dispatch on preview deploys. Acceptable if you don't test vision
on previews; copy them over if you do.

---

## 8. Parts AI Search (SerpAPI + eBay)

| Variable | Local | Prod | Prev | Type | Purpose |
|----------|:----:|:----:|:----:|:----:|---------|
| `SERPAPI_API_KEY` | ❌ | ✅ | ✅ | 🔑 | Google Shopping results for AI Parts Search. Code also accepts `SERPAPI_KEY` / `SERP_API_KEY`. |
| `EBAY_APP_ID` | ❌ | ✅ | ✅ | 🔑 | eBay Browse API client ID. |
| `EBAY_CERT_ID` | ❌ | ✅ | ✅ | 🔑 | eBay OAuth cert/secret. |
| `EBAY_DEV_ID` | ❌ | ✅ | ✅ | ⚙️ | eBay developer ID. |
| `EBAY_ENV` | ❌ | ✅ | ✅ | ⚙️ | `sandbox` or `production`. |

**⚠️ Gap:** none of the parts-search keys are in `.env.local`. AI Parts
Search will **silently return no offers in local dev** (the providers log
a "missing key" warning and return empty). Production + Preview are fully
provisioned — this is why AI Parts Search works on the live site. Copy
these into `.env.local` if you need parts search working locally.

---

## 9. Aircraft live tracking

| Variable | Local | Prod | Prev | Type | Purpose |
|----------|:----:|:----:|:----:|:----:|---------|
| `FLIGHTAWARE_API_KEY` | ✅ | ❌ | ❌ | 🔑 | FlightAware AeroAPI. |
| `ADSBEXCHANGE_API_KEY` | ✅ | ❌ | ❌ | 🔑 | ADS-B Exchange direct. |
| `RAPIDAPI_ADSB_EXCHANGE_KEY` | ❌ | ✅ | ✅ | 🔑 | ADS-B Exchange via RapidAPI. |
| `ENABLE_AIRCRAFT_LIVE_TRACKING` | ✅ | ✅ | — | ⚙️ | Master feature flag. |
| `ENABLE_FLIGHTAWARE_PROVIDER` | ✅ | ❌ | ❌ | ⚙️ | Provider toggle. |
| `ENABLE_ADSBEXCHANGE_PROVIDER` | ✅ | ❌ | ❌ | ⚙️ | Provider toggle. |
| `AIRBLY_API_KEY` / `_API_BASE` / `_USE_MOCK` | ❌ | ❌ | ❌ | 🔑/⚙️ | Airbly tach/Hobbs telemetry. Mock by default. |

**Note:** local uses FlightAware + direct ADS-B Exchange; production uses
the RapidAPI ADS-B route. Both are valid — different provider wiring per
environment.

---

## 10. Accounting integrations

| Variable | Local | Prod | Prev | Type | Purpose |
|----------|:----:|:----:|:----:|:----:|---------|
| `QBO_CLIENT_ID` / `QBO_CLIENT_SECRET` | ❌ | ❌ | ❌ | 🔑 | QuickBooks Online OAuth. |
| `QBO_ENV` / `QBO_USE_MOCK` / `QBO_WEBHOOK_VERIFIER` | ❌ | ❌ | ❌ | ⚙️/🔑 | QBO config. |
| `FSP_OAUTH_CLIENT_ID` / `_SECRET` / `_BASE` | ❌ | ❌ | ❌ | 🔑/⚙️ | Flight Schedule Pro OAuth. |
| `FSP_API_BASE` / `FSP_USE_MOCK` | ❌ | ❌ | ❌ | ⚙️ | FSP config. |
| `FRESHBOOKS_CLIENT_ID` / `_SECRET` / `_REDIRECT_URI` | ❌ | ❌ | ❌ | 🔑/⚙️ | FreshBooks OAuth (route scaffolded). |

**Status: not provisioned.** All accounting integrations run in mock mode.
They activate only when the partner credentials are added. See
`apps/web/INTEGRATIONS_SETUP.md`.

---

## 11. FAR-AIM search

| Variable | Local | Prod | Prev | Type | Purpose |
|----------|:----:|:----:|:----:|:----:|---------|
| `FARAIM_API_BASE` | ✅ | ✅ | ✅ | ⚙️ | FAR-AIM embed API base. |
| `FARAIM_API_KEY` | ✅ | ✅ | ✅ | 🔑 | Live FAR-AIM key. |
| `FARAIM_SANDBOX_KEY` | ✅ | ✅ | ✅ | 🔑 | Sandbox FAR-AIM key. |
| `FARAIM_PARTNER_ID` | ✅ | ✅ | ✅ | ⚙️ | Partner ID. |
| `FARAIM_ENV` | ❌ | ❌ | ❌ | ⚙️ | Optional — force `sandbox` in prod. Defaults: live in prod, sandbox in dev. |

**Status: complete.**

---

## 12. Telephony / voice

| Variable | Local | Prod | Prev | Type | Purpose |
|----------|:----:|:----:|:----:|:----:|---------|
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM_NUMBER` | ❌ | ❌ | ❌ | 🔑/⚙️ | Twilio SMS. Optional — SMS features inert without it. |
| `ELEVENLABS_API_KEY` / `ELEVENLABS_DEFAULT_VOICE_ID` | ❌ | ❌ | ❌ | 🔑/⚙️ | ElevenLabs TTS. Optional. |

---

## 13. Observability

| Variable | Local | Prod | Prev | Type | Purpose |
|----------|:----:|:----:|:----:|:----:|---------|
| `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_DSN` | ✅ | ❌ | ❌ | ⚙️ | Sentry error tracking. |
| `NEXT_PUBLIC_POSTHOG_KEY` / `_HOST` | ✅ | ❌ | ❌ | ⚙️ | PostHog product analytics. |

**⚠️ Gap:** Sentry + PostHog are configured locally but **not in Vercel** —
production has no error tracking or analytics. Add the Sentry DSN +
PostHog key to Vercel Production if you want prod observability.

---

## 14. Platform secrets & infra

| Variable | Local | Prod | Prev | Type | Purpose |
|----------|:----:|:----:|:----:|:----:|---------|
| `APP_SECRET` | ✅ | ✅ | ✅ | 🔑 | App-level signing secret. |
| `CRON_SECRET` | ❌ | ✅ | ✅ | 🔑 | Authorizes Vercel cron → `/api/cron/*`. |
| `ENCRYPTION_SECRET` | ❌ | ❌ | ❌ | 🔑 | AES key for stored OAuth refresh tokens. **Required if Google Drive import is used** — confirm it's set in Vercel under another name or add it. |
| `INTERNAL_SECRET` | ❌ | ❌ | ❌ | 🔑 | Internal service-to-service auth. Optional. |
| `TRIGGER_API_KEY` / `TRIGGER_API_URL` | ✅ | ✅ | ✅ | 🔑/⚙️ | Trigger.dev background jobs. |
| `TRIGGER_SECRET_KEY` | ❌ | ❌ | ❌ | 🔑 | Trigger.dev secret (newer SDK). Optional. |
| `NEXT_PUBLIC_APP_URL` | ✅ | ✅ | ✅ | ⚙️ | Canonical app URL. |
| `NEXT_PUBLIC_GITHUB_REPO` | ❌ | ❌ | ❌ | ⚙️ | Enables "Edit in GitHub" on the SOP Library. Optional. |
| `NEXT_PUBLIC_BUILD_SHA` / `VERCEL_GIT_COMMIT_SHA` | — | auto | auto | ⚙️ | Set automatically by Vercel. |

---

## Action Items / Gaps

| # | Gap | Impact | Fix |
|---|-----|--------|-----|
| 1 | `ANTHROPIC_API_KEY` missing from `.env.local` | Claude features dead in local dev | Add to `.env.local` |
| 2 | SerpAPI + eBay keys missing from `.env.local` | AI Parts Search returns empty locally | Copy `SERPAPI_API_KEY`, `EBAY_APP_ID`, `EBAY_CERT_ID`, `EBAY_DEV_ID`, `EBAY_ENV` to `.env.local` |
| 3 | Sentry + PostHog missing from Vercel | No prod error tracking / analytics | Add `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_DSN`, `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` to Vercel Production |
| 4 | `ENCRYPTION_SECRET` not visibly set anywhere | Google Drive token storage may fail | Verify in Vercel; add if Drive import is in use |
| 5 | Vision compute vars missing from Preview | Vision jobs won't dispatch on preview deploys | Copy `MODAL_*`, `AWS_*`, `HUGGINGFACE_API_KEY` to Preview if needed |
| 6 | `CRON_SECRET` missing from `.env.local` | Local cron-route testing returns 401 | Add to `.env.local` if testing crons locally |

## How to set a variable (no values in this doc)

```bash
# Local — edit the git-ignored file directly
$EDITOR apps/web/.env.local

# Vercel — interactive prompt, value never touches the shell history
cd apps/web
vercel env add SERPAPI_API_KEY production     # paste value at the prompt
vercel env add SERPAPI_API_KEY preview

# Verify (names + presence only, never prints values)
vercel env ls production
```

> Never `echo` a secret into `vercel env add` from the command line —
> use the interactive prompt so the value stays out of shell history
> and process listings.

## Related docs

- `apps/web/INTEGRATIONS_SETUP.md` — OAuth provider setup (Drive, QBO, FreshBooks)
- `apps/web/STRIPE_SETUP.md` — Stripe pricing SKU map
- `.env.local.example` — the canonical local template (copy to `.env.local`)
