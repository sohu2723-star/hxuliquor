create index if not exists sales_cashier_id_idx on public.sales (cashier_id);

drop policy if exists profiles_select_self_or_admin on public.profiles;
create policy profiles_select_self_or_admin on public.profiles
for select to authenticated
using (id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles
for insert to authenticated
with check (id = (select auth.uid()));

drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin on public.profiles
for update to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));
