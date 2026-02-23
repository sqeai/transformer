-- Role-based access: schema_grants allows schema owners to grant view access to other users.
-- Users can see a schema if they own it (user_id) or have a row in schema_grants.

create table if not exists public.schema_grants (
  id uuid primary key default gen_random_uuid(),
  schema_id uuid not null references public.schemas (id) on delete cascade,
  granted_to_user_id uuid not null references auth.users (id) on delete cascade,
  granted_by_user_id uuid not null references auth.users (id) on delete cascade,
  granted_at timestamptz not null default now(),
  constraint schema_grants_schema_grantee_unique unique (schema_id, granted_to_user_id)
);

create index schema_grants_schema_id_idx on public.schema_grants (schema_id);
create index schema_grants_granted_to_user_id_idx on public.schema_grants (granted_to_user_id);

alter table public.schema_grants enable row level security;

-- Only schema owner can manage grants (insert/delete) for their schema
create policy "Schema owner can add grants"
  on public.schema_grants for insert
  with check (
    exists (
      select 1 from public.schemas s
      where s.id = schema_id and s.user_id = auth.uid()
    )
    and granted_by_user_id = auth.uid()
  );

create policy "Schema owner can revoke grants"
  on public.schema_grants for delete
  using (
    exists (
      select 1 from public.schemas s
      where s.id = schema_id and s.user_id = auth.uid()
    )
  );

-- Grant recipients can read their own grants (to know they have access)
create policy "Users can view grants for schemas they own or are granted"
  on public.schema_grants for select
  using (
    granted_to_user_id = auth.uid()
    or exists (
      select 1 from public.schemas s
      where s.id = schema_id and s.user_id = auth.uid()
    )
  );

comment on table public.schema_grants is 'Grants view access to a schema to users other than the owner.';

-- Drop existing "view own schemas" and replace with "view own or granted"
drop policy if exists "Users can view own schemas" on public.schemas;

create policy "Users can view own or granted schemas"
  on public.schemas for select
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.schema_grants g
      where g.schema_id = schemas.id and g.granted_to_user_id = auth.uid()
    )
  );

-- schema_fields: allow view if user can view the schema (owner or granted)
drop policy if exists "Users can view fields of own schemas" on public.schema_fields;

create policy "Users can view fields of accessible schemas"
  on public.schema_fields for select
  using (
    exists (
      select 1 from public.schemas s
      where s.id = schema_fields.schema_id
      and (
        s.user_id = auth.uid()
        or exists (
          select 1 from public.schema_grants g
          where g.schema_id = s.id and g.granted_to_user_id = auth.uid()
        )
      )
    )
  );

-- Insert/update/delete on schema_fields remain owner-only (no change to existing policies)

-- Function: grant schema access by grantee email (callable by schema owner only).
-- Uses SECURITY DEFINER so we can read public.users to resolve email -> id.
create or replace function public.grant_schema_access(p_schema_id uuid, p_grantee_email text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_owner_id uuid;
  v_grantee_id uuid;
  v_grantee_email text;
begin
  select user_id into v_owner_id from public.schemas where id = p_schema_id;
  if v_owner_id is null then
    return jsonb_build_object('ok', false, 'error', 'Schema not found');
  end if;
  if v_owner_id != auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'Forbidden');
  end if;

  p_grantee_email := nullif(trim(lower(p_grantee_email)), '');
  if p_grantee_email is null then
    return jsonb_build_object('ok', false, 'error', 'Email is required');
  end if;

  select id, email into v_grantee_id, v_grantee_email
  from public.users
  where lower(email) = p_grantee_email;

  if v_grantee_id is null then
    return jsonb_build_object('ok', false, 'error', 'User not found with that email');
  end if;
  if v_grantee_id = v_owner_id then
    return jsonb_build_object('ok', false, 'error', 'Cannot grant access to yourself');
  end if;

  insert into public.schema_grants (schema_id, granted_to_user_id, granted_by_user_id)
  values (p_schema_id, v_grantee_id, auth.uid())
  on conflict (schema_id, granted_to_user_id) do nothing;

  return jsonb_build_object('ok', true, 'granted_to_user_id', v_grantee_id, 'email', v_grantee_email);
end;
$$;

comment on function public.grant_schema_access is 'Grant view access to a schema by grantee email. Callable only by schema owner.';

-- Allow reading creator (id, email, full_name) for users who own a schema the current user can access
create policy "Users can view creators of accessible schemas"
  on public.users for select
  using (
    id = auth.uid()
    or exists (
      select 1 from public.schemas s
      where s.user_id = users.id
      and (
        s.user_id = auth.uid()
        or exists (
          select 1 from public.schema_grants g
          where g.schema_id = s.id and g.granted_to_user_id = auth.uid()
        )
      )
    )
  );

-- Allow schema owners to view grantees' profiles (for listing who has access)
create policy "Users can view grantees of their schemas"
  on public.users for select
  using (
    exists (
      select 1 from public.schema_grants g
      join public.schemas s on s.id = g.schema_id
      where g.granted_to_user_id = users.id and s.user_id = auth.uid()
    )
  );
