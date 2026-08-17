revoke execute on function public.create_sale(jsonb, boolean, text, text, boolean) from anon, public;
grant execute on function public.create_sale(jsonb, boolean, text, text, boolean) to authenticated;

revoke execute on function public.pay_credit(text) from anon, public;
grant execute on function public.pay_credit(text) to authenticated;

revoke execute on function public.handle_new_user() from anon, authenticated, public;
revoke execute on function public.is_admin() from anon, authenticated, public;
