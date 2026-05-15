---
title: "Parts Inventory"
module: "parts"
faa_refs:
  - "14 CFR 43.13"
  - "14 CFR 21.50"
slug: "09-parts-inventory"
order: 9
version: "1.0.0"
last_updated: "2026-05-14"
status: "active"
---

# Parts Inventory

## Purpose

The Parts Inventory is the canonical record of part identity, traceability, and stock level for a shop. Every parts line on a W/O (§05) decrements this table; every receive event increments it. Traceability fields (lot, serial, source) are FAA-aligned for AD compliance and reuse questions.

## Required fields

- **Part number** — manufacturer's PN. Required.
- **Description** — freeform.
- **Quantity on hand** — non-negative integer; trigger-maintained.
- **Reorder level** — when `quantity_on_hand < reorder_level`, surfaces on the Low Stock card on /workflow.
- **Unit cost** — most recent receive cost; used for margin calc.
- **Compatibility tags** — array of `make/model` strings; cross-referenced with §02 aircraft for AI-assisted picking.
- **Traceability:**
  - Source (vendor name)
  - Vendor invoice number
  - Lot number (when applicable)
  - Serial number (when applicable)
  - 8130-3 / EASA Form 1 attachment (when applicable)
- **Status** — `active | archived`. Archived parts remain readable for old W/Os but cannot be added to new ones.

## Lifecycle (per row)

```
received → on-hand → allocated → consumed
                 ↘ returned-to-vendor
                 ↘ scrapped
```

Receive events INSERT rows in `parts_movements` and trigger-update `parts.quantity_on_hand`.

## SOP rules

- **Decrement on W/O signoff, not on add.** A parts line added to an open W/O does NOT touch inventory. Inventory commits only on §05's `signed-off` transition.
- **Returns are append-only.** Returning a part to inventory writes a `parts_movements` row with type=`return`, never edits the original receive.
- **Traceability is gated.** A part flagged "requires 8130-3" cannot be issued to a W/O unless the form is attached.
- **AI resolution layer.** Free-text part queries (from /ask or the W/O line picker) route through the parts resolver: exact PN > fuzzy PN > description + compatibility match. Resolution writes an audit row so we can tune later.
- **Org-scoped, period.** No global parts catalog. Each org maintains its own.

## RLS

- `parts.organization_id = membership.organization_id`.
- Portal: customers cannot read parts inventory at all (privacy + competitive concern).

## Failure modes

- **Negative stock on race condition:** the W/O signoff path uses an `UPDATE … SET quantity_on_hand = quantity_on_hand - $qty WHERE quantity_on_hand >= $qty` guarded write. A guard miss raises `ERR_PARTS_INSUFFICIENT` and the signoff aborts.
- **Stale parts picker:** invalidates via `revalidatePath('/parts')` after every movement.

## Related modules

- Aircraft Master Record — §02 (compatibility checks)
- Work Order Execution — §05 (decrement source)
- Reports & Global Search — §08 (low-stock, margin)
