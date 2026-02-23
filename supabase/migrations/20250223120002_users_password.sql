-- Add password to public.users (optional; Supabase Auth uses auth.users for login).
-- Use this column only if you need to mirror or store a hash in app schema; normal login uses auth.users.

alter table public.users
  add column if not exists password text;

comment on column public.users.password is 'Optional app-level password hash; Supabase Auth (auth.users) is the source of truth for sign-in.';
