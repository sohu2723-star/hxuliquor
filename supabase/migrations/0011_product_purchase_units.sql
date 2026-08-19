-- Store the unit in which inventory was purchased and the entered purchase cost.
-- cost_price remains the normalized base-unit cost used by the existing sale RPC.
alter table public.products
  add column if not exists purchase_unit text not null default 'unit',
  add column if not exists purchase_cost numeric not null default 0;

alter table public.products
  drop constraint if exists products_purchase_unit_check;

alter table public.products
  add constraint products_purchase_unit_check
  check (purchase_unit in ('unit', 'pack', 'case'));

-- Existing products were historically entered with a base-unit cost.
update public.products
set purchase_unit = 'unit',
    purchase_cost = cost_price
where purchase_cost = 0 and cost_price <> 0;

comment on column public.products.purchase_unit is 'Unit used when purchasing inventory: unit, pack, or case.';
comment on column public.products.purchase_cost is 'Entered purchase cost for purchase_unit; cost_price remains normalized base-unit cost.';

notify pgrst, 'reload schema';
