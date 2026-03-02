-- Drop all RLS policies on dataset_approvals and disable RLS.
-- API routes now use the admin client for these tables, so RLS is unnecessary
-- and was causing circular dependency issues.

-- 1. Drop all dataset_approvals policies
drop policy if exists "Users can view approvals for accessible datasets" on public.dataset_approvals;
drop policy if exists "Users can insert approvals for accessible datasets" on public.dataset_approvals;
drop policy if exists "Approvers can update own approval" on public.dataset_approvals;
drop policy if exists "Dataset owners can delete approvals" on public.dataset_approvals;

alter table public.dataset_approvals disable row level security;

-- 2. Drop the co-approver visibility policy on users
drop policy if exists "Users can view co-approvers" on public.users;

-- 3. Drop dataset_logs RLS policies and disable RLS (also accessed via admin client)
drop policy if exists "Users can view logs for accessible datasets" on public.dataset_logs;
drop policy if exists "Authenticated users can insert logs" on public.dataset_logs;

alter table public.dataset_logs disable row level security;

-- 4. Restore the datasets SELECT policy to its original form (without approver check)
drop policy if exists "Users can view datasets for accessible schemas" on public.datasets;

create policy "Users can view datasets for accessible schemas"
  on public.datasets for select
  using (
    public.user_owns_schema(schema_id, auth.uid())
    or public.user_has_schema_grant(schema_id, auth.uid())
  );

-- 5. Drop the now-unused helper functions
drop function if exists public.user_has_dataset_access(uuid, uuid);
drop function if exists public.users_share_dataset_approval(uuid, uuid);
drop function if exists public.user_is_dataset_approver(uuid, uuid);
