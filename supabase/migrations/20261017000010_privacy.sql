-- Generated from lib/db/migrations.ts (011_privacy). Do not edit by hand.
-- Consent to the privacy policy (Law of RK No. 94-V "On personal data and their protection", art. 7–8): who agreed
-- to which version, when and from where. A withdrawal keeps the row as proof of what was agreed until then.
create table consents (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  version text not null,
  source text not null default 'signin' check (source in ('signin', 'application')),
  ip text not null default '',
  user_agent text not null default '',
  accepted_at timestamptz not null default now(),
  withdrawn_at timestamptz
);
create index consents_profile on consents (profile_id, accepted_at desc);
-- Server-only: no grant to uni_app.
alter table consents enable row level security;

-- Set while a person's consent is withdrawn: nothing is sent to them, and after the grace period their
-- non-academic data (notifications, reminders, sign-in history, analytics) is removed (lib/privacy.ts).
alter table profiles add column consent_withdrawn_at timestamptz;

-- The consent a teacher gives on the application form, moved to the new profile on approval.
alter table teacher_applications add column consent_version text not null default '';

-- Medical certificates are kept only while needed: the file goes 30 days after the decision, the decision stays.
alter table excuses add column file_deleted_at timestamptz;

-- Least privilege for reads made on behalf of a user (role uni_app): only the columns pages show. Password
-- hashes, calendar and Canvas feed tokens, Telegram chat ids and session versions stay out of reach even on rows
-- RLS lets a user see; the server reads them as itself.
revoke select on profiles from uni_app;
grant select (id, email, role, full_name, locale, created_at) on profiles to uni_app;
