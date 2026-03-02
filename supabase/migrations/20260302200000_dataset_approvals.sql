-- Dataset approval workflow: states, approvals, logs, and default approvers per data source.

-- 1. Add state column to datasets
alter table public.datasets
  add column if not exists state text not null default 'draft'
    check (state in ('draft', 'in_progress', 'pending_approval', 'approved', 'rejected', 'completed'));

create index if not exists datasets_state_idx on public.datasets (state);

-- 2. Dataset approvals
create table if not exists public.dataset_approvals (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references public.datasets (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  comment text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (dataset_id, user_id)
);

create index if not exists dataset_approvals_dataset_id_idx on public.dataset_approvals (dataset_id);
create index if not exists dataset_approvals_user_id_idx on public.dataset_approvals (user_id);

alter table public.dataset_approvals enable row level security;

create policy "Users can view approvals for accessible datasets"
  on public.dataset_approvals for select
  using (
    exists (
      select 1 from public.datasets d
      where d.id = dataset_id
        and (
          public.user_owns_schema(d.schema_id, auth.uid())
          or public.user_has_schema_grant(d.schema_id, auth.uid())
        )
    )
    or user_id = auth.uid()
  );

create policy "Users can insert approvals for accessible datasets"
  on public.dataset_approvals for insert
  with check (
    exists (
      select 1 from public.datasets d
      where d.id = dataset_id
        and (
          public.user_owns_schema(d.schema_id, auth.uid())
          or public.user_has_schema_grant(d.schema_id, auth.uid())
        )
    )
  );

create policy "Approvers can update own approval"
  on public.dataset_approvals for update
  using (user_id = auth.uid());

create policy "Dataset owners can delete approvals"
  on public.dataset_approvals for delete
  using (
    exists (
      select 1 from public.datasets d
      where d.id = dataset_id
        and (
          public.user_owns_schema(d.schema_id, auth.uid())
          or public.user_has_schema_grant(d.schema_id, auth.uid())
        )
    )
  );

-- 3. Dataset logs (audit trail for state changes)
create table if not exists public.dataset_logs (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references public.datasets (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  action text not null,
  from_state text,
  to_state text,
  comment text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists dataset_logs_dataset_id_idx on public.dataset_logs (dataset_id, created_at desc);

alter table public.dataset_logs enable row level security;

create policy "Users can view logs for accessible datasets"
  on public.dataset_logs for select
  using (
    exists (
      select 1 from public.datasets d
      where d.id = dataset_id
        and (
          public.user_owns_schema(d.schema_id, auth.uid())
          or public.user_has_schema_grant(d.schema_id, auth.uid())
        )
    )
    or user_id = auth.uid()
  );

create policy "Authenticated users can insert logs"
  on public.dataset_logs for insert
  with check (auth.uid() = user_id);

-- 4. Default approvers per data source
create table if not exists public.data_source_default_approvers (
  id uuid primary key default gen_random_uuid(),
  data_source_id uuid not null references public.data_sources (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (data_source_id, user_id)
);

create index if not exists ds_default_approvers_ds_idx on public.data_source_default_approvers (data_source_id);

alter table public.data_source_default_approvers enable row level security;

create policy "Data source owners can manage default approvers"
  on public.data_source_default_approvers for all
  using (
    exists (
      select 1 from public.data_sources ds
      where ds.id = data_source_id
        and ds.user_id = auth.uid()
    )
  );

create policy "Users can view default approvers for accessible data sources"
  on public.data_source_default_approvers for select
  using (true);
