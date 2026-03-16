-- Add 'memory' as a valid schema_contexts type for auto-saved AI directives
ALTER TABLE public.schema_contexts DROP CONSTRAINT IF EXISTS schema_contexts_type_check;
ALTER TABLE public.schema_contexts ADD CONSTRAINT schema_contexts_type_check
  CHECK (type IN ('lookup_table', 'validation', 'text_instructions', 'memory'));
