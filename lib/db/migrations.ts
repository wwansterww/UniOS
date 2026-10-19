// SQL migrations, applied in order at boot (local PGlite) or by `npm run db:migrate` (Supabase).
// `npm run db:export` writes the same SQL to supabase/migrations/*.sql.

export const migrations: { name: string; sql: string }[] = [
  {
    name: "001_schema",
    sql: /* sql */ `
create table profiles (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text,
  role text not null default 'student' check (role in ('student', 'teacher')),
  full_name text not null,
  telegram_chat_id bigint unique,
  locale text not null default 'ru' check (locale in ('ru', 'kk', 'en')),
  ics_token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  canvas_feed_url text,
  canvas_synced_at timestamptz,
  canvas_error text,
  created_at timestamptz not null default now()
);

create table magic_links (
  token text primary key,
  email text not null,
  expires_at timestamptz not null,
  used_at timestamptz
);

create table telegram_link_tokens (
  token text primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz
);

create table courses (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  code text not null,
  color text not null default '#8C80EF',
  created_at timestamptz not null default now()
);

create table groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table group_members (
  group_id uuid not null references groups(id) on delete cascade,
  student_id uuid not null references profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, student_id)
);

create table course_groups (
  course_id uuid not null references courses(id) on delete cascade,
  group_id uuid not null references groups(id) on delete cascade,
  primary key (course_id, group_id)
);

create table class_sessions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  group_id uuid not null references groups(id) on delete cascade,
  series_id uuid,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  room text not null default '',
  status text not null default 'scheduled' check (status in ('scheduled', 'moved', 'cancelled')),
  original_starts_at timestamptz,
  original_room text,
  updated_at timestamptz not null default now()
);
create index class_sessions_group_time on class_sessions (group_id, starts_at);

create table deadlines (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references courses(id) on delete cascade,
  owner_id uuid references profiles(id) on delete cascade,
  title text not null,
  due_at timestamptz not null,
  description text not null default '',
  link text,
  source text not null default 'manual' check (source in ('manual', 'canvas')),
  external_uid text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check ((course_id is null) <> (owner_id is null))
);
create unique index deadlines_external_uid on deadlines (owner_id, external_uid) where external_uid is not null;
create index deadlines_due on deadlines (due_at);

create table deadline_groups (
  deadline_id uuid not null references deadlines(id) on delete cascade,
  group_id uuid not null references groups(id) on delete cascade,
  primary key (deadline_id, group_id)
);

create table deadline_status (
  student_id uuid not null references profiles(id) on delete cascade,
  deadline_id uuid not null references deadlines(id) on delete cascade,
  done_at timestamptz not null default now(),
  primary key (student_id, deadline_id)
);

create table announcements (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  body text not null default '',
  is_important boolean not null default false,
  is_pinned boolean not null default false,
  created_at timestamptz not null default now()
);

create table announcement_reads (
  announcement_id uuid not null references announcements(id) on delete cascade,
  student_id uuid not null references profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (announcement_id, student_id)
);

create table notification_prefs (
  user_id uuid primary key references profiles(id) on delete cascade,
  offsets_minutes int[] not null default '{1440,60}',
  instant_enabled boolean not null default true,
  channels text[] not null default '{telegram,in_app}',
  quiet_start time not null default '23:00',
  quiet_end time not null default '08:00',
  digest_enabled boolean not null default true,
  digest_last_sent date
);

-- offset_minutes > 0: regular reminder; 0: one-off "urgent"; < 0: snooze ("remind me in 1 hour").
create table reminders (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id) on delete cascade,
  deadline_id uuid not null references deadlines(id) on delete cascade,
  offset_minutes int not null,
  kind text not null default 'reminder' check (kind in ('reminder', 'urgent', 'snooze')),
  send_at timestamptz not null,
  sent_at timestamptz,
  skipped boolean not null default false,
  attempts int not null default 0,
  last_error text,
  opened_at timestamptz,
  created_at timestamptz not null default now(),
  unique (student_id, deadline_id, offset_minutes)
);
create index reminders_due on reminders (send_at) where sent_at is null;

-- In-app inbox and outbox for instant messages (moved deadline, cancelled class, important announcement...).
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null default '',
  link text,
  payload jsonb not null default '{}',
  deliver boolean not null default false,
  send_at timestamptz not null default now(),
  sent_at timestamptz,
  attempts int not null default 0,
  last_error text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user on notifications (user_id, created_at desc);
create index notifications_outbox on notifications (send_at) where deliver and sent_at is null;

create table registration_windows (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  url text not null,
  opened_notified_at timestamptz,
  closing_notified_at timestamptz
);

create table events (
  id bigint generated always as identity primary key,
  user_id uuid references profiles(id) on delete set null,
  name text not null,
  props jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index events_name on events (name, created_at);
`,
  },
  {
    name: "002_rls",
    sql: /* sql */ `
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
`,
  },
];
