-- Schema Transformations: stores transformation pipelines for schemas
-- These pipelines serve as starting points for the data cleansing agent

CREATE TABLE IF NOT EXISTS public.schema_transformations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_id UUID NOT NULL REFERENCES public.schemas(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Default Pipeline',
  description TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_dataset_id UUID REFERENCES public.datasets(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookups by schema
CREATE INDEX idx_schema_transformations_schema ON public.schema_transformations(schema_id);

-- Ensure only one default pipeline per schema
CREATE UNIQUE INDEX idx_schema_transformations_unique_default
  ON public.schema_transformations(schema_id) WHERE is_default = true;

-- RLS: Access controlled via schema ownership/grants (same as schema_contexts)
-- No RLS enabled - access checked at API level via schema ownership
