-- ============================================================================
-- Migration: Folders, RBAC, and Folder Management
-- Adds folder hierarchy, role-based access control, folder contexts,
-- data connections, dimensions tables, and links existing resources to folders.
-- ============================================================================

-- 2A. Add is_superadmin to users
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_superadmin BOOLEAN NOT NULL DEFAULT false;

-- 2B. Folders table (unlimited nesting via parent_id self-reference)
CREATE TABLE IF NOT EXISTS public.folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID REFERENCES public.folders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(parent_id, name)
);

CREATE INDEX IF NOT EXISTS idx_folders_parent ON public.folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_folders_created_by ON public.folders(created_by);

-- 2C. Folder members / roles
DO $$ BEGIN
  CREATE TYPE folder_role AS ENUM ('viewer', 'editor', 'admin', 'owner');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.folder_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id UUID NOT NULL REFERENCES public.folders(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role folder_role NOT NULL DEFAULT 'viewer',
  granted_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(folder_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_folder_members_user ON public.folder_members(user_id);
CREATE INDEX IF NOT EXISTS idx_folder_members_folder ON public.folder_members(folder_id);

-- 2D. Folder context (markdown content per folder)
CREATE TABLE IF NOT EXISTS public.folder_contexts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id UUID NOT NULL UNIQUE REFERENCES public.folders(id) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT '',
  updated_by UUID REFERENCES public.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2E. Folder data connections (link data sources to folders)
CREATE TABLE IF NOT EXISTS public.folder_data_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id UUID NOT NULL REFERENCES public.folders(id) ON DELETE CASCADE,
  data_source_id UUID NOT NULL REFERENCES public.data_sources(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(folder_id, data_source_id)
);

CREATE INDEX IF NOT EXISTS idx_folder_data_connections_folder ON public.folder_data_connections(folder_id);

-- Folder context tables (which tables from which data sources are relevant to a context)
CREATE TABLE IF NOT EXISTS public.folder_context_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_context_id UUID NOT NULL REFERENCES public.folder_contexts(id) ON DELETE CASCADE,
  data_source_id UUID NOT NULL REFERENCES public.data_sources(id) ON DELETE CASCADE,
  schema_name TEXT NOT NULL,
  table_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_folder_context_tables_context ON public.folder_context_tables(folder_context_id);

-- 2F. Dimensions table (column metadata per data source table)
CREATE TABLE IF NOT EXISTS public.table_dimensions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data_source_id UUID NOT NULL REFERENCES public.data_sources(id) ON DELETE CASCADE,
  schema_name TEXT NOT NULL,
  table_name TEXT NOT NULL,
  dimensions JSONB NOT NULL DEFAULT '[]',
  last_refreshed_at TIMESTAMPTZ,
  refreshed_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(data_source_id, schema_name, table_name)
);

CREATE INDEX IF NOT EXISTS idx_table_dimensions_source ON public.table_dimensions(data_source_id);

-- 2G. Add folder_id to existing resource tables
ALTER TABLE public.schemas
  ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES public.folders(id) ON DELETE SET NULL;

ALTER TABLE public.data_sources
  ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES public.folders(id) ON DELETE SET NULL;

ALTER TABLE public.datasets
  ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES public.folders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_schemas_folder ON public.schemas(folder_id);
CREATE INDEX IF NOT EXISTS idx_data_sources_folder ON public.data_sources(folder_id);
CREATE INDEX IF NOT EXISTS idx_datasets_folder ON public.datasets(folder_id);

-- Helper: auto-update updated_at on folders
CREATE OR REPLACE FUNCTION public.update_folders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_folders_updated_at ON public.folders;
CREATE TRIGGER trg_folders_updated_at
  BEFORE UPDATE ON public.folders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_folders_updated_at();
