-- Run once in the Supabase SQL editor after deploying.
-- Every 5 minutes pg_cron asks the app to send due reminders and queued notifications.
-- Replace <APP_URL> and <CRON_SECRET> with the values from your Vercel environment.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'unios-tick',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := '<APP_URL>/api/cron/tick',
    headers := jsonb_build_object('authorization', 'Bearer <CRON_SECRET>', 'content-type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

-- Check:   select * from cron.job_run_details order by start_time desc limit 10;
-- Remove:  select cron.unschedule('unios-tick');
