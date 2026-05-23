-- Race-safe estimate → invoice conversion.
--
-- The /api/estimates/[id]/convert-to-invoice route checks for an
-- existing conversion with a SELECT, then INSERTs. Two concurrent
-- POSTs (e.g. a double-clicked button) both pass the check and both
-- create invoices pointing at the same estimate — the customer ends
-- up double-billed.
--
-- Fix: a partial UNIQUE INDEX on invoices.estimate_id (NULLs allowed —
-- most invoices aren't from estimates). The second INSERT errors with
-- 23505; the route catches it and returns the existing invoice.

CREATE UNIQUE INDEX IF NOT EXISTS invoices_estimate_id_unique
  ON public.invoices (estimate_id)
  WHERE estimate_id IS NOT NULL;
