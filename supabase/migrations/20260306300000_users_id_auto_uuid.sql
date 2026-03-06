-- Allow direct user registration without requiring auth.users.
-- Drop any FK from public.users.id -> auth.users.id and add a default UUID.

DO $$
DECLARE
  fk_name text;
BEGIN
  SELECT conname INTO fk_name
  FROM pg_constraint
  WHERE conrelid = 'public.users'::regclass
    AND contype = 'f'
    AND conkey = ARRAY[(
      SELECT attnum FROM pg_attribute
      WHERE attrelid = 'public.users'::regclass AND attname = 'id'
    )];

  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.users DROP CONSTRAINT %I', fk_name);
  END IF;
END
$$;

ALTER TABLE public.users ALTER COLUMN id SET DEFAULT gen_random_uuid();
