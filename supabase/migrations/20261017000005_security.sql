-- Generated from lib/db/migrations.ts (006_security). Do not edit by hand.
-- Sessions carry the profile's version: changing or resetting the password (or "sign out everywhere")
-- bumps it and every older session stops working. Blocked accounts can't sign in.
alter table profiles add column session_version int not null default 0;
alter table profiles add column must_change_password boolean not null default false;
alter table profiles add column disabled_at timestamptz;

-- Every sign-in attempt, for lockouts after repeated wrong passwords and "last sign-in" in the profile.
create table login_attempts (
  id bigint generated always as identity primary key,
  email text not null,
  ip text not null default '',
  user_agent text not null default '',
  ok boolean not null,
  created_at timestamptz not null default now()
);
create index login_attempts_email on login_attempts (email, created_at desc);
create index login_attempts_ip on login_attempts (ip, created_at desc);
-- Server-only: no grant to uni_app.
alter table login_attempts enable row level security;
