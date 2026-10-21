-- Generated from lib/db/migrations.ts (008_supabase_api). Do not edit by hand.
-- Supabase also serves the public schema over its Data API (roles anon and authenticated). UniOS never uses it:
-- every read and write goes through the app's server. Take those roles' access away, also for tables added later.
-- Locally there are no such roles, so this does nothing.
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') and exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on all tables in schema public from anon, authenticated;
    revoke all on all sequences in schema public from anon, authenticated;
    alter default privileges in schema public revoke all on tables from anon, authenticated;
    alter default privileges in schema public revoke all on sequences from anon, authenticated;
  end if;
end $$;
