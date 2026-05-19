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
ALTER TABLE public.atlas_order_events    ADD PRIMARY KEY (id);
ALTER TABLE public.atlas_order_records   ADD PRIMARY KEY (id);
ALTER TABLE public.atlas_part_offers     ADD PRIMARY KEY (id);
ALTER TABLE public.atlas_part_searches   ADD PRIMARY KEY (id);
ALTER TABLE public.chat_payments         ADD PRIMARY KEY (id);
ALTER TABLE public.digital_signatures    ADD PRIMARY KEY (id);
ALTER TABLE public.part_orders           ADD PRIMARY KEY (id);
ALTER TABLE public.part_request_events   ADD PRIMARY KEY (id);
ALTER TABLE public.part_requests         ADD PRIMARY KEY (id);
ALTER TABLE public.part_searches         ADD PRIMARY KEY (id);
ALTER TABLE public.parts_catalog         ADD PRIMARY KEY (id);
ALTER TABLE public.vendor_results        ADD PRIMARY KEY (id);
