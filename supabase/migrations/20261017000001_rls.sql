-- Generated from lib/db/migrations.ts (002_rls). Do not edit by hand.
-- Row Level Security. Every read made on behalf of a signed-in user runs inside a
-- transaction with "set local role uni_app" and app.user_id set (see lib/db/index.ts withUser).
-- uni_app can only SELECT; writes go through server actions that check ownership explicitly.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'uni_app') then
    create role uni_app nologin;
  end if;
end $$;
grant uni_app to current_user;
grant usage on schema public to uni_app;

create or replace function app_uid() returns uuid language sql stable as
$$ select nullif(current_setting('app.user_id', true), '')::uuid $$;

create or replace function my_group_ids() returns setof uuid language sql stable security definer set search_path = public as
$$ select group_id from group_members where student_id = app_uid() $$;

create or replace function my_teaching_course_ids() returns setof uuid language sql stable security definer set search_path = public as
$$ select id from courses where teacher_id = app_uid() $$;

create or replace function my_course_ids() returns setof uuid language sql stable security definer set search_path = public as
$$ select id from courses where teacher_id = app_uid()
   union select course_id from course_groups where group_id in (select my_group_ids()) $$;

create or replace function my_teaching_group_ids() returns setof uuid language sql stable security definer set search_path = public as
$$ select group_id from course_groups where course_id in (select my_teaching_course_ids())
   union select id from groups where created_by = app_uid() $$;

create or replace function my_teaching_student_ids() returns setof uuid language sql stable security definer set search_path = public as
$$ select student_id from group_members where group_id in (select my_teaching_group_ids()) $$;

create or replace function my_teaching_deadline_ids() returns setof uuid language sql stable security definer set search_path = public as
$$ select id from deadlines where course_id in (select my_teaching_course_ids()) $$;

create or replace function deadline_visible(d deadlines) returns boolean language sql stable security definer set search_path = public as
$$ select d.owner_id = app_uid()
   or d.course_id in (select my_teaching_course_ids())
   or (d.deleted_at is null and exists (
        select 1 from deadline_groups dg where dg.deadline_id = d.id and dg.group_id in (select my_group_ids()))) $$;

alter table profiles enable row level security;
alter table courses enable row level security;
alter table groups enable row level security;
alter table group_members enable row level security;
alter table course_groups enable row level security;
alter table class_sessions enable row level security;
alter table deadlines enable row level security;
alter table deadline_groups enable row level security;
alter table deadline_status enable row level security;
alter table announcements enable row level security;
alter table announcement_reads enable row level security;
alter table notification_prefs enable row level security;
alter table reminders enable row level security;
alter table notifications enable row level security;
alter table registration_windows enable row level security;
alter table events enable row level security;
alter table magic_links enable row level security;
alter table telegram_link_tokens enable row level security;

grant select on profiles, courses, groups, group_members, course_groups, class_sessions, deadlines,
  deadline_groups, deadline_status, announcements, announcement_reads, notification_prefs, reminders,
  notifications, registration_windows to uni_app;

create policy profiles_read on profiles for select to uni_app using (
  id = app_uid() or role = 'teacher'
  or id in (select my_teaching_student_ids()));

create policy courses_read on courses for select to uni_app using (id in (select my_course_ids()));

create policy groups_read on groups for select to uni_app using (
  id in (select my_group_ids()) or id in (select my_teaching_group_ids()));

create policy group_members_read on group_members for select to uni_app using (
  student_id = app_uid() or group_id in (select my_teaching_group_ids()));

create policy course_groups_read on course_groups for select to uni_app using (course_id in (select my_course_ids()));

create policy class_sessions_read on class_sessions for select to uni_app using (
  course_id in (select my_teaching_course_ids()) or group_id in (select my_group_ids()));

create policy deadlines_read on deadlines for select to uni_app using (deadline_visible(deadlines));

create policy deadline_groups_read on deadline_groups for select to uni_app using (
  group_id in (select my_group_ids())
  or deadline_id in (select my_teaching_deadline_ids()));

create policy deadline_status_read on deadline_status for select to uni_app using (
  student_id = app_uid()
  or deadline_id in (select my_teaching_deadline_ids()));

create policy announcements_read on announcements for select to uni_app using (course_id in (select my_course_ids()));

create policy announcement_reads_read on announcement_reads for select to uni_app using (
  student_id = app_uid()
  or announcement_id in (select id from announcements where course_id in (select my_teaching_course_ids())));

create policy notification_prefs_read on notification_prefs for select to uni_app using (user_id = app_uid());
create policy reminders_read on reminders for select to uni_app using (student_id = app_uid());
create policy notifications_read on notifications for select to uni_app using (user_id = app_uid());
create policy registration_windows_read on registration_windows for select to uni_app using (true);
