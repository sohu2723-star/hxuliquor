-- Preserve sale history: products referenced by sale_items are archived instead of hard-deleted.
alter table public.products
  add column if not exists is_active boolean not null default true;

create index if not exists products_is_active_idx on public.products (is_active);
