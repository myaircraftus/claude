# 2026-04-09 — Four Markdown Implementation Wave

Source markdowns reviewed and continued in this wave:

- `mark downs/myaircraft_codex_unified_spec.md`
- `mark downs/myaircraft_classification_implementation_plan.md`
- `mark downs/myaircraft_scan_review_intelligence_map.md`
- `mark downs/myaircraft_master_classification_taxonomy.md`

## What this wave implemented

### Taxonomy-driven behavior
- Added richer classification profile metadata:
  - operation overlays
  - visibility audiences
  - segmentation requirement
  - cross-page-linking expectation
- Exposed record-family and truth-role labels for downstream UI filters.

Primary file:
- `apps/web/lib/documents/classification.ts`

### Operation-aware document vault
- Aircraft document vault now filters visible major groups by the aircraft's selected operation profile instead of always showing the full universal list.
- Added a user-facing note explaining that operation-specific document structure is being shown without deleting existing records.

Primary files:
- `apps/web/lib/aircraft/operations.ts`
- `apps/web/components/aircraft/document-vault-tree.tsx`
- `apps/web/app/(app)/aircraft/[id]/page.tsx`

### Documents smart views
- Added taxonomy-aware smart views to the documents page:
  - All documents
  - Needs review
  - Pending OCR / indexing
  - Needs classification
  - Logbooks
  - Manuals & references
  - FAA / compliance docs
  - Reminder-driving
  - AD evidence
- Added record-family and truth-role filters.

Primary file:
- `apps/web/app/(app)/documents/page.tsx`

### Review-time precision improvements
- Added quick evidence-role presets in review:
  - Canonical
  - Supporting
  - Reference
  - Non-canonical
  - Ignore
- Added visibility / segmentation / cross-page-linking hints to reviewer classification context.

Primary file:
- `apps/web/app/(app)/documents/review/review-client.tsx`

### Scanner speed and carry-forward behavior
- Expanded page-level evidence classes to better match the scan/review spec.
- Added "same as previous page" carry-forward behavior for captured pages.
- Added a "Copy previous" action at page level.
- Added taxonomy search into new scanner batch setup for faster routing into the right document slot.

Primary files:
- `apps/web/lib/scanner/types.ts`
- `apps/web/app/api/scanner/batches/[id]/pages/[pageId]/route.ts`
- `apps/web/app/(app)/scanner/[batchId]/batch-capture-view.tsx`
- `apps/web/app/(app)/scanner/components/new-batch-button.tsx`

### Document intelligence visibility
- Document detail slideover now surfaces:
  - record family
  - truth role
  - visibility audiences
  - reminder / AD eligibility
  - parser strategy
  - segmentation need

Primary file:
- `apps/web/components/documents/document-detail-slideover.tsx`

## Still remaining after this wave

- Aircraft-level assignments and permission management are still only partially implemented.
- Full reviewer page/segment split workflows are still not implemented.
- Bulk classification grid and richer historical import workflows remain follow-up work.
- Operation overlays are now computed in code, but not yet persisted as first-class DB columns everywhere.
- OCR-box precision highlighting for scanned PDFs remains a separate follow-up track.
- Benchmark population, correction promotion, and drift dashboards still need real labeled data to become operationally complete.
