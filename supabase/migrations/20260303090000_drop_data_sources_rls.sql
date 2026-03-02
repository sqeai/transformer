-- Remove RLS on data_sources so all authenticated users can access all rows.
drop policy if exists "Users can view own data sources" on public.data_sources;
drop policy if exists "Users can insert own data sources" on public.data_sources;
drop policy if exists "Users can update own data sources" on public.data_sources;
drop policy if exists "Users can delete own data sources" on public.data_sources;

alter table public.data_sources disable row level security;
