-- ============================================================
-- Batch 2: customer type split, creator tracking, hardware
-- exclusions, quote notes, markup by customer type, staff RLS.
--
-- Depends on 00007 (enum values retail_customer / wholesale_customer)
-- being committed first.
-- ============================================================

-- ------------------------------------------------------------
-- 1. PROFILES — backfill existing 'customer' rows to 'retail_customer'
--    and update the handle_new_user trigger default so public signups
--    land in retail_customer by default.
-- ------------------------------------------------------------

update public.profiles
  set role = 'retail_customer'
  where role = 'customer';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, first_name, last_name, email, contact_number, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'first_name', ''),
    coalesce(new.raw_user_meta_data->>'last_name', ''),
    coalesce(new.email, ''),
    nullif(new.raw_user_meta_data->>'contact_number', ''),
    coalesce(
      nullif(new.raw_user_meta_data->>'role', '')::user_role,
      'retail_customer'
    )
  );
  return new;
end;
$$;

alter function public.handle_new_user() owner to postgres;

-- ------------------------------------------------------------
-- 2. PRICING_CONFIG — introduce retail/wholesale markup.
--    default_markup_pct and reseller_discount_pct are left in place for now;
--    Batch 4 (quote engine rewrite) will drop them once nothing reads from
--    them. Duty, shipping, labour, exchange_rate are all kept — they're
--    needed for the future Purchasing Module.
-- ------------------------------------------------------------

alter table public.pricing_config
  add column if not exists retail_markup_pct   numeric(5,2) not null default 40.00,
  add column if not exists wholesale_markup_pct numeric(5,2) not null default 20.00;

-- ------------------------------------------------------------
-- 3. PROPERTIES — track the creator (salesman / admin / customer).
--    Backfills from user_id so the column can be NOT NULL.
-- ------------------------------------------------------------

alter table public.properties
  add column if not exists created_by uuid references public.profiles(id);

update public.properties set created_by = user_id where created_by is null;

alter table public.properties
  alter column created_by set not null;

create index if not exists properties_created_by_idx on public.properties(created_by);

-- ------------------------------------------------------------
-- 4. QUOTES — creator tracking + notes array.
--    Each note is shaped { id, text, show_on_pdf } (see QuoteNote in
--    src/types/database.ts). Admins and salesmen can add notes; a per-note
--    show_on_pdf flag controls whether the customer sees it on the PDF.
-- ------------------------------------------------------------

alter table public.quotes
  add column if not exists created_by uuid references public.profiles(id),
  add column if not exists notes jsonb not null default '[]'::jsonb;

update public.quotes set created_by = user_id where created_by is null;

alter table public.quotes
  alter column created_by set not null;

create index if not exists quotes_created_by_idx on public.quotes(created_by);

-- ------------------------------------------------------------
-- 5. WINDOWS — excluded hardware components for this window's blind.
--    Empty array = all hardware components from the product's blueprint
--    are included (current behaviour). Entries are component name strings
--    (e.g., 'cassette', 'tube') matching the components table.
-- ------------------------------------------------------------

alter table public.windows
  add column if not exists excluded_components text[] not null default '{}';

-- ------------------------------------------------------------
-- 6. AUDIT_LOGS — rename admin_user_id to actor_id.
--    Salesmen also write to this table now (staff activity report), so the
--    "admin" name is misleading. The table itself keeps its name for now;
--    a future migration can rename it to activity_log once the TS/query
--    churn is acceptable.
-- ------------------------------------------------------------

alter table public.audit_logs
  rename column admin_user_id to actor_id;

-- ------------------------------------------------------------
-- 7. ROW LEVEL SECURITY — staff policies for salesman + administrator.
--
--    Pattern: for each user-owned resource table, the existing "_own"
--    policies remain (customers see/manage their own rows); we add "_staff"
--    policies that grant full CRUD to salesmen and administrators.
--    Postgres ORs the policies, so a customer still matches _own while a
--    salesman or admin matches _staff.
-- ------------------------------------------------------------

-- PROPERTIES
drop policy if exists "properties_select_admin" on public.properties;
create policy "properties_select_staff" on public.properties
  for select using (public.get_user_role() in ('salesman', 'administrator'));
create policy "properties_insert_staff" on public.properties
  for insert with check (public.get_user_role() in ('salesman', 'administrator'));
create policy "properties_update_staff" on public.properties
  for update using (public.get_user_role() in ('salesman', 'administrator'));
create policy "properties_delete_staff" on public.properties
  for delete using (public.get_user_role() in ('salesman', 'administrator'));

-- ROOMS
create policy "rooms_select_staff" on public.rooms
  for select using (public.get_user_role() in ('salesman', 'administrator'));
create policy "rooms_insert_staff" on public.rooms
  for insert with check (public.get_user_role() in ('salesman', 'administrator'));
create policy "rooms_update_staff" on public.rooms
  for update using (public.get_user_role() in ('salesman', 'administrator'));
create policy "rooms_delete_staff" on public.rooms
  for delete using (public.get_user_role() in ('salesman', 'administrator'));

-- WINDOWS
create policy "windows_select_staff" on public.windows
  for select using (public.get_user_role() in ('salesman', 'administrator'));
create policy "windows_insert_staff" on public.windows
  for insert with check (public.get_user_role() in ('salesman', 'administrator'));
create policy "windows_update_staff" on public.windows
  for update using (public.get_user_role() in ('salesman', 'administrator'));
create policy "windows_delete_staff" on public.windows
  for delete using (public.get_user_role() in ('salesman', 'administrator'));

-- QUOTES
drop policy if exists "quotes_select_admin" on public.quotes;
create policy "quotes_select_staff" on public.quotes
  for select using (public.get_user_role() in ('salesman', 'administrator'));
create policy "quotes_insert_staff" on public.quotes
  for insert with check (public.get_user_role() in ('salesman', 'administrator'));
create policy "quotes_update_staff" on public.quotes
  for update using (public.get_user_role() in ('salesman', 'administrator'));
create policy "quotes_delete_staff" on public.quotes
  for delete using (public.get_user_role() in ('salesman', 'administrator'));

-- QUOTE_LINE_ITEMS
create policy "line_items_select_staff" on public.quote_line_items
  for select using (public.get_user_role() in ('salesman', 'administrator'));
create policy "line_items_insert_staff" on public.quote_line_items
  for insert with check (public.get_user_role() in ('salesman', 'administrator'));
create policy "line_items_update_staff" on public.quote_line_items
  for update using (public.get_user_role() in ('salesman', 'administrator'));
create policy "line_items_delete_staff" on public.quote_line_items
  for delete using (public.get_user_role() in ('salesman', 'administrator'));

-- AUDIT_LOGS — salesmen can now view and insert, not just admins.
drop policy if exists "audit_select_admin" on public.audit_logs;
drop policy if exists "audit_insert_admin" on public.audit_logs;
create policy "audit_select_staff" on public.audit_logs
  for select using (public.get_user_role() in ('salesman', 'administrator'));
create policy "audit_insert_staff" on public.audit_logs
  for insert with check (public.get_user_role() in ('salesman', 'administrator'));
