-- ============================================================
-- WS1: security hardening (design doc v2 §5).
--
-- 1. Server-authoritative money: customers lose ALL direct write
--    access to quotes and quote_line_items. Quote generation goes
--    through /api/quotes/calculate (service role after explicit
--    authorization); notes edits go through a server action that
--    whitelists the notes column. Staff policies from 00008 remain.
-- 2. Salesmen gain read access to profiles — required for the
--    Batch 3 customer picker and for showing quote owner names.
--    (Previously only administrators could read other profiles.)
-- 3. Legacy pricing columns default_markup_pct / reseller_discount_pct
--    are dropped — nothing reads them since the Batch 4 engine rewrite.
-- ============================================================

-- 1. Quotes: customers can read their own quotes but never write them.
drop policy if exists "quotes_update_own" on public.quotes;
drop policy if exists "quotes_insert_own" on public.quotes;
drop policy if exists "line_items_insert_own" on public.quote_line_items;

-- 2. Profiles: staff-wide read (salesman + administrator).
drop policy if exists "profiles_select_admin" on public.profiles;
create policy "profiles_select_staff" on public.profiles
  for select using (public.get_user_role() in ('salesman', 'administrator'));

-- 3. Legacy pricing config columns.
alter table public.pricing_config
  drop column if exists default_markup_pct,
  drop column if exists reseller_discount_pct;
