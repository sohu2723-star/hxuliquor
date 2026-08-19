-- Three-level sale support: case/carton -> pack/box -> unit/stick.
-- Existing products remain compatible with packs_per_case = 1.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS packs_per_case integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS case_price numeric(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_packs_per_case_check;
ALTER TABLE public.products
  ADD CONSTRAINT products_packs_per_case_check CHECK (packs_per_case >= 1);

ALTER TABLE public.sale_items
  DROP CONSTRAINT IF EXISTS sale_items_sale_unit_check;
ALTER TABLE public.sale_items
  ADD CONSTRAINT sale_items_sale_unit_check CHECK (sale_unit IN ('unit', 'pack', 'case'));

CREATE OR REPLACE FUNCTION public.create_sale(
  p_items jsonb,
  p_age_verified boolean DEFAULT false,
  p_payment_method text DEFAULT 'cash',
  p_customer_name text DEFAULT '',
  p_is_credit boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor public.profiles%rowtype;
  v_item jsonb;
  v_product public.products%rowtype;
  v_sale_id text := gen_random_uuid()::text;
  v_product_id text;
  v_quantity integer;
  v_sale_unit text;
  v_units_per_pack integer;
  v_packs_per_case integer;
  v_stock_quantity integer;
  v_selling_price numeric(12,2);
  v_subtotal numeric(12,2);
  v_unit_cost numeric(12,2);
  v_profit numeric(12,2);
  v_total numeric(12,2) := 0;
  v_is_credit boolean := coalesce(p_is_credit, false) or lower(coalesce(p_payment_method, 'cash')) = 'credit';
  v_paid numeric(12,2);
  v_balance numeric(12,2);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Login session မရှိပါ။ Login ပြန်လုပ်ပါ။';
  END IF;

  SELECT * INTO v_actor FROM public.profiles WHERE id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User profile မရှိသေးပါ။';
  END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Cart ထဲတွင် product မရှိပါ။';
  END IF;
  IF v_is_credit AND nullif(trim(coalesce(p_customer_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'အကြွေးရောင်းရန် customer name လိုအပ်ပါသည်။';
  END IF;

  INSERT INTO public.sales (id, cashier_id, cashier_legacy_id, cashier_name, cashier_email, customer_name, is_credit, payment_method, age_verified)
  VALUES (v_sale_id, v_actor.id, v_actor.legacy_id, v_actor.name, lower(v_actor.email), coalesce(p_customer_name, ''), v_is_credit, coalesce(p_payment_method, 'cash'), coalesce(p_age_verified, false));

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := coalesce(v_item ->> 'productId', v_item ->> 'product_id', '');
    v_quantity := floor(coalesce(nullif(v_item ->> 'quantity', '')::numeric, 0))::integer;
    v_sale_unit := CASE
      WHEN coalesce(v_item ->> 'saleUnit', v_item ->> 'sale_unit', 'unit') = 'case' THEN 'case'
      WHEN coalesce(v_item ->> 'saleUnit', v_item ->> 'sale_unit', 'unit') = 'pack' THEN 'pack'
      ELSE 'unit'
    END;
    IF v_product_id = '' OR v_quantity <= 0 THEN
      RAISE EXCEPTION 'Cart item မမှန်ပါ။';
    END IF;

    SELECT * INTO v_product FROM public.products WHERE id = v_product_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product % မတွေ့ပါ။', v_product_id;
    END IF;
    IF v_product.requires_age_check AND NOT coalesce(p_age_verified, false) THEN
      RAISE EXCEPTION 'Age verification required for restricted items';
    END IF;

    v_units_per_pack := greatest(1, v_product.units_per_pack);
    v_packs_per_case := greatest(1, v_product.packs_per_case);
    v_stock_quantity := v_quantity * CASE
      WHEN v_sale_unit = 'case' THEN v_units_per_pack * v_packs_per_case
      WHEN v_sale_unit = 'pack' AND v_product.sale_type <> 'pack' THEN v_units_per_pack
      ELSE 1
    END;
    IF v_product.stock_qty < v_stock_quantity THEN
      RAISE EXCEPTION 'Insufficient stock for %', v_product.name;
    END IF;

    v_selling_price := CASE
      WHEN v_sale_unit = 'case' THEN coalesce(nullif(v_product.case_price, 0), 0)
      WHEN v_sale_unit = 'pack' THEN coalesce(nullif(v_product.pack_price, 0), v_product.price)
      ELSE v_product.price
    END;
    IF v_sale_unit = 'case' AND (v_packs_per_case <= 1 OR v_selling_price <= 0) THEN
      RAISE EXCEPTION 'Case price is not configured for %', v_product.name;
    END IF;
    IF v_sale_unit = 'pack' AND v_product.sale_type <> 'pack' AND (v_units_per_pack <= 1 OR v_selling_price <= 0) THEN
      RAISE EXCEPTION 'Pack price is not configured for %', v_product.name;
    END IF;

    v_subtotal := v_selling_price * v_quantity;
    v_unit_cost := v_product.cost_price;
    v_profit := v_subtotal - (v_unit_cost * v_stock_quantity);
    v_total := v_total + v_subtotal;

    UPDATE public.products SET stock_qty = stock_qty - v_stock_quantity WHERE id = v_product_id;
    INSERT INTO public.sale_items (id, sale_id, product_id, product_name, quantity, sale_quantity, sale_unit, unit_price, subtotal, unit_cost, profit)
    VALUES (
      gen_random_uuid()::text,
      v_sale_id,
      v_product_id,
      v_product.name || CASE
        WHEN v_sale_unit = 'case' THEN ' (Case x' || v_packs_per_case || ' packs x' || v_units_per_pack || ')'
        WHEN v_sale_unit = 'pack' AND v_product.sale_type <> 'pack' THEN ' (Pack x' || v_units_per_pack || ')'
        ELSE ''
      END,
      v_stock_quantity,
      v_quantity,
      v_sale_unit,
      v_subtotal / v_stock_quantity,
      v_subtotal,
      v_unit_cost,
      v_profit
    );
  END LOOP;

  v_paid := CASE WHEN v_is_credit THEN 0 ELSE v_total END;
  v_balance := CASE WHEN v_is_credit THEN v_total ELSE 0 END;
  UPDATE public.sales SET total_amount = v_total, paid_amount = v_paid, balance_due = v_balance WHERE id = v_sale_id;

  RETURN jsonb_build_object(
    'success', true,
    'sale', (
      SELECT jsonb_build_object(
        'id', s.id,
        'cashierId', coalesce(s.cashier_id::text, s.cashier_legacy_id, ''),
        'cashierName', s.cashier_name,
        'cashierEmail', s.cashier_email,
        'totalAmount', s.total_amount,
        'paidAmount', s.paid_amount,
        'balanceDue', s.balance_due,
        'customerName', s.customer_name,
        'isCredit', s.is_credit,
        'settledAt', s.settled_at,
        'paymentMethod', s.payment_method,
        'ageVerified', s.age_verified,
        'createdAt', s.created_at,
        'items', coalesce((SELECT jsonb_agg(to_jsonb(si)) FROM public.sale_items si WHERE si.sale_id = s.id), '[]'::jsonb)
      ) FROM public.sales s WHERE s.id = v_sale_id
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_sale(jsonb, boolean, text, text, boolean) TO authenticated;
