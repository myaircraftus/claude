---
title: "Work Order Execution"
module: "work-orders"
faa_refs:
  - "14 CFR 43.9"
  - "14 CFR 43.11"
  - "14 CFR 91.405"
slug: "05-work-order-execution"
order: 5
version: "1.0.0"
last_updated: "2026-05-14"
status: "active"
---

# Work Order Execution

## Purpose

A Work Order (W/O) is the canonical record of work performed on an aircraft. It is the only path from "open squawk" to "signed logbook entry." Every parts allocation, labor entry, invoice line, and return-to-service signature ultimately ties back to a W/O.

## Lifecycle

```
draft → open → in-progress → ready-for-signoff → signed-off → invoiced
```

- **draft** — created (typically from an approved Estimate §04) but not released to the shop floor.
- **open** — released; lines visible to mechanics on /workflow.
- **in-progress** — at least one labor entry has been clocked.
- **ready-for-signoff** — all required lines completed; awaits a certificated mechanic's sign.
- **signed-off** — A&P / IA has signed return-to-service. A logbook entry (§07) is generated atomically.
- **invoiced** — an invoice (§06) has been finalized against the W/O. Both records become read-only.

## Required fields

- **Aircraft** — FK to `aircraft.id`. Aircraft must be active (not archived).
- **Squawks** — at least one for work-order-from-defect flow; can be zero for inspection-only.
- **Lines** — one or more, each with: type (`labor | parts | misc`), description, qty, rate, total.
- **Assignee** — `user_id` of the responsible mechanic. May change across the lifecycle.
- **Sign step** — A&P certificate number, mechanic name, signature timestamp, optional IA number.

## SOP rules

- **No write after signoff.** Once `signed-off`, lines are immutable. Corrections require a Change Order linked to the W/O.
- **Parts decrement on commit.** Parts lines decrement `parts.quantity_on_hand` only when the W/O transitions to `signed-off`, not when added. This avoids ghost decrements on cancelled work.
- **Labor clocks write through.** Labor entries hit `work_order_labor_entries` immediately on clock-out; W/O total updates via trigger.
- **Squawk close cascade.** Signing a W/O auto-resolves every linked airworthy-impacting squawk (§03), provided the sign step's `corrective_action` field is populated.
- **Persona gate.** Owner persona cannot mutate W/O. Shop + admin only.

## RLS

- `work_orders.organization_id = membership.organization_id` AND `role IN ('owner','admin','mechanic')`.
- Portal: customers can READ a redacted view of W/Os against their aircraft (no labor rates, no shop costs).

## Related modules

- Estimates — §04 (often the source of a W/O)
- Squawks — §03 (cascaded close on signoff)
- Invoices & Payments — §06
- Logbook Entries — §07
- Parts Inventory — §09 (decrement on signoff)
