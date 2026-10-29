-- Generated from lib/db/migrations.ts (010_teacher_applications). Do not edit by hand.
-- Teachers apply for an account themselves, also ones from outside the university: name, email, password and
-- the subjects they teach with a weekly timetable (lib/applications.ts). Nothing is created before an advisor
-- approves; then the profile, its courses and classes appear in one go. A rejected application keeps its
-- password hash only so that its author, and nobody else, sees the advisor's reason when signing in.
create table teacher_applications (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text not null,
  password_hash text not null,
  locale text not null default 'ru' check (locale in ('ru', 'kk', 'en')),
  note text not null default '',
  -- [{ title, code, credits, slots: [{ group_id, weekday (0 = Monday), start "HH:MM", room }] }]
  subjects jsonb not null,
  starts_on date not null,
  ends_on date not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_note text not null default '',
  profile_id uuid references profiles(id) on delete set null,
  ip text not null default '',
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);
-- One open application per address.
create unique index teacher_applications_pending on teacher_applications (email) where status = 'pending';
create index teacher_applications_email on teacher_applications (email, created_at desc);
create index teacher_applications_status on teacher_applications (status, created_at desc);
create index teacher_applications_ip on teacher_applications (ip, created_at desc);
-- Server-only (password hashes): no grant to uni_app.
alter table teacher_applications enable row level security;
