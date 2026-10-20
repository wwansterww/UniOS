-- Generated from lib/db/migrations.ts (003_journal). Do not edit by hand.
-- Gradebook and attendance. A course has graded works (assessments); each student gets points for a work.
-- Attendance is marked per class session. Students see only their own rows, teachers only their courses.
create table assessments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  title text not null,
  max_points numeric(6,2) not null default 100 check (max_points > 0),
  created_at timestamptz not null default now()
);
create index assessments_course on assessments (course_id, created_at);

create table grades (
  assessment_id uuid not null references assessments(id) on delete cascade,
  student_id uuid not null references profiles(id) on delete cascade,
  points numeric(6,2) not null check (points >= 0),
  graded_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (assessment_id, student_id)
);
create index grades_student on grades (student_id);

create table attendance (
  session_id uuid not null references class_sessions(id) on delete cascade,
  student_id uuid not null references profiles(id) on delete cascade,
  status text not null check (status in ('present', 'late', 'absent')),
  marked_by uuid references profiles(id) on delete set null,
  marked_at timestamptz not null default now(),
  primary key (session_id, student_id)
);
create index attendance_student on attendance (student_id);

create or replace function my_teaching_assessment_ids() returns setof uuid language sql stable security definer set search_path = public as
$$ select id from assessments where course_id in (select my_teaching_course_ids()) $$;

create or replace function my_teaching_session_ids() returns setof uuid language sql stable security definer set search_path = public as
$$ select id from class_sessions where course_id in (select my_teaching_course_ids()) $$;

alter table assessments enable row level security;
alter table grades enable row level security;
alter table attendance enable row level security;

grant select on assessments, grades, attendance to uni_app;

create policy assessments_read on assessments for select to uni_app using (course_id in (select my_course_ids()));

create policy grades_read on grades for select to uni_app using (
  student_id = app_uid() or assessment_id in (select my_teaching_assessment_ids()));

create policy attendance_read on attendance for select to uni_app using (
  student_id = app_uid() or session_id in (select my_teaching_session_ids()));
