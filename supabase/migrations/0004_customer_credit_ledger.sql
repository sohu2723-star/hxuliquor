CREATE TABLE IF NOT EXISTS customer_ledger (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_name text NOT NULL,
  sale_id text REFERENCES sales(id) ON DELETE SET NULL,
  entry_type text NOT NULL CHECK (entry_type IN ('sale_credit', 'payment', 'deposit', 'deposit_applied')),
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  note text,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS customer_ledger_customer_name_idx ON customer_ledger (lower(customer_name));
CREATE INDEX IF NOT EXISTS customer_ledger_created_at_idx ON customer_ledger (created_at DESC);

ALTER TABLE customer_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_full_access_customer_ledger" ON customer_ledger;
CREATE POLICY "admin_full_access_customer_ledger" ON customer_ledger
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE OR REPLACE FUNCTION create_sale_with_payment(
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

  UPDATE sales
     SET paid_amount = final_paid,
         balance_due = greatest(sale_total - final_paid, 0),
         is_credit = greatest(sale_total - final_paid, 0) > 0,
         settled_at = CASE WHEN greatest(sale_total - final_paid, 0) = 0 THEN now() ELSE NULL END
   WHERE id = new_sale_id;

  IF greatest(sale_total - final_paid, 0) > 0 THEN
    INSERT INTO customer_ledger(customer_name, sale_id, entry_type, amount, note, created_by)
    VALUES (normalized_customer, new_sale_id, 'sale_credit', greatest(sale_total - final_paid, 0), 'Credit sale', auth.uid());
  END IF;

  IF applied_deposit > 0 THEN
    INSERT INTO customer_ledger(customer_name, sale_id, entry_type, amount, note, created_by)
    VALUES (normalized_customer, new_sale_id, 'deposit_applied', applied_deposit, 'Customer deposit applied to sale', auth.uid());
  END IF;

  result := jsonb_set(result, '{sale,paidAmount}', to_jsonb(final_paid), true);
  result := jsonb_set(result, '{sale,balanceDue}', to_jsonb(greatest(sale_total - final_paid, 0)), true);
  result := jsonb_set(result, '{sale,isCredit}', to_jsonb(greatest(sale_total - final_paid, 0) > 0), true);
  result := jsonb_set(result, '{sale,settledAt}', to_jsonb(CASE WHEN greatest(sale_total - final_paid, 0) = 0 THEN now() ELSE NULL END), true);
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION add_customer_payment(
  p_customer_name text,
  p_amount numeric,
  p_sale_id text DEFAULT NULL,
  p_note text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_name text := trim(coalesce(p_customer_name, ''));
  remaining_payment numeric(12,2) := round(coalesce(p_amount, 0), 2);
  target_sale record;
  applied numeric(12,2);
  total_applied numeric(12,2) := 0;
  deposit_added numeric(12,2) := 0;
  current_due numeric(12,2) := 0;
BEGIN
  IF normalized_name = '' OR remaining_payment <= 0 THEN
    RAISE EXCEPTION 'Customer name နှင့် အပြုသဘောငွေပမာဏ လိုအပ်ပါသည်။';
  END IF;

  FOR target_sale IN
    SELECT id, balance_due
      FROM sales
     WHERE lower(trim(customer_name)) = lower(normalized_name)
       AND balance_due > 0
       AND (p_sale_id IS NULL OR id = p_sale_id)
     ORDER BY created_at ASC
     FOR UPDATE
  LOOP
    EXIT WHEN remaining_payment <= 0;
    applied := least(remaining_payment, target_sale.balance_due);
    UPDATE sales
       SET paid_amount = paid_amount + applied,
           balance_due = greatest(balance_due - applied, 0),
           is_credit = greatest(balance_due - applied, 0) > 0,
           settled_at = CASE WHEN greatest(balance_due - applied, 0) = 0 THEN now() ELSE settled_at END
     WHERE id = target_sale.id;
    INSERT INTO customer_ledger(customer_name, sale_id, entry_type, amount, note, created_by)
    VALUES (normalized_name, target_sale.id, 'payment', applied, coalesce(nullif(trim(p_note), ''), 'Credit payment'), auth.uid());
    remaining_payment := remaining_payment - applied;
    total_applied := total_applied + applied;
  END LOOP;

  IF remaining_payment > 0 THEN
    deposit_added := remaining_payment;
    INSERT INTO customer_ledger(customer_name, entry_type, amount, note, created_by)
    VALUES (normalized_name, 'deposit', deposit_added, coalesce(nullif(trim(p_note), ''), 'Customer deposit'), auth.uid());
  END IF;

  SELECT coalesce(sum(CASE WHEN balance_due > 0 THEN balance_due ELSE 0 END), 0)
    INTO current_due
    FROM sales
   WHERE lower(trim(customer_name)) = lower(normalized_name);

  RETURN jsonb_build_object(
    'customerName', normalized_name,
    'applied', total_applied,
    'depositAdded', deposit_added,
    'balanceDue', current_due
  );
END;
$$;

CREATE OR REPLACE FUNCTION get_customer_balances()
RETURNS TABLE (
  customer_name text,
  credit_due numeric,
  deposit_balance numeric,
  net_balance numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH sales_balances AS (
    SELECT lower(trim(s.customer_name)) AS customer_key,
           min(trim(s.customer_name)) AS customer_name,
           coalesce(sum(CASE WHEN s.balance_due > 0 THEN s.balance_due ELSE 0 END), 0)::numeric AS credit_due,
           min(s.created_at) AS first_sale_at
      FROM sales s
     WHERE nullif(trim(s.customer_name), '') IS NOT NULL
     GROUP BY lower(trim(s.customer_name))
  ), ledger_balances AS (
    SELECT lower(trim(l.customer_name)) AS customer_key,
           min(trim(l.customer_name)) AS customer_name,
           greatest(coalesce(sum(CASE WHEN l.entry_type = 'deposit' THEN l.amount WHEN l.entry_type = 'deposit_applied' THEN -l.amount ELSE 0 END), 0), 0)::numeric AS deposit_balance
      FROM customer_ledger l
     WHERE nullif(trim(l.customer_name), '') IS NOT NULL
     GROUP BY lower(trim(l.customer_name))
  )
  SELECT coalesce(s.customer_name, l.customer_name) AS customer_name,
         coalesce(s.credit_due, 0)::numeric AS credit_due,
         coalesce(l.deposit_balance, 0)::numeric AS deposit_balance,
         (coalesce(s.credit_due, 0) - coalesce(l.deposit_balance, 0))::numeric AS net_balance
    FROM sales_balances s
    FULL OUTER JOIN ledger_balances l USING (customer_key)
   WHERE coalesce(s.credit_due, 0) > 0 OR coalesce(l.deposit_balance, 0) > 0
   ORDER BY coalesce(s.first_sale_at, now()) DESC;
$$;

CREATE OR REPLACE FUNCTION get_customer_ledger(p_customer_name text)
RETURNS SETOF customer_ledger
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
    FROM customer_ledger
   WHERE lower(trim(customer_name)) = lower(trim(p_customer_name))
   ORDER BY created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION create_sale_with_payment(jsonb, boolean, text, text, boolean, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION add_customer_payment(text, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_customer_balances() TO authenticated;
GRANT EXECUTE ON FUNCTION get_customer_ledger(text) TO authenticated;
