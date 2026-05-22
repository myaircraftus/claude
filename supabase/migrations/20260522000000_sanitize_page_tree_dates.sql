-- 20260522000000_sanitize_page_tree_dates
--
-- OCR-pipeline cleanup: NULL out impossible dates on page_tree_nodes.date
-- so the RAG layer and the fleet-aggregation handler don't have to
-- re-sanitise at query time.
--
-- Background: the tree-builder extracts a `date` from each handwritten
-- logbook entry by reading whatever Google Document AI handed back. On
-- a clean printed entry that works. On smudged handwriting, double
-- digits with stray ink, or "year on a roller stamp" pages, OCR
-- sometimes returns garbage:
--
--   0371-07-20    ← misread of a 4-digit year as "0371"
--   8813-10-03    ← top of 3 read as 8, bottom of 0 read as 1
--   8672-01-25    ← similar misread
--   2237-06-15    ← future date
--
-- These dates poison aggregations ("oldest entry?", "records before
-- 1980?") because a per-row sort returns the bad date first.
--
-- This migration applies the same sanity check the fleet-aggregation
-- handler does at query time, but at rest:
--
--   1. Date must be in [1956-01-01, today + 1 year]
--      (1956 is the earliest realistic Cessna 152/172 production year;
--      today + 1 year handles the "annual signed today, next due 1 yr
--      from now" comment-style entry without rejecting it)
--   2. Date must be >= aircraft.year - 1
--      (an entry pre-dating the aircraft's manufacture is OCR garbage)
--
-- Rows that fail either check have their date column nulled. They
-- otherwise remain searchable (full-text + vector still work).
-- The migration logs how many rows it changed so the audit trail is
-- inspectable later.

DO $$
DECLARE
  bad_global_count int;
  bad_premake_count int;
  total_count int;
BEGIN
  SELECT count(*) INTO total_count FROM page_tree_nodes WHERE date IS NOT NULL;

  -- Pass 1: globally impossible dates (1956 floor, today+1yr ceiling).
  UPDATE page_tree_nodes
     SET date = NULL
   WHERE date IS NOT NULL
     AND (date < DATE '1956-01-01' OR date > (CURRENT_DATE + INTERVAL '1 year'));
  GET DIAGNOSTICS bad_global_count = ROW_COUNT;

  -- Pass 2: dates that pre-date the aircraft's known manufacture year.
  -- aircraft.year may be NULL — skip those (we can't sanity-check).
  UPDATE page_tree_nodes p
     SET date = NULL
    FROM aircraft a
   WHERE p.date IS NOT NULL
     AND p.aircraft_id = a.id
     AND a.year IS NOT NULL
     AND EXTRACT(YEAR FROM p.date)::int < a.year - 1;
  GET DIAGNOSTICS bad_premake_count = ROW_COUNT;

  RAISE NOTICE 'page_tree_nodes sanitised: % nulled globally, % nulled pre-aircraft-manufacture, % total rows with date',
    bad_global_count, bad_premake_count, total_count;
END $$;

-- Add a partial index on (aircraft_id, date DESC) where date IS NOT NULL.
-- The fleet-aggregation handler asks for the earliest/latest entry per
-- aircraft; this index makes that O(log n) instead of seq-scan.
CREATE INDEX IF NOT EXISTS idx_page_tree_nodes_aircraft_date
  ON page_tree_nodes (aircraft_id, date DESC)
  WHERE level = 'entry' AND date IS NOT NULL;
