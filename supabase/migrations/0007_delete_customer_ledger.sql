CREATE OR REPLACE FUNCTION public.delete_customer_ledger(p_customer_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_name text := trim(coalesce(p_customer_name, ''));
  credit_due numeric(12,2) := 0;
  deposit_balance numeric(12,2) := 0;
BEGIN
  IF normalized_name = '' THEN
    RAISE EXCEPTION 'Customer name လိုအပ်ပါသည်။';
  END IF;

  SELECT coalesce(sum(CASE WHEN balance_due > 0 THEN balance_due ELSE 0 END), 0)
    INTO credit_due
    FROM sales
   WHERE lower(trim(customer_name)) = lower(normalized_name);

  SELECT greatest(coalesce(sum(
    CASE WHEN entry_type = 'deposit' THEN amount
         WHEN entry_type = 'deposit_applied' THEN -amount
         ELSE 0 END), 0), 0)
    INTO deposit_balance
    FROM customer_ledger
   WHERE lower(trim(customer_name)) = lower(normalized_name);

  IF credit_due > 0 OR deposit_balance > 0 THEN
    RAISE EXCEPTION 'Customer တွင် အကြွေးကျန် သို့မဟုတ် ချန်ထားငွေ ရှိနေသေးပါသည်။';
  END IF;

  DELETE FROM customer_ledger
   WHERE lower(trim(customer_name)) = lower(normalized_name);

  RETURN jsonb_build_object('customerName', normalized_name, 'deleted', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_customer_ledger(text) TO authenticated;
