-- Datasets are the end-product of a transformation run.
-- Each dataset belongs to a schema and stores transformed rows + mapping snapshot.

alter table public.schemas
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.datasets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  schema_id uuid not null references public.schemas (id) on delete cascade,
  name text not null,
  mapping_snapshot jsonb not null default '{}'::jsonb,
  rows jsonb not null default '[]'::jsonb,
  row_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists datasets_user_id_idx on public.datasets (user_id);
create index if not exists datasets_schema_id_idx on public.datasets (schema_id);
create index if not exists datasets_schema_created_at_idx on public.datasets (schema_id, created_at desc);

create or replace function public.set_updated_at_timestamp()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists schemas_set_updated_at on public.schemas;
create trigger schemas_set_updated_at
before update on public.schemas
for each row execute function public.set_updated_at_timestamp();

drop trigger if exists datasets_set_updated_at on public.datasets;
create trigger datasets_set_updated_at
before update on public.datasets
for each row execute function public.set_updated_at_timestamp();

alter table public.datasets enable row level security;

create policy "Users can view own datasets"
  on public.datasets for select
  using (auth.uid() = user_id);

create policy "Users can insert own datasets"
  on public.datasets for insert
  with check (auth.uid() = user_id);

create policy "Users can update own datasets"
  on public.datasets for update
  using (auth.uid() = user_id);

create policy "Users can delete own datasets"
  on public.datasets for delete
  using (auth.uid() = user_id);

comment on table public.datasets is 'Saved transformation outputs (datasets) with mapping snapshot and transformed rows.';
