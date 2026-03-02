-- Fix circular RLS dependency between datasets and dataset_approvals.
-- The datasets SELECT policy queries dataset_approvals, whose SELECT policy
-- queries datasets → infinite recursion → zero rows returned.
-- Solution: SECURITY DEFINER helper that bypasses RLS on dataset_approvals.

create or replace function public.user_is_dataset_approver(p_dataset_id uuid, p_user_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.dataset_approvals
    where dataset_id = p_dataset_id and user_id = p_user_id
  );
$$;

-- Recreate the datasets SELECT policy using the helper
drop policy if exists "Users can view datasets for accessible schemas" on public.datasets;

create policy "Users can view datasets for accessible schemas"
  on public.datasets for select
  using (
    public.user_owns_schema(schema_id, auth.uid())
    or public.user_has_schema_grant(schema_id, auth.uid())
    or public.user_is_dataset_approver(id, auth.uid())
  );
