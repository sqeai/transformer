-- Add data_engineer to the folder_role enum.
-- Data engineers can only see schemas and datasets within their assigned folders.
ALTER TYPE folder_role ADD VALUE IF NOT EXISTS 'data_engineer';
