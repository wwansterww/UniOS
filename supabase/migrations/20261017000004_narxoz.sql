-- Generated from lib/db/migrations.ts (005_narxoz). Do not edit by hand.
-- Narxoz grading: every work belongs to midterm 1 (rk1), midterm 2 (rk2) or the exam.
-- Final = 60% admission rating (mean of RK1 and RK2) + 40% exam. Teachers can comment a grade.
alter table assessments add column category text not null default 'rk1' check (category in ('rk1', 'rk2', 'exam'));
alter table grades add column comment text not null default '';

-- Semester of a course: 2026-2 = fall 2026, 2026-1 = spring 2026.
alter table courses add column term text not null default (to_char(now(), 'YYYY') || case when extract(month from now()) >= 7 then '-2' else '-1' end);

-- Excused absences (medical certificate…) don't count toward the 25% limit.
alter table attendance drop constraint attendance_status_check;
alter table attendance add constraint attendance_status_check check (status in ('present', 'late', 'absent', 'excused'));

create table excuses (
  session_id uuid not null references class_sessions(id) on delete cascade,
  student_id uuid not null references profiles(id) on delete cascade,
  reason text not null default '',
  file bytea,
  file_type text,
  file_name text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (session_id, student_id)
);

-- QR check-in is open only while the teacher shows the code (each refresh extends it by a minute).
alter table class_sessions add column checkin_until timestamptz;

-- Advisors (эдвайзеры) look after whole groups: they read grades and attendance of their students.
alter table profiles drop constraint profiles_role_check;
alter table profiles add constraint profiles_role_check check (role in ('student', 'teacher', 'advisor'));
create table group_advisors (
  group_id uuid not null references groups(id) on delete cascade,
  advisor_id uuid not null references profiles(id) on delete cascade,
  primary key (group_id, advisor_id)
);

create or replace function my_advised_group_ids() returns setof uuid language sql stable security definer set search_path = public as
$$ select group_id from group_advisors where advisor_id = app_uid() $$;

create or replace function my_advised_student_ids() returns setof uuid language sql stable security definer set search_path = public as
$$ select student_id from group_members where group_id in (select my_advised_group_ids()) $$;

create or replace function my_course_ids() returns setof uuid language sql stable security definer set search_path = public as
$$ select id from courses where teacher_id = app_uid()
   union select course_id from course_groups where group_id in (select my_group_ids())
   union select course_id from course_groups where group_id in (select my_advised_group_ids()) $$;

alter table excuses enable row level security;
alter table group_advisors enable row level security;
grant select on excuses, group_advisors to uni_app;

create policy excuses_read on excuses for select to uni_app using (
  student_id = app_uid() or session_id in (select my_teaching_session_ids()) or student_id in (select my_advised_student_ids()));
create policy group_advisors_read on group_advisors for select to uni_app using (advisor_id = app_uid());

drop policy profiles_read on profiles;
create policy profiles_read on profiles for select to uni_app using (
  id = app_uid() or role = 'teacher'
  or id in (select my_teaching_student_ids()) or id in (select my_advised_student_ids()));

drop policy groups_read on groups;
create policy groups_read on groups for select to uni_app using (
  id in (select my_group_ids()) or id in (select my_teaching_group_ids()) or id in (select my_advised_group_ids()));

drop policy group_members_read on group_members;
create policy group_members_read on group_members for select to uni_app using (
  student_id = app_uid() or group_id in (select my_teaching_group_ids()) or group_id in (select my_advised_group_ids()));

drop policy class_sessions_read on class_sessions;
create policy class_sessions_read on class_sessions for select to uni_app using (
  course_id in (select my_teaching_course_ids()) or group_id in (select my_group_ids()) or group_id in (select my_advised_group_ids()));

drop policy grades_read on grades;
create policy grades_read on grades for select to uni_app using (
  student_id = app_uid() or assessment_id in (select my_teaching_assessment_ids()) or student_id in (select my_advised_student_ids()));

drop policy attendance_read on attendance;
create policy attendance_read on attendance for select to uni_app using (
  student_id = app_uid() or session_id in (select my_teaching_session_ids()) or student_id in (select my_advised_student_ids()));
