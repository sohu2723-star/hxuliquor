-- Reconcile customer money in the safe order:
-- 1) apply available deposit/payment to the oldest outstanding credit;
-- 2) keep only the remainder as deposit.

CREATE OR REPLACE FUNCTION public.reconcile_customer_deposit(p_customer_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_name text := trim(coalesce(p_customer_name, ''));
  remaining_deposit numeric(12,2) := 0;
  applied numeric(12,2);
  total_applied numeric(12,2) := 0;
  target_sale record;
  current_due numeric(12,2) := 0;
BEGIN
  IF normalized_name = '' THEN
    RAISE EXCEPTION 'Customer name လိုအပ်ပါသည်။';
  END IF;

  SELECT greatest(coalesce(sum(
    CASE
      WHEN entry_type = 'deposit' THEN amount
      WHEN entry_type = 'deposit_applied' THEN -amount
      ELSE 0
    END
  ), 0), 0)
    INTO remaining_deposit
    FROM customer_ledger
   WHERE lower(trim(customer_name)) = lower(normalized_name);

  FOR target_sale IN
    SELECT id, balance_due
      FROM sales
     WHERE lower(trim(customer_name)) = lower(normalized_name)
       AND coalesce(balance_due, 0) > 0
     ORDER BY created_at ASC, id ASC
     FOR UPDATE
  LOOP
    EXIT WHEN remaining_deposit <= 0;
    applied := least(remaining_deposit, target_sale.balance_due);

    UPDATE sales
       SET paid_amount = least(total_amount, coalesce(paid_amount, 0) + applied),
           balance_due = greatest(coalesce(balance_due, 0) - applied, 0),
           is_credit = greatest(coalesce(balance_due, 0) - applied, 0) > 0,
           settled_at = CASE
             WHEN greatest(coalesce(balance_due, 0) - applied, 0) = 0 THEN now()
             ELSE settled_at
           END
     WHERE id = target_sale.id;

    INSERT INTO customer_ledger(customer_name, sale_id, entry_type, amount, note, created_by)
    VALUES (normalized_name, target_sale.id, 'deposit_applied', applied, 'Customer deposit applied to credit', auth.uid());

    remaining_deposit := remaining_deposit - applied;
    total_applied := total_applied + applied;
  END LOOP;

  SELECT coalesce(sum(CASE WHEN balance_due > 0 THEN balance_due ELSE 0 END), 0)
    INTO current_due
    FROM sales
   WHERE lower(trim(customer_name)) = lower(normalized_name);

  RETURN jsonb_build_object(
    'customerName', normalized_name,
    'applied', total_applied,
    'depositRemaining', greatest(remaining_deposit, 0),
    'balanceDue', current_due
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_customer_deposit(text) FROM PUBLIC;

-- Repair existing records created before this rule was introduced.
DO $$
DECLARE
  customer record;
BEGIN
  FOR customer IN
    SELECT DISTINCT trim(customer_name) AS customer_name
      FROM customer_ledger
     WHERE entry_type = 'deposit'
       AND nullif(trim(customer_name), '') IS NOT NULL
  LOOP
    PERFORM public.reconcile_customer_deposit(customer.customer_name);
  END LOOP;
END;
$$;

-- New deposits also follow the same rule: credit is settled first, and only
-- the remainder stays as a deposit for the customer's next purchase.
CREATE OR REPLACE FUNCTION public.add_customer_deposit(
  p_customer_name text,
  p_amount numeric,
  p_note text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_name text := trim(coalesce(p_customer_name, ''));
  deposit_amount numeric(12,2) := round(coalesce(p_amount, 0), 2);
  reconciliation jsonb;
  applied_amount numeric(12,2) := 0;
  deposit_remaining numeric(12,2) := 0;
  current_due numeric(12,2) := 0;
BEGIN
  IF normalized_name = '' OR deposit_amount <= 0 THEN
    RAISE EXCEPTION 'Customer name နှင့် အပြုသဘောငွေပမာဏ လိုအပ်ပါသည်။';
  END IF;

  INSERT INTO customer_ledger(customer_name, entry_type, amount, note, created_by)
  VALUES (
    normalized_name,
    'deposit',
    deposit_amount,
    coalesce(nullif(trim(p_note), ''), 'Customer deposit'),
    auth.uid()
  );

  reconciliation := public.reconcile_customer_deposit(normalized_name);
  applied_amount := coalesce((reconciliation->>'applied')::numeric, 0);
  deposit_remaining := greatest(deposit_amount - applied_amount, 0);
  current_due := coalesce((reconciliation->>'balanceDue')::numeric, 0);

  RETURN jsonb_build_object(
    'customerName', normalized_name,
    'applied', applied_amount,
    'depositAdded', deposit_remaining,
    'balanceDue', current_due
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_customer_deposit(text, numeric, text) TO authenticated;
