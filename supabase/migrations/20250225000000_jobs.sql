-- Jobs table: stores async AI Data Cleanser agent jobs for unstructured data extraction.
-- Each job represents one sheet extraction task that runs with max_concurrency limit.

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null,
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed')),
  payload jsonb not null,
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create index jobs_user_id_idx on public.jobs (user_id);
create index jobs_status_idx on public.jobs (status) where status = 'pending';
create index jobs_created_at_idx on public.jobs (created_at);

-- RLS: users can only see and insert their own jobs
alter table public.jobs enable row level security;

create policy "Users can view own jobs"
  on public.jobs for select
  using (auth.uid() = user_id);

create policy "Users can insert own jobs"
  on public.jobs for insert
  with check (auth.uid() = user_id);

-- Note: Updates (status, result, error) are done by the processor route using service-role client,
-- which bypasses RLS. This is intentional so the processor can update any user's job.

comment on table public.jobs is 'Async jobs for AI Data Cleanser agent (e.g. extract_unstructured).';
comment on column public.jobs.type is 'Job type, e.g. "extract_unstructured".';
comment on column public.jobs.status is 'Job status: pending, running, completed, or failed.';
comment on column public.jobs.payload is 'Input data for the job (e.g. { sheetText, targetPaths }).';
comment on column public.jobs.result is 'Output data from successful job (e.g. { record, mapping }).';
comment on column public.jobs.error is 'Error message if job failed.';
