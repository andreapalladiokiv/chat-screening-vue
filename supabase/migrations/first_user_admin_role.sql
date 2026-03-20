-- Replace the handle_new_user trigger function so that the very first
-- user to sign up is assigned the 'admin' role.  All subsequent
-- sign-ups continue to receive the default 'user' role.
--
-- Run this on any Supabase project where chat_view_user_roles is empty
-- and you need the first sign-in to become the admin automatically.

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  assigned_role text;
begin
  -- First user ever gets admin, everyone else gets user
  if not exists (select 1 from public.chat_view_user_roles limit 1) then
    assigned_role := 'admin';
  else
    assigned_role := 'user';
  end if;

  insert into public.chat_view_user_roles (user_id, role, email)
  values (new.id, assigned_role, coalesce(new.email, ''))
  on conflict (user_id) do nothing;
  return new;
end;
$$;
