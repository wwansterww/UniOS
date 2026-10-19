-- Generated from lib/db/migrations.ts (001_schema). Do not edit by hand.
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
