-- Rename dataset_approvals -> dataset_approvers and restore RLS.
-- Each approver row represents a user assigned to review a dataset,
-- with their own status (pending / approved / rejected).

-- 1. Drop old helper functions (from previous migrations)
drop function if exists public.user_has_dataset_access(uuid, uuid);
drop function if exists public.users_share_dataset_approval(uuid, uuid);
drop function if exists public.user_is_dataset_approver(uuid, uuid);

-- 2. Rename the table and its indexes
alter table if exists public.dataset_approvals rename to dataset_approvers;

alter index if exists dataset_approvals_dataset_id_idx rename to dataset_approvers_dataset_id_idx;
alter index if exists dataset_approvals_user_id_idx rename to dataset_approvers_user_id_idx;

-- 3. Recreate SECURITY DEFINER helper for datasets RLS
--    (bypasses RLS on dataset_approvers to avoid circular dependency)
create or replace function public.user_is_dataset_approver(p_dataset_id uuid, p_user_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.dataset_approvers
    where dataset_id = p_dataset_id and user_id = p_user_id
  );
$$;

-- Helper: check if viewer has schema-level access to a dataset (bypasses datasets RLS)
create or replace function public.user_has_dataset_access(p_dataset_id uuid, p_user_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.datasets d
    where d.id = p_dataset_id
      and (
        public.user_owns_schema(d.schema_id, p_user_id)
        or public.user_has_schema_grant(d.schema_id, p_user_id)
      )
  );
$$;

-- 4. Enable RLS on dataset_approvers
alter table public.dataset_approvers enable row level security;

-- SELECT: approver can see own rows, schema owners/grantees, or co-approvers
create policy "Users can view approvers for accessible datasets"
  on public.dataset_approvers for select
  using (
    user_id = auth.uid()
    or public.user_has_dataset_access(dataset_id, auth.uid())
    or public.user_is_dataset_approver(dataset_id, auth.uid())
  );

-- INSERT: only schema owners/grantees can add approvers
create policy "Users can insert approvers for accessible datasets"
  on public.dataset_approvers for insert
  with check (
    public.user_has_dataset_access(dataset_id, auth.uid())
  );

-- UPDATE: approvers can update their own row (submit decision)
create policy "Approvers can update own row"
  on public.dataset_approvers for update
  using (user_id = auth.uid());

-- DELETE: schema owners/grantees can remove approvers
create policy "Dataset owners can delete approvers"
  on public.dataset_approvers for delete
  using (
    public.user_has_dataset_access(dataset_id, auth.uid())
  );

-- 5. Restore RLS on dataset_logs
alter table public.dataset_logs enable row level security;

create policy "Users can view logs for accessible datasets"
  on public.dataset_logs for select
  using (
    user_id = auth.uid()
    or public.user_has_dataset_access(dataset_id, auth.uid())
    or public.user_is_dataset_approver(dataset_id, auth.uid())
  );

create policy "Authenticated users can insert logs"
  on public.dataset_logs for insert
  with check (auth.uid() = user_id);

-- 6. Update datasets SELECT policy to include approver check
drop policy if exists "Users can view datasets for accessible schemas" on public.datasets;

create policy "Users can view datasets for accessible schemas"
  on public.datasets for select
  using (
    public.user_owns_schema(schema_id, auth.uid())
    or public.user_has_schema_grant(schema_id, auth.uid())
    or public.user_is_dataset_approver(id, auth.uid())
  );

-- 7. Drop the old co-approver users policy (if it exists) and re-add
drop policy if exists "Users can view co-approvers" on public.users;
