# 2026-04-09 Unified Codex Spec Coverage Audit

## Source document
- [myaircraft_codex_unified_spec.md](/Users/andy/1.%20do%20not%20touch/myaircraft/mark%20downs/myaircraft_codex_unified_spec.md)

## Implemented in this pass
- Aircraft now stores operation profile context with `operation_types`, which is used in onboarding/edit and surfaced on the aircraft page.
- Aircraft add flow now captures operator and operation profile instead of only the basic FAA fields.
- Aircraft settings `Edit` route now exists and supports operation profile editing.
- Aircraft overview now shows more of the linked workflow context instead of only documents and time.
- Reminders can now become maintenance requests directly through the reminders UI.
- Reminder-created maintenance requests are linked and tagged as reminder-sourced, not just generic free-form requests.
- Add Reminder now supports plain-English AI parsing into structured reminder fields.
- Operation profile now affects reminder behavior, especially the 100-hour logic, instead of leaving it fully generic.
- Aircraft reminders tab links into the working reminders flow instead of the dead `/reminders/new` path.

## Already implemented before this pass and still aligned with the spec
- Aircraft remains the root context for documents, reminders, squawks, maintenance requests, work orders, invoices, entries, and intelligence.
- Structured document vault and taxonomy-aware upload/scan/import flow are already live.
- Segment-first OCR, precedence, canonicalization, and evidence-gated reminder/compliance logic are already in place.
- Squawks can already create maintenance requests, and accepted requests can already become work orders.

## Partially implemented
- Operation type drives reminder behavior more than before, but it still does not yet fully drive document visibility, dashboard emphasis, and assignment presets everywhere.
- Shared owner/mechanic aircraft context exists, but not every owner/mechanic workflow from the spec has been tightened into a single best-in-class aircraft workspace.
- Reminder to maintenance request is live, but invite-new-mechanic flow is still lighter than the spec’s full vision.
- Plain-English reminder capture is live, but broader AI drafting across estimates, work orders, invoices, and onboarding interpretation is still partial.

## Still remaining after this pass
- Full aircraft-level assignments model from the spec, including richer role presets and role-aware permission UX on the aircraft itself.
- Stronger aircraft-centered estimate, work order, invoice, and logbook-entry preload chains everywhere they appear.
- Deeper owner-facing billing and work-order progress experience.
- Broader operation-type runtime policy across document expectations, intelligence modules, and dashboard emphasis.
- Full activity-feed and shared threaded collaboration model described in the long-form brief.
- More complete aircraft home that surfaces every linked object as one coherent live workspace rather than several strong but still separate tabs.

## Practical conclusion
- The unified spec is not “fully done,” but the important missing behavior from it is no longer just aspirational.
- This pass converted operation profile, reminder-to-maintenance, AI reminder creation, and aircraft-centered workflow visibility into real live code.
- The remaining work is now mostly about extending the same aircraft-centered pattern deeper into assignments, approvals, billing, work-order collaboration, and owner/mechanic shared views.
