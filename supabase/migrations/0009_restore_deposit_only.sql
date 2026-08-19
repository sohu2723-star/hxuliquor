-- Keep the explicit "Add deposit" action separate from credit payment.
-- The "Pay customer" action already applies payment to credit first and stores any remainder as deposit.

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

  SELECT coalesce(sum(CASE WHEN balance_due > 0 THEN balance_due ELSE 0 END), 0)
    INTO current_due
    FROM sales
   WHERE lower(trim(customer_name)) = lower(normalized_name);

  RETURN jsonb_build_object(
    'customerName', normalized_name,
    'applied', 0,
    'depositAdded', deposit_amount,
    'balanceDue', current_due
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_customer_deposit(text, numeric, text) TO authenticated;

COMMENT ON FUNCTION public.add_customer_deposit(text, numeric, text) IS
  'Stores a customer deposit without reducing credit. Use add_customer_payment to pay credit first.';
