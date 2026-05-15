---
title: "Invoices & Payments"
module: "invoices"
faa_refs:
  - "14 CFR 43.9"
slug: "06-invoices-payments"
order: 6
version: "1.0.0"
last_updated: "2026-05-14"
status: "active"
---

# Invoices & Payments

## Purpose

An Invoice is the final billing surface for a completed Work Order (§05). It is the single source of truth for what the customer owes, what they've paid, and what remains outstanding. All payment movement is routed through Stripe.

## Lifecycle

```
draft → sent → viewed → partially-paid → paid
                                       ↘ void
```

- **draft** — generated from a `signed-off` W/O. Editable for line corrections.
- **sent** — finalized; emailed / portal-shared with the customer. Total is frozen.
- **viewed** — customer opened the portal page; recorded with timestamp.
- **partially-paid** — at least one Stripe `payment_intent.succeeded` against the invoice, total < amount due.
- **paid** — full balance reconciled. Terminal.
- **void** — issued in error; written off. Requires a journal entry note.

## Required fields

- **Work order** — FK to `work_orders.id`. The W/O must be `signed-off`.
- **Lines** — generated from W/O lines on creation, then editable in draft.
- **Customer email** — recipient of the portal share.
- **Deposit applied** — if the source Estimate (§04) collected a deposit, it appears as a negative line and reduces the amount due.
- **Due date** — required; default = +30 days from `sent`.

## SOP rules

- **One invoice per W/O.** Re-invoicing requires voiding the original.
- **Stripe is the only payment rail.** Off-platform payments must be recorded as a Manual Payment line in the invoice with reason text; never bypass the invoice for tracking.
- **Reconciliation is atomic.** Each `payment_intent.succeeded` webhook event must update `invoice.amount_paid` AND insert a row in `invoice_payments` in a single transaction.
- **Voids are append-only.** A void writes an `invoice_voided_at` timestamp and a `voided_reason`. The invoice is never deleted.
- **Persona gate.** Only Shop + admin personas can create, edit, send, or void invoices. Owners see their invoices as read-only via the portal.

## RLS

- `invoices.organization_id = membership.organization_id` AND `role IN ('owner','admin','mechanic')`.
- Portal: customers SELECT only their own invoices via the signed-token route.

## Failure modes

- **Stripe webhook lag:** the portal MUST poll `/api/invoices/[id]/status` after a successful checkout return so the UI doesn't lie about "paid" while the webhook is still in flight.
- **Duplicate payment:** Stripe `payment_intent.id` is the dedup key in `invoice_payments`. A re-fired webhook is a no-op.

## Related modules

- Work Order Execution — §05
- Estimates — §04 (deposit reconciliation)
- Reports & Global Search — §08
