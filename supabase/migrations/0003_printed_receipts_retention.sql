create extension if not exists pg_cron;

create table if not exists public.printed_receipts (
  id uuid primary key default gen_random_uuid(),
  sale_id text not null references public.sales(id) on delete cascade,
  printed_at timestamptz not null default now(),
  receipt_data jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  constraint printed_receipts_sale_id_key unique (sale_id)
);

create index if not exists printed_receipts_printed_at_idx on public.printed_receipts (printed_at);

alter table public.printed_receipts enable row level security;

drop policy if exists printed_receipts_insert_authenticated on public.printed_receipts;
create policy printed_receipts_insert_authenticated on public.printed_receipts
for insert to authenticated
with check (
  exists (
    select 1 from public.sales
    where sales.id = printed_receipts.sale_id
      and (sales.cashier_id = auth.uid() or public.is_admin())
  )
);

drop policy if exists printed_receipts_update_authenticated on public.printed_receipts;
create policy printed_receipts_update_authenticated on public.printed_receipts
for update to authenticated
using (
  public.is_admin() or exists (
    select 1 from public.sales
    where sales.id = printed_receipts.sale_id and sales.cashier_id = auth.uid()
  )
)
with check (
  public.is_admin() or exists (
    select 1 from public.sales
    where sales.id = printed_receipts.sale_id and sales.cashier_id = auth.uid()
  )
);

drop policy if exists printed_receipts_select_authenticated on public.printed_receipts;
create policy printed_receipts_select_authenticated on public.printed_receipts
for select to authenticated
using (public.is_admin() or exists (
  select 1 from public.sales
  where sales.id = printed_receipts.sale_id and sales.cashier_id = auth.uid()
));

create or replace function public.delete_expired_printed_receipts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  delete from public.printed_receipts
  where printed_at < now() - interval '1 month';
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.delete_expired_printed_receipts() from public;
grant execute on function public.delete_expired_printed_receipts() to service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'hxu-delete-expired-printed-receipts') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'hxu-delete-expired-printed-receipts';
  end if;
  perform cron.schedule(
    'hxu-delete-expired-printed-receipts',
    '0 17 * * *',
    $job$select public.delete_expired_printed_receipts();$job$
  );
end;
$$;
