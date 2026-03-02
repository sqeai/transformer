-- Fix: approvers without schema access cannot see datasets or co-approver profiles.
-- 1. Add a SECURITY DEFINER helper to check if two users share a dataset approval.
-- 2. Add a users SELECT policy so approvers can see co-approvers.
-- 3. Update dataset_approvals and dataset_logs SELECT policies to also grant
--    access when the viewer is an approver on the same dataset.

-- Helper: are these two users both approvers on the same dataset?
create or replace function public.users_share_dataset_approval(p_target_user_id uuid, p_viewer_user_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1
    from public.dataset_approvals a1
    join public.dataset_approvals a2 on a1.dataset_id = a2.dataset_id
    where a1.user_id = p_target_user_id
      and a2.user_id = p_viewer_user_id
  );
$$;

-- Users can see co-approvers
create policy "Users can view co-approvers"
  on public.users for select
  using (
    public.users_share_dataset_approval(id, auth.uid())
  );

-- Recreate dataset_approvals SELECT policy: also allow approvers on the same dataset
drop policy if exists "Users can view approvals for accessible datasets" on public.dataset_approvals;

create policy "Users can view approvals for accessible datasets"
  on public.dataset_approvals for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.datasets d
      where d.id = dataset_id
        and (
          public.user_owns_schema(d.schema_id, auth.uid())
          or public.user_has_schema_grant(d.schema_id, auth.uid())
        )
    )
    or public.user_is_dataset_approver(dataset_id, auth.uid())
  );

-- Recreate dataset_logs SELECT policy: also allow approvers on the dataset
drop policy if exists "Users can view logs for accessible datasets" on public.dataset_logs;

create policy "Users can view logs for accessible datasets"
  on public.dataset_logs for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.datasets d
      where d.id = dataset_id
        and (
          public.user_owns_schema(d.schema_id, auth.uid())
          or public.user_has_schema_grant(d.schema_id, auth.uid())
        )
    )
    or public.user_is_dataset_approver(dataset_id, auth.uid())
  );
