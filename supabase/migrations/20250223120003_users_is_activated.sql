-- Add is_activated to public.users. New signups get is_activated = false; login only allowed when true.

alter table public.users
  add column if not exists is_activated boolean not null default false;

comment on column public.users.is_activated is 'When false, login is blocked until an admin (or activation flow) sets it to true.';

-- Ensure new users created by the trigger get is_activated = false (default handles it; make trigger explicit)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, email, full_name, avatar_url, is_activated, updated_at)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url',
    false,
    now()
  );
  return new;
end;
$$;
