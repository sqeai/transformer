-- Re-point all user_id FKs from auth.users to public.users.
-- The original migrations referenced auth.users(id), but users can now be
-- created directly in public.users (without a corresponding auth.users row),
-- so all FK constraints must reference public.users instead.
--
-- Uses a helper to make ADD CONSTRAINT idempotent (safe if partially applied).

CREATE OR REPLACE FUNCTION _tmp_add_fk_if_missing(
  p_table text, p_constraint text, p_column text, p_ref_table text, p_ref_column text
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = p_constraint
      AND table_schema = 'public'
      AND table_name = p_table
  ) THEN
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.%I (%I) ON DELETE CASCADE',
      p_table, p_constraint, p_column, p_ref_table, p_ref_column
    );
  END IF;
END;
$$;

-- schemas
ALTER TABLE public.schemas DROP CONSTRAINT IF EXISTS schemas_user_id_fkey;
SELECT _tmp_add_fk_if_missing('schemas', 'schemas_user_id_fkey', 'user_id', 'users', 'id');

-- jobs
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_user_id_fkey;
SELECT _tmp_add_fk_if_missing('jobs', 'jobs_user_id_fkey', 'user_id', 'users', 'id');

-- schema_grants
ALTER TABLE public.schema_grants DROP CONSTRAINT IF EXISTS schema_grants_granted_to_user_id_fkey;
SELECT _tmp_add_fk_if_missing('schema_grants', 'schema_grants_granted_to_user_id_fkey', 'granted_to_user_id', 'users', 'id');

ALTER TABLE public.schema_grants DROP CONSTRAINT IF EXISTS schema_grants_granted_by_user_id_fkey;
SELECT _tmp_add_fk_if_missing('schema_grants', 'schema_grants_granted_by_user_id_fkey', 'granted_by_user_id', 'users', 'id');

-- files (was "sheets", renamed in earlier migration; FK name may still be sheets_user_id_fkey)
ALTER TABLE public.files DROP CONSTRAINT IF EXISTS sheets_user_id_fkey;
ALTER TABLE public.files DROP CONSTRAINT IF EXISTS files_user_id_fkey;
SELECT _tmp_add_fk_if_missing('files', 'files_user_id_fkey', 'user_id', 'users', 'id');

-- dataset_approvers (was "dataset_approvals"; FK name may still use old table name)
ALTER TABLE public.dataset_approvers DROP CONSTRAINT IF EXISTS dataset_approvals_user_id_fkey;
ALTER TABLE public.dataset_approvers DROP CONSTRAINT IF EXISTS dataset_approvers_user_id_fkey;
SELECT _tmp_add_fk_if_missing('dataset_approvers', 'dataset_approvers_user_id_fkey', 'user_id', 'users', 'id');

-- dataset_logs
ALTER TABLE public.dataset_logs DROP CONSTRAINT IF EXISTS dataset_logs_user_id_fkey;
SELECT _tmp_add_fk_if_missing('dataset_logs', 'dataset_logs_user_id_fkey', 'user_id', 'users', 'id');

-- data_source_default_approvers
ALTER TABLE public.data_source_default_approvers DROP CONSTRAINT IF EXISTS data_source_default_approvers_user_id_fkey;
SELECT _tmp_add_fk_if_missing('data_source_default_approvers', 'data_source_default_approvers_user_id_fkey', 'user_id', 'users', 'id');

-- data_sources (FK was previously dropped but never re-added to public.users)
ALTER TABLE public.data_sources DROP CONSTRAINT IF EXISTS data_sources_user_id_fkey;
SELECT _tmp_add_fk_if_missing('data_sources', 'data_sources_user_id_fkey', 'user_id', 'users', 'id');

-- Clean up temp function
DROP FUNCTION _tmp_add_fk_if_missing;
