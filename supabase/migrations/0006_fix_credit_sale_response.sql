-- Keep the credit sale response valid when the sale still has an outstanding balance.
-- The previous jsonb_set(..., to_jsonb(NULL), ...) could turn the whole response
-- into SQL NULL after the sale and ledger rows had already been committed.
CREATE OR REPLACE FUNCTION public.create_sale_with_payment(
  p_items jsonb,
  p_age_verified boolean DEFAULT false,
  p_payment_method text DEFAULT 'cash',
  p_customer_name text DEFAULT '',
  p_is_credit boolean DEFAULT false,
  p_initial_paid_amount numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  new_sale_id text;
  sale_total numeric(12,2);
  cash_paid numeric(12,2);
  deposit_available numeric(12,2) := 0;
  applied_deposit numeric(12,2) := 0;
  normalized_customer text := trim(coalesce(p_customer_name, ''));
  final_paid numeric(12,2);
  outstanding_balance numeric(12,2);
BEGIN
  IF NOT coalesce(p_is_credit, false) THEN
    RETURN public.create_sale(p_items, p_age_verified, p_payment_method, normalized_customer, false);
  END IF;
  IF normalized_customer = '' THEN
    RAISE EXCEPTION 'အကြွေးရောင်းရန် customer name လိုအပ်ပါသည်။';
  END IF;

  result := public.create_sale(p_items, p_age_verified, p_payment_method, normalized_customer, true);
  new_sale_id := result->'sale'->>'id';
  sale_total := round(coalesce((result->'sale'->>'totalAmount')::numeric, 0), 2);
  cash_paid := least(greatest(round(coalesce(p_initial_paid_amount, 0), 2), 0), sale_total);

  SELECT coalesce(sum(
    CASE WHEN entry_type = 'deposit' THEN amount
         WHEN entry_type = 'deposit_applied' THEN -amount
         ELSE 0 END), 0)
    INTO deposit_available
    FROM customer_ledger
   WHERE lower(trim(customer_name)) = lower(normalized_customer);

  applied_deposit := least(greatest(deposit_available, 0), greatest(sale_total - cash_paid, 0));
  final_paid := cash_paid + applied_deposit;
  outstanding_balance := greatest(sale_total - final_paid, 0);

  UPDATE sales
     SET paid_amount = final_paid,
         balance_due = outstanding_balance,
         is_credit = outstanding_balance > 0,
         settled_at = CASE WHEN outstanding_balance = 0 THEN now() ELSE NULL END
   WHERE id = new_sale_id;

  IF outstanding_balance > 0 THEN
    INSERT INTO customer_ledger(customer_name, sale_id, entry_type, amount, note, created_by)
    VALUES (normalized_customer, new_sale_id, 'sale_credit', outstanding_balance, 'Credit sale', auth.uid());
  END IF;

  IF applied_deposit > 0 THEN
    INSERT INTO customer_ledger(customer_name, sale_id, entry_type, amount, note, created_by)
    VALUES (normalized_customer, new_sale_id, 'deposit_applied', applied_deposit, 'Customer deposit applied to sale', auth.uid());
  END IF;

  result := jsonb_set(result, '{sale,paidAmount}', to_jsonb(final_paid), true);
  result := jsonb_set(result, '{sale,balanceDue}', to_jsonb(outstanding_balance), true);
  result := jsonb_set(result, '{sale,isCredit}', to_jsonb(outstanding_balance > 0), true);
  IF outstanding_balance = 0 THEN
    result := jsonb_set(result, '{sale,settledAt}', to_jsonb(now()), true);
  END IF;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_sale_with_payment(jsonb, boolean, text, text, boolean, numeric) TO authenticated;
