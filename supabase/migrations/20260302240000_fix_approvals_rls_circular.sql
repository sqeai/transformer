-- Fix circular RLS between dataset_approvals/dataset_logs and datasets.
-- The approvals/logs SELECT policies query datasets, whose RLS queries
-- dataset_approvals → circular. Replace with a SECURITY DEFINER helper
-- that checks schema access for a dataset without going through datasets RLS.

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

-- Recreate dataset_approvals SELECT policy using the helper
drop policy if exists "Users can view approvals for accessible datasets" on public.dataset_approvals;

create policy "Users can view approvals for accessible datasets"
  on public.dataset_approvals for select
  using (
    user_id = auth.uid()
    or public.user_has_dataset_access(dataset_id, auth.uid())
    or public.user_is_dataset_approver(dataset_id, auth.uid())
  );

-- Recreate dataset_logs SELECT policy using the helper
drop policy if exists "Users can view logs for accessible datasets" on public.dataset_logs;

create policy "Users can view logs for accessible datasets"
  on public.dataset_logs for select
  using (
    user_id = auth.uid()
    or public.user_has_dataset_access(dataset_id, auth.uid())
    or public.user_is_dataset_approver(dataset_id, auth.uid())
  );

-- Also fix the INSERT policy on dataset_approvals (same circular issue)
drop policy if exists "Users can insert approvals for accessible datasets" on public.dataset_approvals;

create policy "Users can insert approvals for accessible datasets"
  on public.dataset_approvals for insert
  with check (
    public.user_has_dataset_access(dataset_id, auth.uid())
  );

-- Also fix the DELETE policy on dataset_approvals
drop policy if exists "Dataset owners can delete approvals" on public.dataset_approvals;

create policy "Dataset owners can delete approvals"
  on public.dataset_approvals for delete
  using (
    public.user_has_dataset_access(dataset_id, auth.uid())
  );
