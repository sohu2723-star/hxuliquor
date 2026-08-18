create table if not exists public.cash_transactions (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('outside_income', 'expense')),
  amount numeric(12,2) not null check (amount > 0),
  note text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);

create index if not exists cash_transactions_created_at_idx on public.cash_transactions (created_at desc);
create index if not exists cash_transactions_type_idx on public.cash_transactions (type);

alter table public.cash_transactions enable row level security;

drop policy if exists cash_transactions_admin_access on public.cash_transactions;
create policy cash_transactions_admin_access on public.cash_transactions
for all to authenticated
using (public.is_admin())
with check (public.is_admin());
