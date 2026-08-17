create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  legacy_id text unique,
  name text not null default '',
  email text not null,
  role text not null default 'employee' check (role in ('admin', 'employee')),
  created_at timestamptz not null default now()
);

create unique index if not exists profiles_email_lower_idx on public.profiles (lower(email));

create table if not exists public.products (
  id text primary key,
  barcode text not null default '',
  name text not null,
  category text not null default '',
  product_color text not null default '',
  product_size text not null default '',
  price numeric(12,2) not null default 0,
  cost_price numeric(12,2) not null default 0,
  stock_qty integer not null default 0 check (stock_qty >= 0),
  low_stock_threshold integer not null default 0 check (low_stock_threshold >= 0),
  units_per_pack integer not null default 1 check (units_per_pack >= 1),
  pack_price numeric(12,2) not null default 0,
  sale_type text not null default 'both' check (sale_type in ('unit', 'pack', 'both')),
  requires_age_check boolean not null default false,
  image_url text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists products_category_idx on public.products (category);
create index if not exists products_barcode_idx on public.products (barcode);

create table if not exists public.sales (
  id text primary key,
  cashier_id uuid references public.profiles(id) on delete set null,
  cashier_legacy_id text,
  cashier_name text not null default 'Cashier',
  cashier_email text not null default '',
  total_amount numeric(12,2) not null default 0,
  paid_amount numeric(12,2) not null default 0,
  balance_due numeric(12,2) not null default 0,
  customer_name text not null default '',
  is_credit boolean not null default false,
  settled_at timestamptz,
  payment_method text not null default 'cash',
  age_verified boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists sales_created_at_idx on public.sales (created_at);
create index if not exists sales_balance_due_idx on public.sales (balance_due) where balance_due > 0;

create table if not exists public.sale_items (
  id text primary key,
  sale_id text not null references public.sales(id) on delete cascade,
  product_id text not null references public.products(id) on delete restrict,
  product_name text not null,
  quantity integer not null check (quantity > 0),
  sale_quantity integer not null check (sale_quantity > 0),
  sale_unit text not null default 'unit' check (sale_unit in ('unit', 'pack')),
  unit_price numeric(12,2) not null default 0,
  subtotal numeric(12,2) not null default 0,
  unit_cost numeric(12,2) not null default 0,
  profit numeric(12,2) not null default 0
);

create index if not exists sale_items_sale_id_idx on public.sale_items (sale_id);
create index if not exists sale_items_product_id_idx on public.sale_items (product_id);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    coalesce(new.email, '')
  )
  on conflict (id) do update set
    name = excluded.name,
    email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;

drop policy if exists profiles_select_self_or_admin on public.profiles;
create policy profiles_select_self_or_admin on public.profiles
for select to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles
for insert to authenticated
with check (id = auth.uid());

drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin on public.profiles
for update to authenticated
using (public.is_admin()) with check (public.is_admin());

drop policy if exists products_select_authenticated on public.products;
create policy products_select_authenticated on public.products
for select to authenticated using (true);

drop policy if exists products_insert_admin on public.products;
create policy products_insert_admin on public.products
for insert to authenticated with check (public.is_admin());

drop policy if exists products_update_admin on public.products;
create policy products_update_admin on public.products
for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists products_delete_admin on public.products;
create policy products_delete_admin on public.products
for delete to authenticated using (public.is_admin());

drop policy if exists sales_select_authenticated on public.sales;
create policy sales_select_authenticated on public.sales
for select to authenticated using (true);

drop policy if exists sale_items_select_authenticated on public.sale_items;
create policy sale_items_select_authenticated on public.sale_items
for select to authenticated using (true);

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do update set public = true;

drop policy if exists product_images_public_read on storage.objects;
create policy product_images_public_read on storage.objects
for select using (bucket_id = 'product-images');

drop policy if exists product_images_admin_insert on storage.objects;
create policy product_images_admin_insert on storage.objects
for insert to authenticated with check (bucket_id = 'product-images' and public.is_admin());

drop policy if exists product_images_admin_update on storage.objects;
create policy product_images_admin_update on storage.objects
for update to authenticated using (bucket_id = 'product-images' and public.is_admin()) with check (bucket_id = 'product-images' and public.is_admin());

drop policy if exists product_images_admin_delete on storage.objects;
create policy product_images_admin_delete on storage.objects
for delete to authenticated using (bucket_id = 'product-images' and public.is_admin());

create or replace function public.create_sale(
  p_items jsonb,
  p_age_verified boolean default false,
  p_payment_method text default 'cash',
  p_customer_name text default '',
  p_is_credit boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.profiles%rowtype;
  v_item jsonb;
  v_product public.products%rowtype;
  v_sale_id text := gen_random_uuid()::text;
  v_product_id text;
  v_quantity integer;
  v_sale_unit text;
  v_units_per_pack integer;
  v_stock_quantity integer;
  v_selling_price numeric(12,2);
  v_subtotal numeric(12,2);
  v_unit_cost numeric(12,2);
  v_profit numeric(12,2);
  v_total numeric(12,2) := 0;
  v_is_credit boolean := coalesce(p_is_credit, false) or lower(coalesce(p_payment_method, 'cash')) = 'credit';
  v_paid numeric(12,2);
  v_balance numeric(12,2);
begin
  if auth.uid() is null then
    raise exception 'Login session မရှိပါ။ Login ပြန်လုပ်ပါ။';
  end if;

  select * into v_actor from public.profiles where id = auth.uid();
  if not found then
    raise exception 'User profile မရှိသေးပါ။';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Cart ထဲတွင် product မရှိပါ။';
  end if;
  if v_is_credit and nullif(trim(coalesce(p_customer_name, '')), '') is null then
    raise exception 'အကြွေးရောင်းရန် customer name လိုအပ်ပါသည်။';
  end if;

  insert into public.sales (id, cashier_id, cashier_legacy_id, cashier_name, cashier_email, customer_name, is_credit, payment_method, age_verified)
  values (v_sale_id, v_actor.id, v_actor.legacy_id, v_actor.name, lower(v_actor.email), coalesce(p_customer_name, ''), v_is_credit, coalesce(p_payment_method, 'cash'), coalesce(p_age_verified, false));

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_product_id := coalesce(v_item ->> 'productId', v_item ->> 'product_id', '');
    v_quantity := floor(coalesce(nullif(v_item ->> 'quantity', '')::numeric, 0))::integer;
    v_sale_unit := case when coalesce(v_item ->> 'saleUnit', v_item ->> 'sale_unit', 'unit') = 'pack' then 'pack' else 'unit' end;
    if v_product_id = '' or v_quantity <= 0 then
      raise exception 'Cart item မမှန်ပါ။';
    end if;

    select * into v_product from public.products where id = v_product_id for update;
    if not found then
      raise exception 'Product % မတွေ့ပါ။', v_product_id;
    end if;
    if v_product.requires_age_check and not coalesce(p_age_verified, false) then
      raise exception 'Age verification required for restricted items';
    end if;

    v_units_per_pack := greatest(1, v_product.units_per_pack);
    v_stock_quantity := v_quantity * case when v_sale_unit = 'pack' and v_product.sale_type <> 'pack' then v_units_per_pack else 1 end;
    if v_product.stock_qty < v_stock_quantity then
      raise exception 'Insufficient stock for %', v_product.name;
    end if;

    v_selling_price := case when v_sale_unit = 'pack' then coalesce(nullif(v_product.pack_price, 0), v_product.price) else v_product.price end;
    if v_sale_unit = 'pack' and (v_units_per_pack <= 1 or v_selling_price <= 0) then
      raise exception 'Pack price is not configured for %', v_product.name;
    end if;
    v_subtotal := v_selling_price * v_quantity;
    v_unit_cost := v_product.cost_price;
    v_profit := v_subtotal - (v_unit_cost * v_stock_quantity);
    v_total := v_total + v_subtotal;

    update public.products set stock_qty = stock_qty - v_stock_quantity where id = v_product_id;
    insert into public.sale_items (id, sale_id, product_id, product_name, quantity, sale_quantity, sale_unit, unit_price, subtotal, unit_cost, profit)
    values (gen_random_uuid()::text, v_sale_id, v_product_id, v_product.name || case when v_sale_unit = 'pack' then ' (Pack x' || v_units_per_pack || ')' else '' end, v_stock_quantity, v_quantity, v_sale_unit, v_subtotal / v_stock_quantity, v_subtotal, v_unit_cost, v_profit);
  end loop;

  v_paid := case when v_is_credit then 0 else v_total end;
  v_balance := case when v_is_credit then v_total else 0 end;
  update public.sales set total_amount = v_total, paid_amount = v_paid, balance_due = v_balance where id = v_sale_id;

  return jsonb_build_object(
    'success', true,
    'sale', (
      select jsonb_build_object(
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
        'items', coalesce((select jsonb_agg(to_jsonb(si)) from public.sale_items si where si.sale_id = s.id), '[]'::jsonb)
      ) from public.sales s where s.id = v_sale_id
    )
  );
end;
$$;

grant execute on function public.create_sale(jsonb, boolean, text, text, boolean) to authenticated;

create or replace function public.pay_credit(p_sale_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale public.sales%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Login session မရှိပါ။ Login ပြန်လုပ်ပါ။';
  end if;
  update public.sales
  set paid_amount = total_amount, balance_due = 0, settled_at = now()
  where id = p_sale_id and balance_due > 0
  returning * into v_sale;
  if not found then
    raise exception 'အကြွေးစာရင်း မတွေ့ပါ သို့မဟုတ် ပေးချေပြီးဖြစ်ပါသည်။';
  end if;
  return jsonb_build_object(
    'success', true,
    'sale', jsonb_build_object(
      'id', v_sale.id,
      'cashierId', coalesce(v_sale.cashier_id::text, v_sale.cashier_legacy_id, ''),
      'cashierName', v_sale.cashier_name,
      'cashierEmail', v_sale.cashier_email,
      'totalAmount', v_sale.total_amount,
      'paidAmount', v_sale.paid_amount,
      'balanceDue', v_sale.balance_due,
      'customerName', v_sale.customer_name,
      'isCredit', v_sale.is_credit,
      'settledAt', v_sale.settled_at,
      'paymentMethod', v_sale.payment_method,
      'ageVerified', v_sale.age_verified,
      'createdAt', v_sale.created_at,
      'items', coalesce((select jsonb_agg(to_jsonb(si)) from public.sale_items si where si.sale_id = v_sale.id), '[]'::jsonb)
    )
  );
end;
$$;

grant execute on function public.pay_credit(text) to authenticated;
