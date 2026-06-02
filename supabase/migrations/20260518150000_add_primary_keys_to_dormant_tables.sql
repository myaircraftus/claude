-- Add PRIMARY KEYs to the 12 dormant marketplace/atlas tables that lacked one.
--
-- Each table ALREADY has an `id uuid` column with a uuid default — they were
-- simply created without the PRIMARY KEY constraint. (The originally proposed
-- `ADD COLUMN IF NOT EXISTS id ... PRIMARY KEY` would have been a silent no-op:
-- the column exists, so ADD COLUMN — and its PRIMARY KEY clause — is skipped.)
-- The correct fix is to add the constraint on the existing column.
--
-- Verified before writing this migration: 0 NULL `id` values across all 12
-- tables, so ADD PRIMARY KEY (which requires NOT NULL + UNIQUE) succeeds.
-- Clean-replay tolerance: these "dormant" tables exist in prod but were created
-- outside the migration chain, so they're absent on a from-scratch local
-- replay. Add the PK only to tables that exist, and only when they don't
-- already have one (ADD PRIMARY KEY is not idempotent). Unchanged effect in prod.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'atlas_order_events', 'atlas_order_records', 'atlas_part_offers',
    'atlas_part_searches', 'chat_payments', 'digital_signatures',
    'part_orders', 'part_request_events', 'part_requests',
    'part_searches', 'parts_catalog', 'vendor_results'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conrelid = ('public.' || t)::regclass AND contype = 'p'
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ADD PRIMARY KEY (id)', t);
    END IF;
  END LOOP;
END $$;
