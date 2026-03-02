-- Data sources: external database connections (BigQuery, MySQL, etc.)
create table public.data_sources (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  type        text not null check (type in ('bigquery', 'mysql', 'postgres', 'redshift')),
  config      jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.data_sources enable row level security;

create policy "Users can view own data sources"
  on public.data_sources for select
  using (auth.uid() = user_id);

create policy "Users can insert own data sources"
  on public.data_sources for insert
  with check (auth.uid() = user_id);

create policy "Users can update own data sources"
  on public.data_sources for update
  using (auth.uid() = user_id);

create policy "Users can delete own data sources"
  on public.data_sources for delete
  using (auth.uid() = user_id);
