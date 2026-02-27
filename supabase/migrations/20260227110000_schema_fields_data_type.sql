-- Add static SQL/BigQuery-compatible type per schema field.
alter table public.schema_fields
add column if not exists data_type text;

-- Backfill existing fields to STRING so every field has a static type.
update public.schema_fields
set data_type = 'STRING'
where data_type is null;

-- Keep values constrained to generic SQL/BigQuery-compatible primitives.
alter table public.schema_fields
drop constraint if exists schema_fields_data_type_check;

alter table public.schema_fields
add constraint schema_fields_data_type_check
check (
  data_type is null
  or data_type in ('STRING', 'INTEGER', 'FLOAT', 'NUMERIC', 'BOOLEAN', 'DATE', 'DATETIME', 'TIMESTAMP')
);
