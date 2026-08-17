-- RLS policies call is_admin() as the authenticated user.
-- Keep it unavailable to anonymous/public callers while allowing the
-- authenticated role to evaluate policies safely through SECURITY DEFINER.
grant execute on function public.is_admin() to authenticated;
revoke execute on function public.is_admin() from anon, public;
