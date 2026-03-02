-- Remove "in_progress" state; datasets go directly from draft -> pending_approval.
-- Also allow approvers to view datasets they are assigned to (any state).

-- 1. Update any existing in_progress datasets back to draft
update public.datasets set state = 'draft' where state = 'in_progress';

-- 2. Replace the check constraint to remove in_progress
alter table public.datasets drop constraint if exists datasets_state_check;
alter table public.datasets
  add constraint datasets_state_check
    check (state in ('draft', 'pending_approval', 'approved', 'rejected', 'completed'));

-- 3. Allow approvers to view datasets they are assigned to (any state)
drop policy if exists "Users can view datasets for accessible schemas" on public.datasets;

create policy "Users can view datasets for accessible schemas"
  on public.datasets for select
  using (
    public.user_owns_schema(schema_id, auth.uid())
    or public.user_has_schema_grant(schema_id, auth.uid())
    or exists (
      select 1 from public.dataset_approvals da
      where da.dataset_id = id
        and da.user_id = auth.uid()
    )
  );
