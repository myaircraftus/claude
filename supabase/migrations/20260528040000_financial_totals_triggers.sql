-- Trigger-backed totals recompute for invoices + estimates.
--
-- Header totals (subtotal, tax_amount, discount_amount, fees_total,
-- deposit_credit_total, total, balance_due) ARE NOT allowed to drift
-- from the sum of line items + payment_total. Every INSERT / UPDATE /
-- DELETE on invoice_line_items or estimate_line_items fires the
-- recompute. payments writes also recompute amount_paid + balance_due.
--
-- The recompute is intentionally idempotent — running it twice is a
-- no-op. We never overwrite the writer's `status` field; only the
-- numeric totals are touched.

-- ── INVOICES ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.recompute_invoice_totals(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subtotal numeric := 0;
  v_tax numeric := 0;
  v_discount numeric := 0;
  v_fees numeric := 0;
  v_deposit numeric := 0;
  v_paid numeric := 0;
  v_total numeric := 0;
BEGIN
  SELECT
    COALESCE(SUM(CASE WHEN item_type NOT IN ('tax','discount','deposit_credit','fee') THEN line_total END), 0),
    COALESCE(SUM(CASE WHEN item_type = 'tax' THEN line_total END), 0),
    COALESCE(SUM(CASE WHEN item_type = 'discount' THEN line_total END), 0),
    COALESCE(SUM(CASE WHEN item_type = 'fee' THEN line_total END), 0),
    COALESCE(SUM(CASE WHEN item_type = 'deposit_credit' THEN line_total END), 0)
  INTO v_subtotal, v_tax, v_discount, v_fees, v_deposit
    FROM public.invoice_line_items
   WHERE invoice_id = p_invoice_id;

  SELECT COALESCE(SUM(amount), 0)
    INTO v_paid
    FROM public.payments
   WHERE invoice_id = p_invoice_id
     AND COALESCE(status, 'received') IN ('received','verified','succeeded','completed','captured');

  -- Discount is stored as a positive number in our schema; subtract.
  v_total := v_subtotal + v_tax + v_fees - v_discount - v_deposit;
  IF v_total < 0 THEN v_total := 0; END IF;

  -- balance_due is a generated column (total - amount_paid) so we
  -- intentionally don't write to it here.
  UPDATE public.invoices
     SET subtotal = v_subtotal,
         tax_amount = v_tax,
         discount_amount = v_discount,
         fees_total = v_fees,
         deposit_credit_total = v_deposit,
         amount_paid = v_paid,
         payment_total = v_paid,
         total = v_total,
         updated_at = now()
   WHERE id = p_invoice_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_invoice_line_recompute()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_invoice_id := OLD.invoice_id;
  ELSE
    v_invoice_id := NEW.invoice_id;
  END IF;
  IF v_invoice_id IS NOT NULL THEN
    PERFORM public.recompute_invoice_totals(v_invoice_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS invoice_line_items_recompute_aiud ON public.invoice_line_items;
CREATE TRIGGER invoice_line_items_recompute_aiud
AFTER INSERT OR UPDATE OR DELETE ON public.invoice_line_items
FOR EACH ROW EXECUTE FUNCTION public.tg_invoice_line_recompute();

CREATE OR REPLACE FUNCTION public.tg_payment_recompute()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_invoice_id := OLD.invoice_id;
  ELSE
    v_invoice_id := NEW.invoice_id;
  END IF;
  IF v_invoice_id IS NOT NULL THEN
    PERFORM public.recompute_invoice_totals(v_invoice_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS payments_recompute_aiud ON public.payments;
CREATE TRIGGER payments_recompute_aiud
AFTER INSERT OR UPDATE OR DELETE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.tg_payment_recompute();

-- ── ESTIMATES ──────────────────────────────────────────────────────
-- Estimates split their numeric subtotal across labor_total, parts_total,
-- outside_services_total, with `total` as the rolled-up figure.
CREATE OR REPLACE FUNCTION public.recompute_estimate_totals(p_estimate_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_labor numeric := 0;
  v_parts numeric := 0;
  v_outside numeric := 0;
  v_other numeric := 0;
  v_total numeric := 0;
BEGIN
  SELECT
    COALESCE(SUM(CASE WHEN item_type = 'labor' THEN line_total END), 0),
    COALESCE(SUM(CASE WHEN item_type = 'part' THEN line_total END), 0),
    COALESCE(SUM(CASE WHEN item_type IN ('outside_service','outside') THEN line_total END), 0),
    COALESCE(SUM(CASE WHEN item_type NOT IN ('labor','part','outside_service','outside','discount','deposit_credit','tax','fee') THEN line_total END), 0)
  INTO v_labor, v_parts, v_outside, v_other
    FROM public.estimate_line_items
   WHERE estimate_id = p_estimate_id;

  v_total := v_labor + v_parts + v_outside + v_other
           + COALESCE((SELECT SUM(line_total) FROM public.estimate_line_items WHERE estimate_id = p_estimate_id AND item_type IN ('tax','fee')), 0)
           - COALESCE((SELECT SUM(line_total) FROM public.estimate_line_items WHERE estimate_id = p_estimate_id AND item_type IN ('discount','deposit_credit')), 0);
  IF v_total < 0 THEN v_total := 0; END IF;

  UPDATE public.estimates
     SET labor_total = v_labor,
         parts_total = v_parts,
         outside_services_total = v_outside,
         total = v_total,
         updated_at = now()
   WHERE id = p_estimate_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_estimate_line_recompute()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_estimate_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_estimate_id := OLD.estimate_id;
  ELSE
    v_estimate_id := NEW.estimate_id;
  END IF;
  IF v_estimate_id IS NOT NULL THEN
    PERFORM public.recompute_estimate_totals(v_estimate_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS estimate_line_items_recompute_aiud ON public.estimate_line_items;
CREATE TRIGGER estimate_line_items_recompute_aiud
AFTER INSERT OR UPDATE OR DELETE ON public.estimate_line_items
FOR EACH ROW EXECUTE FUNCTION public.tg_estimate_line_recompute();

-- Initial reconciliation: trigger recompute on every existing row so
-- everything in prod is consistent from this moment on.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.invoices LOOP
    PERFORM public.recompute_invoice_totals(r.id);
  END LOOP;
  FOR r IN SELECT id FROM public.estimates LOOP
    PERFORM public.recompute_estimate_totals(r.id);
  END LOOP;
END $$;
