# Ask + Scan-to-RAG Smoke Checklist

Use this checklist before signing off a production release for Ask, OCR review, and citation preview.

## Intake And Processing
- Upload a text-native PDF from `/documents/upload`.
- Confirm the file reaches `queued`, `parsing`, `chunking`, `embedding`, then `completed`.
- Upload a scanned PDF and confirm it reaches `ocr_processing` and then `completed`.
- Confirm both documents appear in the aircraft documents view with the expected classification.

## Ask Retrieval
- Open `/ask` inside an authenticated production session.
- Ask a question answerable from a text-native manual.
- Confirm the response includes at least one citation card and one inline citation chip.
- Ask a question answerable from a scanned maintenance record.
- Confirm the response still works even if the scanned record is not eligible for canonical truth.

## Source Preview
- Click a citation from a text-native PDF.
- Confirm the source preview opens the correct document.
- Confirm the viewer lands on the cited page and highlights the cited text when an exact text anchor is available.
- Click a second citation from the same document.
- Confirm the viewer jumps again without requiring a full page refresh.
- Click a citation from a scanned OCR document.
- Confirm the source preview opens the cited page.
- Confirm OCR region boxes appear when real bounding geometry is available.
- Confirm page-level fallback still works if exact anchoring is unavailable.

## Review And Canonicalization
- Open `/documents/review` for a scanned maintenance record.
- Confirm a manual/reference page stays `informational_only` or `non_canonical_evidence`.
- Confirm a true maintenance entry can be marked as canonical candidate and approved.
- Confirm reviewer changes preserve field lineage and canonical record versioning.

## Downstream Safety
- Confirm low-confidence or conflicting scanned evidence does not auto-activate reminders.
- Confirm a reviewed strong record can still drive reminder creation where applicable.
- Confirm AD evidence remains tied to precedence-backed source evidence.

## Production Checks
- Run `pnpm --filter @myaircraft/web build`.
- Run `pnpm --filter @myaircraft/web exec vitest run`.
- Run `pnpm --filter @myaircraft/web lint`.
- Verify production route protection:
  - `/ask`
  - `/documents/upload`
  - `/documents/review`
- Check runtime logs for upload, query, preview, and OCR route failures after release.
