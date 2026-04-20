# 2026-04-09 Three-Markdown Coverage Audit

## Source documents
- [myaircraft_master_classification_taxonomy.md](/Users/andy/1.%20do%20not%20touch/myaircraft/mark%20downs/myaircraft_master_classification_taxonomy.md)
- [myaircraft_redesign_CTO.md](/Users/andy/1.%20do%20not%20touch/myaircraft/mark%20downs/myaircraft_redesign_CTO.md)
- [myaircraft_scan_review_intelligence_map.md](/Users/andy/1.%20do%20not%20touch/myaircraft/mark%20downs/myaircraft_scan_review_intelligence_map.md)

## Current status summary
- The classification and scan-review markdowns are now partially implemented in code and actively shaping upload, scan, import, and review behavior.
- The CTO redesign markdown is partially implemented. The lowest-risk operational fixes are in, but the broad visual/layout redesign remains a follow-up track.
- The repo now has a real implementation bridge for taxonomy intelligence, but not every markdown concept is persisted as a first-class database field or enforced end to end.

---

## 1. Master Classification Taxonomy

### Implemented
- Structured major section and exact document type taxonomy is live in:
  - [apps/web/lib/documents/taxonomy.ts](/Users/andy/1.%20do%20not%20touch/myaircraft/apps/web/lib/documents/taxonomy.ts)
  - [apps/web/components/aircraft/document-vault-tree.tsx](/Users/andy/1.%20do%20not%20touch/myaircraft/apps/web/components/aircraft/document-vault-tree.tsx)
  - [apps/web/components/documents/upload-dropzone.tsx](/Users/andy/1.%20do%20not%20touch/myaircraft/apps/web/components/documents/upload-dropzone.tsx)
- Taxonomy-aware intelligence layer exists in:
  - [apps/web/lib/documents/classification.ts](/Users/andy/1.%20do%20not%20touch/myaircraft/apps/web/lib/documents/classification.ts)
- Upload and Google Drive import preserve structured classification fields:
  - [apps/web/app/api/upload/route.ts](/Users/andy/1.%20do%20not%20touch/myaircraft/apps/web/app/api/upload/route.ts)
  - [apps/web/app/api/gdrive/import/route.ts](/Users/andy/1.%20do%20not%20touch/myaircraft/apps/web/app/api/gdrive/import/route.ts)
- Scanner flow now uses simplified scan-time classes with exact taxonomy refinement:
  - [apps/web/app/(app)/scanner/components/new-batch-button.tsx](/Users/andy/1.%20do%20not%20touch/myaircraft/apps/web/app/(app)/scanner/components/new-batch-button.tsx)

### Partially implemented
- `record_family`, `truth_role`, `parser_strategy`, `review_priority`, and reminder/AD relevance are derived in code, but not yet stored everywhere as first-class DB truth.
- Classification now influences upload/scan/import routing, but not every downstream system consumes the richer model yet.
- Review queue already understands segments/conflicts/canonicalization, but the taxonomy model is not fully surfaced as editable review metadata across every workflow.
- Aircraft completeness, permissions, export packets, and intelligence summaries are still only partially connected to the taxonomy.

### Still missing
- Full operation overlays (`part_91`, `part_135`, `part_141`, etc.) as active runtime policy.
- First-class component scopes and visibility flags across search, reminders, and permissions.
- A full DB-backed implementation of all classification output flags from the markdown:
  - `can_change_component_status`
  - `owner_visible`
  - `mechanic_visible`
  - `auditor_visible`
  - `external_readonly_visible`
  - `requires_component_linking`
- Complete taxonomy-driven packet generation and completeness scoring.

---

## 2. Scan-Time, Review-Time, and Intelligence-Time Classification Map

### Implemented
- Simple scan-time batch classes now exist and are front-and-center in the scanner modal:
  - [apps/web/app/(app)/scanner/components/new-batch-button.tsx](/Users/andy/1.%20do%20not%20touch/myaircraft/apps/web/app/(app)/scanner/components/new-batch-button.tsx)
- Unknown remains available through the scan-time class model in:
  - [apps/web/lib/documents/classification.ts](/Users/andy/1.%20do%20not%20touch/myaircraft/apps/web/lib/documents/classification.ts)
- Review and canonicalization already moved toward segment-first evidence in:
  - [apps/web/lib/ocr/segments.ts](/Users/andy/1.%20do%20not%20touch/myaircraft/apps/web/lib/ocr/segments.ts)
  - [apps/web/lib/ocr/precedence.ts](/Users/andy/1.%20do%20not%20touch/myaircraft/apps/web/lib/ocr/precedence.ts)
  - [apps/web/lib/ocr/canonical-records.ts](/Users/andy/1.%20do%20not%20touch/myaircraft/apps/web/lib/ocr/canonical-records.ts)
  - [apps/web/app/api/ocr/arbitrate/route.ts](/Users/andy/1.%20do%20not%20touch/myaircraft/apps/web/app/api/ocr/arbitrate/route.ts)
  - [apps/web/app/api/ocr/canonicalize/route.ts](/Users/andy/1.%20do%20not%20touch/myaircraft/apps/web/app/api/ocr/canonicalize/route.ts)
- Intelligence-time flags now exist in code-level classification summaries and influence safety gating:
  - [apps/web/lib/documents/classification.ts](/Users/andy/1.%20do%20not%20touch/myaircraft/apps/web/lib/documents/classification.ts)
  - [apps/web/app/api/reminders/generate/route.ts](/Users/andy/1.%20do%20not%20touch/myaircraft/apps/web/app/api/reminders/generate/route.ts)
  - [apps/web/app/api/aircraft/[id]/ads/route.ts](/Users/andy/1.%20do%20not%20touch/myaircraft/apps/web/app/api/aircraft/%5Bid%5D/ads/route.ts)

### Partially implemented
- Scan-time classification is advisory and simple, which matches the intent, but page-level refinements and repeated shortcuts are not fully built out.
- Review-time exact reclassification exists at the data-model level, but not every decision called out in the markdown is surfaced in a polished reviewer UI.
- Intelligence flags are consumed by some downstream systems, but not yet comprehensively across search, permissions, completeness, and packet generation.

### Still missing
- Scanner shortcuts like:
  - `Same as previous page`
  - explicit unreadable-page marking in the visible scanner UX
- Full reviewer controls for:
  - reclassify batch
  - reclassify page
  - reclassify segment
  - split one page into multiple classes
  - mark evidence roles directly in a complete review UI
- Full “needs segmentation” and “needs cross-page linking” workflow exposure to reviewers, even though the backend foundations exist.

---

## 3. CTO / Founder UX Audit & Redesign

### Implemented
- Ops Console is now surfaced in the sidebar:
  - [apps/web/components/shared/sidebar.tsx](/Users/andy/1.%20do%20not%20touch/myaircraft/apps/web/components/shared/sidebar.tsx)
- Review queue now distinguishes failed-to-load from truly empty:
  - [apps/web/app/(app)/documents/review/page.tsx](/Users/andy/1.%20do%20not%20touch/myaircraft/apps/web/app/(app)/documents/review/page.tsx)
  - [apps/web/app/(app)/documents/review/review-client.tsx](/Users/andy/1.%20do%20not%20touch/myaircraft/apps/web/app/(app)/documents/review/review-client.tsx)
- Ask/History tone is softer for incomplete evidence:
  - [apps/web/components/ask/confidence-badge.tsx](/Users/andy/1.%20do%20not%20touch/myaircraft/apps/web/components/ask/confidence-badge.tsx)
  - [apps/web/components/ask/answer-block.tsx](/Users/andy/1.%20do%20not%20touch/myaircraft/apps/web/components/ask/answer-block.tsx)
- Documents upload/import classification is substantially cleaner and less confusing than before:
  - [apps/web/components/documents/upload-dropzone.tsx](/Users/andy/1.%20do%20not%20touch/myaircraft/apps/web/components/documents/upload-dropzone.tsx)
  - [apps/web/components/documents/gdrive-picker-client.tsx](/Users/andy/1.%20do%20not%20touch/myaircraft/apps/web/components/documents/gdrive-picker-client.tsx)

### Partially implemented
- Some dashboard/ops clarity work is in place, but not the broad visual redesign of cards, spacing, and hierarchy.
- Documents UX is stronger, but not all row-level quick actions and trend/status improvements from the markdown are present.
- Aircraft document vault structure is much closer to the intended “records vault,” but the surrounding aircraft page UX is still not fully redesigned around it.

### Still missing
- Marketing site IA and design-system overhaul.
- Universal command palette.
- Aircraft card health indicators and stronger workspace-health CTAs.
- Richer documents table actions, trends, and row action menu.
- Broader dashboard layout simplification and unified button system rollout.
- Many of the deeper marketing and customer page redesign items.

---

## Highest-value remaining gaps
1. Persist the richer taxonomy intelligence model as first-class DB-backed truth instead of relying mainly on derived code-level profiles.
2. Finish the reviewer-facing controls for exact classification, evidence role, non-canonical marking, and page/segment splitting.
3. Expose more scan-review shortcuts in the scanner UX, especially repeat actions and unreadable handling.
4. Bring taxonomy-aware status/completeness/search permissions deeper into downstream consumers.
5. Continue the CTO redesign in targeted slices rather than a broad visual rewrite.

## Practical conclusion
- We did not miss the three markdowns conceptually.
- We implemented a meaningful first wave from them, especially around taxonomy, scan-time simplicity, review safety, and broken Google Drive flow.
- We have not yet completed every item from those documents, and this audit is the current source of truth for what remains.
