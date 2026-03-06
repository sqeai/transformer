-- ============================================================================
-- Data Migration: Move existing resources into default folders
-- For each user who owns schemas or data sources, create a "Default" folder,
-- assign them as owner, and move their resources into that folder.
-- ============================================================================

DO $$
DECLARE
  r RECORD;
  new_folder_id UUID;
BEGIN
  -- Find all users who have schemas or data sources
  FOR r IN
    SELECT DISTINCT u.id AS user_id
    FROM public.users u
    WHERE EXISTS (SELECT 1 FROM public.schemas s WHERE s.user_id = u.id)
       OR EXISTS (SELECT 1 FROM public.data_sources ds WHERE ds.user_id = u.id)
  LOOP
    -- Create a "Default" folder for this user
    INSERT INTO public.folders (name, parent_id, created_by)
    VALUES ('Default', NULL, r.user_id)
    RETURNING id INTO new_folder_id;

    -- Make the user an owner of this folder
    INSERT INTO public.folder_members (folder_id, user_id, role, granted_by)
    VALUES (new_folder_id, r.user_id, 'owner'::folder_role, r.user_id);

    -- Create an empty context for the folder
    INSERT INTO public.folder_contexts (folder_id, content, updated_by)
    VALUES (new_folder_id, '', r.user_id);

    -- Move their schemas into the folder
    UPDATE public.schemas
    SET folder_id = new_folder_id
    WHERE user_id = r.user_id AND folder_id IS NULL;

    -- Move their data sources into the folder
    UPDATE public.data_sources
    SET folder_id = new_folder_id
    WHERE user_id = r.user_id AND folder_id IS NULL;

    -- Move datasets that belong to their schemas into the folder
    UPDATE public.datasets d
    SET folder_id = new_folder_id
    WHERE d.folder_id IS NULL
      AND EXISTS (
        SELECT 1 FROM public.schemas s
        WHERE s.id = d.schema_id AND s.user_id = r.user_id
      );

    -- Also create folder_data_connections for their data sources
    INSERT INTO public.folder_data_connections (folder_id, data_source_id)
    SELECT new_folder_id, ds.id
    FROM public.data_sources ds
    WHERE ds.user_id = r.user_id
    ON CONFLICT (folder_id, data_source_id) DO NOTHING;
  END LOOP;

  -- Also grant schema grantees access to the folder as viewers
  INSERT INTO public.folder_members (folder_id, user_id, role, granted_by)
  SELECT DISTINCT s.folder_id, sg.granted_to_user_id, 'viewer'::folder_role, sg.granted_by_user_id
  FROM public.schema_grants sg
  JOIN public.schemas s ON s.id = sg.schema_id
  WHERE s.folder_id IS NOT NULL
  ON CONFLICT (folder_id, user_id) DO NOTHING;
END $$;
