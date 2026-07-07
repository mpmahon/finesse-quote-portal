-- ============================================================
-- WS4: quote lifecycle enum values (design doc v2 §9.1).
--
-- Separate migration because Postgres forbids USING a newly-added enum
-- value in the same transaction that added it — 00012 maps data onto
-- these values. 'final' remains in the enum as a legacy alias but is
-- migrated to 'sent' and never written again.
-- ============================================================

alter type public.quote_status add value if not exists 'sent';
alter type public.quote_status add value if not exists 'accepted';
alter type public.quote_status add value if not exists 'declined';
