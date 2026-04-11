-- ============================================================
-- Add customer-type values to the user_role enum.
--
-- Runs in a separate migration because Postgres forbids USING a newly-added
-- enum value in the same transaction that added it. 00008 relies on these
-- values being present when it runs the backfill.
-- ============================================================

alter type public.user_role add value if not exists 'retail_customer';
alter type public.user_role add value if not exists 'wholesale_customer';
