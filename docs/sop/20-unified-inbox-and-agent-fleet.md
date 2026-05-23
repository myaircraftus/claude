---
sop_id: SOP-20
title: Unified inbox + agent fleet
owner: founder
last_reviewed: 2026-05-23
status: published
applies_to: [platform-architecture, agents, inbox]
related_routes:
  - /communications
  - /settings/inbox
  - /admin/agents
  - /admin/tach-review
  - /api/webhooks/resend/inbound
  - /api/webhooks/twilio/sms
  - /api/inbox/*
  - /api/owner/external-systems
  - /api/cron/tach-time-sync
---

# SOP-20 — Unified inbox + agent fleet

## §1 Why this exists

Aviation shops and aircraft owners already live in email. Pre-2026 we
shipped a maintenance OS that competed for their attention with their
inbox. The unified-inbox architecture flips the relationship: the
platform IS their inbox + their operating system. Receipts, estimates,
invoices, reminders, and (via SMS) shop ↔ owner chatter all land in
one place. AI agents read, classify, and draft action items. The user
approves with one click.

Browser-automation scrapers then close the integration gap: instead of
negotiating API access with every flight-scheduling system, we let the
owner add their existing-system credentials and our agent logs in
nightly via headless browser to sync tach hours and reconcile aircraft
rosters.

## §2 Component map

```
                  ┌─────────────────────────────────────┐
                  │  Inbound channels                   │
                  │   - email → Resend → /api/webhooks/  │
                  │     resend/inbound                   │
                  │   - SMS   → Twilio → /api/webhooks/  │
                  │     twilio/sms                       │
                  └──────────┬──────────────────────────┘
                             ▼
                  ┌─────────────────────────────────────┐
                  │  inbox_messages (single table)     │
                  │   source: email | sms              │
                  │   direction: inbound | outbound    │
                  └──────────┬──────────────────────────┘
                             ▼
                  ┌─────────────────────────────────────┐
                  │  inbox.classifier (gpt-4o-mini)    │
                  │   receipt | estimate | invoice |   │
                  │   reminder | adhoc | spam | other  │
                  └──────────┬──────────────────────────┘
                             ▼
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
  inbox.expense-     inbox.estimate-  inbox.invoice-
  extractor          parser           importer
  → cost_entries     → estimates      → invoices
    (approved=false)   (status=draft)   (status=draft)
              │              │              │
              └──────────────┼──────────────┘
                             ▼
                  ┌─────────────────────────────────────┐
                  │  /communications inbox UI          │
                  │   inline "Approve" buttons         │
                  │   POST /api/inbox/approve          │
                  └─────────────────────────────────────┘
```

Browser-automation arm (independent):

```
  /settings/inbox  →  POST /api/owner/external-systems  →
  external_system_credentials (envelope-encrypted)

  cron 06:00 UTC daily  →  /api/cron/tach-time-sync  →
  data-sync.tach-time-scraper agent  →
  per-vendor scraper (lib/agents/scrapers/<system>.ts)  →
  recommendation row "tach_time_review"  →
  /admin/tach-review  →  POST /api/admin/tach-review (apply/skip)
```

## §3 Per-user identity

`user_profiles.inbox_email` is the source of truth. Format:
`<handle><suffix>@myaircraft.us` — derived by the SQL function
`allocate_inbox_email(user_id)` which walks suffixes on collision.

`user_profiles.inbox_phone` (optional, paid tier) — Twilio number that
sends SMS via /api/inbox/send-sms and receives via the inbound webhook.

Provisioning:

- New users: hook in the onboarding flow (TODO) that calls
  `allocate_inbox_email` and (paid tier) a Twilio provisioning helper.
- Existing users: admin one-shot `POST /api/admin/inbox/allocate-emails`
  walks every `user_profiles` row whose `inbox_email IS NULL` and
  fills it in. Idempotent.

## §4 Security model

### Inbound webhook verification

- Resend: HMAC-SHA256 over the raw body, secret in
  `RESEND_WEBHOOK_SECRET`. Header: `resend-signature`.
- Twilio: HMAC-SHA1 over the URL + sorted-keys-and-values string,
  secret in `TWILIO_AUTH_TOKEN`. Header: `x-twilio-signature`.

Both webhooks fall back to "accept anything" when their secret env var
is missing AND `VERCEL_ENV !== 'production'` — dev affordance only.
Production MUST set the secrets or every webhook 401s.

### Third-party-system credentials

Stored in `external_system_credentials`:

- `password_encrypted bytea` — AES-256-GCM ciphertext concatenated with
  its auth-tag suffix.
- `password_iv bytea` — per-row random 12-byte IV.
- Key: `EXTERNAL_CRED_KEK` env var (32-byte hex). Lives in Vercel, NOT
  in the database. A DB dump alone never reveals user passwords.
- API: `lib/security/envelope-crypt.ts` — `encryptCredential()` /
  `decryptCredential()`.
- The plaintext password is held in memory just long enough to call
  the vendor scraper; it's never logged, never returned to the
  client, and never reaches the agent_runs.input or .recommendation
  columns.

### Row-level security

- `inbox_messages` — user can read their own rows OR rows in their
  org. Update is own-row only. Insert is service-role only (via
  webhooks).
- `external_system_credentials` — own-row only for all CRUD.

## §5 Adding a new scraper

1. Implement `lib/agents/scrapers/<system>.ts` matching the
   `VendorScraper` contract (`{ system, label, scrape(creds) }`).
2. Register in `lib/agents/scrapers/index.ts`.
3. Add the option to the `SUPPORTED_SYSTEMS` set in
   `/api/owner/external-systems/route.ts`.
4. Add the label to `SYSTEM_LABELS` in the `/settings/inbox` client.
5. (Optional) Add a per-system status row to the cron-health log.

Real Playwright runtime: use Vercel Sandbox + `@sparticuz/chromium` +
`playwright-core`. See the commented `realScrape()` in
`flight-schedule-pro.ts` for the template.

## §6 The agent contract

Every agent in `lib/agents/impl/` runs through `runAgent(agentId, ctx,
fn)` from `lib/agents/runner.ts`:

- inserts a pending row in `agent_runs`,
- calls `fn(logger)`,
- updates the row with `status` ∈
  {succeeded, failed, needs_human} + latency + tokens + the
  recommendation jsonb.

Recommendation rows are how AI agents propose human-actionable
follow-ups. Examples shipped:

| kind                       | emitted by                          | surfaced where                  |
|----------------------------|-------------------------------------|---------------------------------|
| `expense_needs_review`     | inbox.expense-extractor             | /communications inbox UI        |
| `estimate_needs_review`    | inbox.estimate-parser               | /communications inbox UI        |
| `invoice_needs_review`     | inbox.invoice-importer              | /communications inbox UI        |
| `tach_time_review`         | data-sync.tach-time-scraper         | /admin/tach-review              |
| `cert_expiry_soon`         | workforce.cert-expiry-alerter       | /admin/agents (recommendation)  |
| `cron_missed`              | ops.cron-health                     | /admin/agents (recommendation)  |
| `kb_draft_candidate`       | support.first-responder             | support.kb-curator picks up     |
| `kb_drafts_ready_for_review` | support.kb-curator                | /admin/support/kb (planned)     |

## §7 Operational checklist

After deploy + DNS:

- [ ] `EXTERNAL_CRED_KEK` set in Vercel env (32-byte hex)
- [ ] `RESEND_WEBHOOK_SECRET` set in Vercel env
- [ ] Resend domain `myaircraft.us` verified + MX pointed at Resend inbound
- [ ] Resend inbound webhook URL `https://www.myaircraft.us/api/webhooks/resend/inbound` registered
- [ ] `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` (+ optional `TWILIO_FROM_DEFAULT`) set
- [ ] Twilio messaging webhook URL `https://www.myaircraft.us/api/webhooks/twilio/sms` registered
- [ ] One-shot `POST /api/admin/inbox/allocate-emails` to backfill existing users
- [ ] (Phase-3 live scraping) `pnpm add @vercel/sandbox playwright-core @sparticuz/chromium`, set `FSP_SCRAPER_MODE=live`, uncomment `realScrape()` in `flight-schedule-pro.ts`
