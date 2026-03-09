-- Add logo_url column to folders for custom folder icons
ALTER TABLE public.folders
  ADD COLUMN IF NOT EXISTS logo_url TEXT;
