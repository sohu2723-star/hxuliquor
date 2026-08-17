create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  v_role := case when not exists (select 1 from public.profiles) then 'admin' else 'employee' end;
  insert into public.profiles (id, name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    coalesce(new.email, ''),
    v_role
  )
  on conflict (id) do update set
    name = excluded.name,
    email = excluded.email;
  return new;
end;
$$;
