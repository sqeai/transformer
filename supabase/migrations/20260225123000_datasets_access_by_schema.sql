-- Datasets inherit access from their parent schema.
-- Remove dataset-level ownership and authorize via schema ownership/grants instead.

drop policy if exists "Users can view own datasets" on public.datasets;
drop policy if exists "Users can insert own datasets" on public.datasets;
drop policy if exists "Users can update own datasets" on public.datasets;
drop policy if exists "Users can delete own datasets" on public.datasets;

drop policy if exists "Users can view datasets for accessible schemas" on public.datasets;
drop policy if exists "Users can insert datasets for accessible schemas" on public.datasets;
drop policy if exists "Users can update datasets for accessible schemas" on public.datasets;
drop policy if exists "Users can delete datasets for accessible schemas" on public.datasets;

drop index if exists public.datasets_user_id_idx;
alter table public.datasets drop column if exists user_id;

create policy "Users can view datasets for accessible schemas"
  on public.datasets for select
  using (
    public.user_owns_schema(schema_id, auth.uid())
    or public.user_has_schema_grant(schema_id, auth.uid())
  );

create policy "Users can insert datasets for accessible schemas"
  on public.datasets for insert
  with check (
    public.user_owns_schema(schema_id, auth.uid())
    or public.user_has_schema_grant(schema_id, auth.uid())
  );

create policy "Users can update datasets for accessible schemas"
  on public.datasets for update
  using (
    public.user_owns_schema(schema_id, auth.uid())
    or public.user_has_schema_grant(schema_id, auth.uid())
  )
  with check (
    public.user_owns_schema(schema_id, auth.uid())
    or public.user_has_schema_grant(schema_id, auth.uid())
  );

create policy "Users can delete datasets for accessible schemas"
  on public.datasets for delete
  using (
    public.user_owns_schema(schema_id, auth.uid())
    or public.user_has_schema_grant(schema_id, auth.uid())
  );
