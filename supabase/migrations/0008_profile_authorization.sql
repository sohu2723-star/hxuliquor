-- Keep existing configured accounts active and require explicit authorization
-- for every profile created after this migration.
alter table public.profiles
  add column if not exists is_authorized boolean not null default false;

update public.profiles
set is_authorized = true
where is_authorized = false;

create index if not exists profiles_authorized_email_idx
  on public.profiles (lower(email), is_authorized);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_profile public.profiles%rowtype;
  profile_count integer;
begin
  select count(*) into profile_count from public.profiles;

  if profile_count = 0 then
    insert into public.profiles (id, name, email, role, is_authorized)
    values (
      new.id,
      coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
      coalesce(new.email, ''),
      'admin',
      true
    )
    on conflict (id) do update set
      name = excluded.name,
      email = excluded.email,
      is_authorized = true;
    return new;
  end if;

  -- Unknown accounts intentionally receive no profile row. The admin invite
  -- Edge Function creates the authorized profile after inviting the account.
  select * into existing_profile
  from public.profiles
  where id = new.id
  limit 1;

  if found then
    update public.profiles
    set name = coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', name),
        email = coalesce(new.email, email)
    where id = new.id;
  end if;

  return new;
end;
$$;
