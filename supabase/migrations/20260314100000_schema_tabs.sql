-- Schema contexts: lookup_table, validation, text_instructions
CREATE TABLE IF NOT EXISTS public.schema_contexts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_id UUID NOT NULL REFERENCES public.schemas(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('lookup_table', 'validation', 'text_instructions')),
  name TEXT NOT NULL,
  content TEXT,
  data_source_id UUID REFERENCES public.data_sources(id) ON DELETE SET NULL,
  bq_dataset TEXT,
  bq_table TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_schema_contexts_schema ON public.schema_contexts(schema_id);

-- Schema mandatory approvers: subset of folder members
CREATE TABLE IF NOT EXISTS public.schema_mandatory_approvers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_id UUID NOT NULL REFERENCES public.schemas(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(schema_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_schema_mandatory_approvers_schema ON public.schema_mandatory_approvers(schema_id);

-- Schema data source: links a schema to a specific table in a data source
CREATE TABLE IF NOT EXISTS public.schema_data_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_id UUID NOT NULL UNIQUE REFERENCES public.schemas(id) ON DELETE CASCADE,
  data_source_id UUID NOT NULL REFERENCES public.data_sources(id) ON DELETE CASCADE,
  table_schema TEXT NOT NULL,
  table_name TEXT NOT NULL,
  is_new_table BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
