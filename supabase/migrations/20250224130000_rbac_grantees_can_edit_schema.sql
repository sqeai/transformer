-- RBAC: non-creators (grantees) can edit the schema (update name and fields) but not delete.
-- Keep delete on schemas owner-only. Allow update on schemas and insert/update/delete on
-- schema_fields for both owner and grantees (using existing SECURITY DEFINER helpers).

-- Schemas: allow update if owner or has grant; leave delete as owner-only.
drop policy if exists "Users can update own schemas" on public.schemas;

create policy "Users can update own or granted schemas"
  on public.schemas for update
  using (
    public.user_owns_schema(id, auth.uid())
    or public.user_has_schema_grant(id, auth.uid())
  );

-- schema_fields: allow insert/update/delete if user can access the schema (owner or granted).
drop policy if exists "Users can insert fields in own schemas" on public.schema_fields;

create policy "Users can insert fields in accessible schemas"
  on public.schema_fields for insert
  with check (
    public.user_owns_schema(schema_id, auth.uid())
    or public.user_has_schema_grant(schema_id, auth.uid())
  );

drop policy if exists "Users can update fields in own schemas" on public.schema_fields;

create policy "Users can update fields in accessible schemas"
  on public.schema_fields for update
  using (
    public.user_owns_schema(schema_id, auth.uid())
    or public.user_has_schema_grant(schema_id, auth.uid())
  );

drop policy if exists "Users can delete fields in own schemas" on public.schema_fields;

create policy "Users can delete fields in accessible schemas"
  on public.schema_fields for delete
  using (
    public.user_owns_schema(schema_id, auth.uid())
    or public.user_has_schema_grant(schema_id, auth.uid())
  );
