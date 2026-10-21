-- Generated from lib/db/migrations.ts (007_submissions). Do not edit by hand.
-- Work handed in as files. A teacher turns it on per deadline and picks the formats (lib/submissions.ts):
-- file_types null = no files, students tick the deadline off. After the due time uploads close,
-- unless allow_late: then late files are accepted and the teacher sees how late they came.
alter table deadlines add column file_types text[];
alter table deadlines add column allow_late boolean not null default false;

create table submission_files (
  id uuid primary key default gen_random_uuid(),
  deadline_id uuid not null references deadlines(id) on delete cascade,
  student_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  size int not null,
  data bytea not null,
  uploaded_at timestamptz not null default now()
);
create index submission_files_deadline on submission_files (deadline_id, student_id);

alter table submission_files enable row level security;
grant select on submission_files to uni_app;
create policy submission_files_read on submission_files for select to uni_app using (
  student_id = app_uid() or deadline_id in (select my_teaching_deadline_ids()));
