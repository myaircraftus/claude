# Email ingestion runbook (mock → real provider)

**Status:** mock receiver live; real provider not wired.

## What's live (Phase 16 Sprint 16.2)

- `POST /api/webhooks/support-email` accepts JSON envelopes shaped like
  SendGrid Inbound Parse / Postmark inbound webhooks.
- Gated by shared secret in `SUPPORT_EMAIL_WEBHOOK_SECRET` env var.
  Without that env var the route returns 503 — makes the missing
  config obvious.
- Sender → `user_profiles` lookup attempts to attach `submitter_user_id`
  + `organization_id` automatically; falls back to NULL if the sender
  isn't a known user (the ticket still lands; admin can route later).

## What's NOT live

- No real email provider is wired. Real customers can't email
  `support@myaircraft.us` and have a ticket created — that requires:
  1. Pick a provider: SendGrid Inbound Parse, Postmark Inbound, or
     SES → Lambda → webhook. SendGrid is the smallest config change
     (DNS MX record + URL); Postmark is the simplest if you already
     use Postmark for sending.
  2. Create a domain alias / dedicated address (e.g.
     `support@myaircraft.us` or `support+ingest@myaircraft.us`).
  3. Configure DNS MX to point at the provider's inbound domain.
  4. In the provider's console, set the inbound parse webhook URL to
     `https://www.myaircraft.us/api/webhooks/support-email?secret=<TOKEN>`
     (or use the `x-webhook-secret` header — both are accepted by the
     route).
  5. Set `SUPPORT_EMAIL_WEBHOOK_SECRET=<TOKEN>` in Vercel env (Production
     scope; Preview optional).
  6. Send a test email from a personal address; verify a row appears in
     `support_tickets` with `source = 'email'` and the AI triage worker
     (Sprint 16.3 cron) picks it up on the next tick.

## Outbound replies

- Replies stored in `ticket_replies` (Sprint 16.3 migration 110).
- Email delivery is queued in `email_log` table (also migration 110)
  with `delivery_status='queued'`. A future job will actually send via
  SendGrid/Postmark Outbound API once those are wired.
- Real outbound is deferred to a separate sprint; the queue makes the
  hand-off zero-loss when that sprint lands.

## Schema notes

- `email_log.kind = 'ticket_reply'` for triage-driven replies. Other
  kinds will be added as more email surfaces appear (NPS prompts,
  weekly digests, churn re-engagement).
- `email_log.delivery_status` values: `queued` | `sending` | `sent` |
  `failed` | `skipped`. The skipped state covers cases where the
  recipient opted out of transactional email — there's no double
  opt-out flow yet for v1.

## Testing the mock locally

```bash
curl -X POST http://localhost:3000/api/webhooks/support-email \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: $SUPPORT_EMAIL_WEBHOOK_SECRET" \
  -d '{
    "from": "customer@example.com",
    "subject": "Cant find my logbook",
    "text": "I uploaded a logbook yesterday and it has not appeared yet."
  }'
```

Expected: 201 with `{ticket_number, status}`. Verify in DB:

```sql
SELECT ticket_number, source, submitter_email, organization_id
FROM support_tickets
ORDER BY created_at DESC
LIMIT 5;
```

## Known gaps for v2

- No DKIM/SPF verification beyond what the chosen provider does. Real
  providers verify upstream; the webhook just trusts the envelope.
- No attachment handling — the `attachments` field is accepted but
  ignored. A future sprint can store attachments in storage + link.
- No dedup. If a customer's email client retries delivery, two tickets
  land. Real provider should provide a stable Message-Id; a future
  sprint can dedupe on that header.
- No rate limiting at the route level. The provider's webhook is
  trusted (single-source); a public-form bot would hit
  `/api/public/support/submit` instead, which has its own honeypot.
