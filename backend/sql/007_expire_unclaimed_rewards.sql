-- Deletes any reward still pending 24h after it was won, so unclaimed items don't
-- stack up forever. Runs automatically every hour via pg_cron. Run in SQL Editor.

create extension if not exists pg_cron;

select cron.schedule(
  'expire-unclaimed-rewards',
  '0 * * * *',  -- every hour, on the hour
  $$ delete from public.rewards where status = 'pending' and created_at < now() - interval '24 hours'; $$
);
