-- Only the first account becomes admin automatically.
-- Later Google accounts must be created through the admin's Employee Accounts invite flow.
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
    insert into public.profiles (id, name, email, role)
    values (
      new.id,
      coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
      coalesce(new.email, ''),
      'admin'
    )
    on conflict (id) do update set
      name = excluded.name,
      email = excluded.email;
    return new;
  end if;

  -- A non-first account is accepted only when an administrator's invite flow
  -- has already created a matching profile, or when that flow is about to
  -- upsert the profile immediately after creating the auth user.
  select * into existing_profile
  from public.profiles
  where lower(email) = lower(coalesce(new.email, ''))
  limit 1;

  if found then
    if existing_profile.id = new.id then
      update public.profiles
      set name = coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', name),
          email = coalesce(new.email, email)
      where id = new.id;
    end if;
  end if;

  return new;
end;
$$;
