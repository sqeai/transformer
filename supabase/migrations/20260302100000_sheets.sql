create table if not exists public.sheets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  storage_url text not null,
  name text not null,
  dimensions jsonb not null default '{}'::jsonb,
  type text not null check (type in ('raw', 'processed', 'intermediary')),
  version_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists sheets_storage_url_unique on public.sheets (storage_url);
create index if not exists sheets_user_id_idx on public.sheets (user_id);
create index if not exists sheets_type_idx on public.sheets (type);

drop trigger if exists sheets_set_updated_at on public.sheets;
create trigger sheets_set_updated_at
before update on public.sheets
for each row execute function public.set_updated_at_timestamp();

alter table public.sheets enable row level security;

create policy "Users can view own sheets"
  on public.sheets for select
  using (auth.uid() = user_id);

create policy "Users can insert own sheets"
  on public.sheets for insert
  with check (auth.uid() = user_id);

create policy "Users can update own sheets"
  on public.sheets for update
  using (auth.uid() = user_id);

comment on table public.sheets is 'Tracks raw/processed/intermediary sheet CSV files stored in S3.';
comment on column public.sheets.storage_url is 'S3 object location represented as bucket/key.';
comment on column public.sheets.dimensions is 'JSON object with table shape metadata such as rowCount and columnCount.';
