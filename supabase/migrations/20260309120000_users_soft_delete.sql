-- Add soft delete support to public.users via a deleted_at timestamp column.
-- When deleted_at is non-null the user is considered deleted and login is blocked.

alter table public.users
  add column if not exists deleted_at timestamptz;

comment on column public.users.deleted_at is 'When non-null, the user is soft-deleted and cannot log in.';
