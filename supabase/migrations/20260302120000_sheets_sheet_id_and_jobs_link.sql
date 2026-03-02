-- Add sheet_id (a shared hash that groups raw/final versions) and auto-increment version_id to sheets.
-- Link jobs to sheets via sheet_id.

-- 1. Add sheet_id column (nullable first so we can backfill)
alter table public.sheets add column if not exists sheet_id text;

-- 2. Backfill existing rows: use the existing id as the sheet_id
update public.sheets set sheet_id = id::text where sheet_id is null;

-- 3. Make sheet_id not null
alter table public.sheets alter column sheet_id set not null;

-- 4. Drop the old version_id (text, S3 version) and recreate as auto-increment integer
alter table public.sheets drop column if exists version_id;

-- Create a sequence for version numbering per sheet_id.
-- We use a simple integer column and compute the next value on insert via trigger.
alter table public.sheets add column version_id integer not null default 1;

-- 5. Expand the type check to include 'final'
alter table public.sheets drop constraint if exists sheets_type_check;
alter table public.sheets add constraint sheets_type_check
  check (type in ('raw', 'processed', 'intermediary', 'final'));

-- 6. Index on sheet_id for grouping queries
create index if not exists sheets_sheet_id_idx on public.sheets (sheet_id);

-- 7. Function + trigger to auto-increment version_id per sheet_id
create or replace function public.sheets_auto_version_id()
returns trigger as $$
begin
  if NEW.version_id is null or NEW.version_id <= 0 then
    select coalesce(max(version_id), 0) + 1
      into NEW.version_id
      from public.sheets
      where sheet_id = NEW.sheet_id;
  end if;
  return NEW;
end;
$$ language plpgsql;

drop trigger if exists sheets_auto_version_id_trigger on public.sheets;
create trigger sheets_auto_version_id_trigger
before insert on public.sheets
for each row execute function public.sheets_auto_version_id();

-- 8. Add sheet_id column to jobs table
alter table public.jobs add column if not exists sheet_id text;

-- 9. Index on jobs.sheet_id
create index if not exists jobs_sheet_id_idx on public.jobs (sheet_id);

comment on column public.sheets.sheet_id is 'Shared identifier that groups raw and final versions of the same logical sheet.';
comment on column public.sheets.version_id is 'Auto-incrementing version number within a sheet_id group (1 = first upload).';
comment on column public.jobs.sheet_id is 'Links the job to the logical sheet it processes.';
