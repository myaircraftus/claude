---
title: "Estimates, Deposits & Approvals"
module: "estimates"
faa_refs:
  - "14 CFR 43.9"
slug: "04-estimates-deposits-approvals"
order: 4
version: "1.0.0"
last_updated: "2026-05-14"
status: "active"
---

# Estimates, Deposits & Approvals

## Purpose

An Estimate is a shop's written quote for work, anchored to an aircraft and (optionally) a set of squawks. It is the contract surface that converts an inbound work request into a customer-approved Work Order (§05).

## Lifecycle

```
draft → sent → viewed → approved → converted-to-wo
                              ↘ rejected
                              ↘ expired
```

- **draft** — editable by the shop. Not yet shared with the customer.
- **sent** — emailed / portal-shared with the customer. A signed link with a time-bounded token.
- **viewed** — first time the customer opens the portal page; recorded with timestamp + user-agent for the audit log.
- **approved** — customer e-signed the estimate; deposit (if required) was paid via Stripe.
- **converted-to-wo** — a Work Order has been generated from this estimate; the estimate becomes read-only.
- **rejected / expired** — terminal; cannot be revived. The shop must clone to start a new estimate.

## Required fields

- **Aircraft** — FK to `aircraft.id`.
- **Customer email** — the recipient of the portal share.
- **Lines** — at least one line item: description, qty, unit price, taxable flag.
- **Deposit policy** — `none | percent | flat`. Percent caps at 100. Flat caps at total.
- **Expires at** — required; default = +14 days. Server enforces; never trust client.

## SOP rules

- **Approval is binding.** Once approved, the dollar total is frozen. Adjustments require a Change Order (separate doc, attaches to the converted W/O).
- **Deposits go through Stripe.** Never collect off-platform. The portal payment step writes `stripe_payment_intents.deposit` against the estimate ID.
- **One W/O per estimate.** Converting an estimate produces exactly one W/O; the estimate marks itself `converted-to-wo` atomically.
- **Audit every state change.** Each transition writes to `estimate_audit_log` with actor, timestamp, and reason.

## RLS

- Shop org members: full CRUD on their own org's estimates.
- Customer portal: SELECT via signed-token route only; cannot mutate after approval.

## Related modules

- Aircraft Master Record — §02
- Squawks — §03 (attached as estimate lines)
- Work Order Execution — §05 (target of conversion)
- Invoices & Payments — §06 (final billing)
