-- Fix infinite recursion between schemas ↔ schema_grants ↔ users RLS policies.
-- The root cause: policies on schemas query schema_grants, whose policies query schemas → loop.
-- Solution: SECURITY DEFINER helper functions that bypass RLS when checking grants.

-- Helper: does user have a grant for this schema? Bypasses RLS on schema_grants.
create or replace function public.user_has_schema_grant(p_schema_id uuid, p_user_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.schema_grants
    where schema_id = p_schema_id and granted_to_user_id = p_user_id
  );
$$;

-- Helper: does user own the schema that this grant belongs to? Bypasses RLS on schemas.
create or replace function public.user_owns_schema(p_schema_id uuid, p_user_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.schemas
    where id = p_schema_id and user_id = p_user_id
  );
$$;

-- Helper: is the user a grantee of any schema owned by the current user?
-- (for reading grantee profiles)
create or replace function public.is_grantee_of_my_schema(p_grantee_user_id uuid, p_owner_user_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.schema_grants g
    join public.schemas s on s.id = g.schema_id
    where g.granted_to_user_id = p_grantee_user_id and s.user_id = p_owner_user_id
  );
$$;

-- Helper: does the user own a schema that is accessible to the current user?
-- (for reading creator profiles)
create or replace function public.user_owns_accessible_schema(p_owner_id uuid, p_viewer_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.schemas s
    where s.user_id = p_owner_id
    and (
      s.user_id = p_viewer_id
      or exists (
        select 1 from public.schema_grants g
        where g.schema_id = s.id and g.granted_to_user_id = p_viewer_id
      )
    )
  );
$$;

----------------------------------------------------------------------
-- Replace schemas SELECT policy
----------------------------------------------------------------------
drop policy if exists "Users can view own or granted schemas" on public.schemas;

create policy "Users can view own or granted schemas"
  on public.schemas for select
  using (
    auth.uid() = user_id
    or public.user_has_schema_grant(id, auth.uid())
  );

----------------------------------------------------------------------
-- Replace schema_fields SELECT policy
----------------------------------------------------------------------
drop policy if exists "Users can view fields of accessible schemas" on public.schema_fields;

create policy "Users can view fields of accessible schemas"
  on public.schema_fields for select
  using (
    public.user_owns_schema(schema_id, auth.uid())
    or public.user_has_schema_grant(schema_id, auth.uid())
  );

----------------------------------------------------------------------
-- Replace schema_grants SELECT policy
----------------------------------------------------------------------
drop policy if exists "Users can view grants for schemas they own or are granted" on public.schema_grants;

create policy "Users can view grants for schemas they own or are granted"
  on public.schema_grants for select
  using (
    granted_to_user_id = auth.uid()
    or public.user_owns_schema(schema_id, auth.uid())
  );

----------------------------------------------------------------------
-- Replace schema_grants INSERT policy
----------------------------------------------------------------------
drop policy if exists "Schema owner can add grants" on public.schema_grants;

create policy "Schema owner can add grants"
  on public.schema_grants for insert
  with check (
    public.user_owns_schema(schema_id, auth.uid())
    and granted_by_user_id = auth.uid()
  );

----------------------------------------------------------------------
-- Replace schema_grants DELETE policy
----------------------------------------------------------------------
drop policy if exists "Schema owner can revoke grants" on public.schema_grants;

create policy "Schema owner can revoke grants"
  on public.schema_grants for delete
  using (
    public.user_owns_schema(schema_id, auth.uid())
  );

----------------------------------------------------------------------
-- Replace users SELECT policies (the new ones from the previous migration)
----------------------------------------------------------------------
drop policy if exists "Users can view creators of accessible schemas" on public.users;
drop policy if exists "Users can view grantees of their schemas" on public.users;

create policy "Users can view creators of accessible schemas"
  on public.users for select
  using (
    id = auth.uid()
    or public.user_owns_accessible_schema(id, auth.uid())
  );

create policy "Users can view grantees of their schemas"
  on public.users for select
  using (
    public.is_grantee_of_my_schema(id, auth.uid())
  );
