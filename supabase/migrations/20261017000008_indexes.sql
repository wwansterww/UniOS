-- Generated from lib/db/migrations.ts (009_indexes). Do not edit by hand.
-- Indexes for the lookups that run on almost every page. Primary keys lead with the other column
-- (e.g. group_members is keyed by group_id, student_id), so reverse lookups — "groups of this student",
-- "courses of this teacher", the RLS helper functions — would otherwise scan the whole table.
create index if not exists group_members_student on group_members (student_id);
create index if not exists course_groups_group on course_groups (group_id);
create index if not exists courses_teacher on courses (teacher_id);
create index if not exists class_sessions_course on class_sessions (course_id, starts_at);
create index if not exists deadlines_course on deadlines (course_id) where course_id is not null;
create index if not exists deadlines_owner on deadlines (owner_id) where owner_id is not null;
create index if not exists deadline_groups_group on deadline_groups (group_id);
create index if not exists deadline_status_deadline on deadline_status (deadline_id);
create index if not exists reminders_deadline on reminders (deadline_id);
create index if not exists announcements_course on announcements (course_id, created_at desc);
create index if not exists announcement_reads_student on announcement_reads (student_id);
create index if not exists group_advisors_advisor on group_advisors (advisor_id);
create index if not exists magic_links_email on magic_links (email, expires_at);
