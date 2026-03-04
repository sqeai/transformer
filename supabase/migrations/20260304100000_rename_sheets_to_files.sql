-- Rename the "sheets" table to "files" and update all related references.

-- 1. Drop existing triggers, policies, and indexes on public.sheets
drop trigger if exists sheets_auto_version_id_trigger on public.sheets;
drop trigger if exists sheets_set_updated_at on public.sheets;

drop policy if exists "Users can view own sheets" on public.sheets;
drop policy if exists "Users can insert own sheets" on public.sheets;
drop policy if exists "Users can update own sheets" on public.sheets;

-- 2. Rename the table
alter table public.sheets rename to files;

-- 3. Rename the sheet_id column to file_id
alter table public.files rename column sheet_id to file_id;

-- 4. Rename constraint
alter table public.files drop constraint if exists sheets_type_check;
alter table public.files add constraint files_type_check
  check (type in ('raw', 'processed', 'intermediary', 'final'));

-- 5. Drop old indexes and recreate with new names
drop index if exists sheets_storage_url_unique;
drop index if exists sheets_user_id_idx;
drop index if exists sheets_type_idx;
drop index if exists sheets_sheet_id_idx;

create unique index if not exists files_storage_url_unique on public.files (storage_url);
create index if not exists files_user_id_idx on public.files (user_id);
create index if not exists files_type_idx on public.files (type);
create index if not exists files_file_id_idx on public.files (file_id);

-- 6. Recreate triggers with new names
create trigger files_set_updated_at
before update on public.files
for each row execute function public.set_updated_at_timestamp();

-- Update the auto-version function to reference the new table/column
create or replace function public.files_auto_version_id()
returns trigger as $$
begin
  if NEW.version_id is null or NEW.version_id <= 0 then
    select coalesce(max(version_id), 0) + 1
      into NEW.version_id
      from public.files
      where file_id = NEW.file_id;
  end if;
  return NEW;
end;
$$ language plpgsql;

create trigger files_auto_version_id_trigger
before insert on public.files
for each row execute function public.files_auto_version_id();

-- 7. Recreate RLS policies
alter table public.files enable row level security;

create policy "Users can view own files"
  on public.files for select
  using (auth.uid() = user_id);

create policy "Users can insert own files"
  on public.files for insert
  with check (auth.uid() = user_id);

create policy "Users can update own files"
  on public.files for update
  using (auth.uid() = user_id);

-- 8. Rename sheet_id on jobs table to file_id
alter table public.jobs rename column sheet_id to file_id;

drop index if exists jobs_sheet_id_idx;
create index if not exists jobs_file_id_idx on public.jobs (file_id);

-- 9. Update comments
comment on table public.files is 'Tracks raw/processed/intermediary/final CSV/Excel files stored in S3.';
comment on column public.files.storage_url is 'S3 object location represented as bucket/key.';
comment on column public.files.dimensions is 'JSON object with table shape metadata such as rowCount and columnCount.';
comment on column public.files.file_id is 'Shared identifier that groups raw and final versions of the same logical file.';
comment on column public.files.version_id is 'Auto-incrementing version number within a file_id group (1 = first upload).';
comment on column public.jobs.file_id is 'Links the job to the logical file it processes.';

-- 10. Drop the old auto-version function (no longer needed)
drop function if exists public.sheets_auto_version_id();
