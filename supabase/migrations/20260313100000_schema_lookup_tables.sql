-- Lookup tables attached to schemas: each table has dimension columns (keys)
-- and value columns (outputs). Rows are stored as JSONB.

create table if not exists public.schema_lookup_tables (
  id uuid primary key default gen_random_uuid(),
  schema_id uuid not null references public.schemas (id) on delete cascade,
  name text not null,
  dimensions text[] not null default '{}',
  "values" text[] not null default '{}',
  rows jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index schema_lookup_tables_schema_id_idx on public.schema_lookup_tables (schema_id);

alter table public.schema_lookup_tables enable row level security;

-- RLS: access through owning schema (owner or grantee)
create policy "Users can view lookup tables of accessible schemas"
  on public.schema_lookup_tables for select
  using (
    public.user_owns_schema(schema_id, auth.uid())
    or public.user_has_schema_grant(schema_id, auth.uid())
  );

create policy "Users can insert lookup tables in accessible schemas"
  on public.schema_lookup_tables for insert
  with check (
    public.user_owns_schema(schema_id, auth.uid())
    or public.user_has_schema_grant(schema_id, auth.uid())
  );

create policy "Users can update lookup tables in accessible schemas"
  on public.schema_lookup_tables for update
  using (
    public.user_owns_schema(schema_id, auth.uid())
    or public.user_has_schema_grant(schema_id, auth.uid())
  );

create policy "Users can delete lookup tables from accessible schemas"
  on public.schema_lookup_tables for delete
  using (
    public.user_owns_schema(schema_id, auth.uid())
    or public.user_has_schema_grant(schema_id, auth.uid())
  );

comment on table public.schema_lookup_tables is 'Lookup tables for schema-driven value mapping. Dimensions are match keys, values are outputs.';
