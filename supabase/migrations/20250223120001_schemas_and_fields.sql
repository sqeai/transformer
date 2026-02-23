-- Final schemas and schema_fields: stores user-created schemas (target data schemas) and their field trees.
-- Matches app types: FinalSchema { id, name, fields: SchemaField[], createdAt }
-- SchemaField: tree of { id, name, path, level, order, description?, defaultValue?, children } stored as flat rows with parent_id.

create table if not exists public.schemas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  constraint schemas_name_user_unique unique (user_id, name)
);

create index schemas_user_id_idx on public.schemas (user_id);

create table if not exists public.schema_fields (
  id uuid primary key default gen_random_uuid(),
  schema_id uuid not null references public.schemas (id) on delete cascade,
  name text not null,
  path text not null,
  level int not null default 0,
  "order" int not null default 0,
  description text,
  default_value text,
  parent_id uuid references public.schema_fields (id) on delete cascade,
  constraint schema_fields_schema_path_unique unique (schema_id, path)
);

create index schema_fields_schema_id_idx on public.schema_fields (schema_id);
create index schema_fields_parent_id_idx on public.schema_fields (parent_id);

-- RLS: users can only access their own schemas and the fields of those schemas
alter table public.schemas enable row level security;
alter table public.schema_fields enable row level security;

create policy "Users can view own schemas"
  on public.schemas for select
  using (auth.uid() = user_id);

create policy "Users can insert own schemas"
  on public.schemas for insert
  with check (auth.uid() = user_id);

create policy "Users can update own schemas"
  on public.schemas for update
  using (auth.uid() = user_id);

create policy "Users can delete own schemas"
  on public.schemas for delete
  using (auth.uid() = user_id);

-- schema_fields: access only via owning schema
create policy "Users can view fields of own schemas"
  on public.schema_fields for select
  using (
    exists (
      select 1 from public.schemas s
      where s.id = schema_fields.schema_id and s.user_id = auth.uid()
    )
  );

create policy "Users can insert fields in own schemas"
  on public.schema_fields for insert
  with check (
    exists (
      select 1 from public.schemas s
      where s.id = schema_id and s.user_id = auth.uid()
    )
  );

create policy "Users can update fields in own schemas"
  on public.schema_fields for update
  using (
    exists (
      select 1 from public.schemas s
      where s.id = schema_fields.schema_id and s.user_id = auth.uid()
    )
  );

create policy "Users can delete fields in own schemas"
  on public.schema_fields for delete
  using (
    exists (
      select 1 from public.schemas s
      where s.id = schema_fields.schema_id and s.user_id = auth.uid()
    )
  );

comment on table public.schemas is 'User-created target data schemas (FinalSchema).';
comment on table public.schema_fields is 'Fields of a schema (SchemaField tree stored flat with parent_id).';
