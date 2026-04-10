-- ============================================================
-- Finesse Quote Portal - Complete Database Schema
-- ============================================================

-- Enums
create type user_role as enum ('customer', 'salesman', 'administrator');
create type mount_type as enum ('inside', 'outside');
create type unit_type as enum ('per_inch', 'per_sq_inch', 'fixed');
create type quote_status as enum ('draft', 'final', 'expired');

-- ============================================================
-- PROFILES
-- ============================================================
create table public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  first_name      text not null default '',
  last_name       text not null default '',
  email           text not null,
  contact_number  text,
  role            user_role not null default 'customer',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, first_name, last_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'first_name', ''),
    coalesce(new.raw_user_meta_data->>'last_name', ''),
    coalesce(new.email, ''),
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'customer')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- PROPERTIES
-- ============================================================
create table public.properties (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  name        text not null,
  address     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ============================================================
-- ROOMS
-- ============================================================
create table public.rooms (
  id          uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- PRODUCTS (blind makes/models)
-- ============================================================
create table public.products (
  id          uuid primary key default gen_random_uuid(),
  make        text not null,
  model       text not null,
  shade_types text[] not null default '{}',
  styles      text[] not null default '{}',
  colours     text[] not null default '{}',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ============================================================
-- COMPONENTS (unit pricing per product)
-- ============================================================
create table public.components (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products(id) on delete cascade,
  name        text not null,
  unit        unit_type not null,
  usd_price   numeric(10,4) not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ============================================================
-- WINDOWS
-- ============================================================
create table public.windows (
  id            uuid primary key default gen_random_uuid(),
  room_id       uuid not null references public.rooms(id) on delete cascade,
  name          text not null,
  width_inches  numeric(8,2) not null,
  height_inches numeric(8,2) not null,
  depth_inches  numeric(8,2),
  mount_type    mount_type not null default 'inside',
  has_blind     boolean not null default true,
  has_awning    boolean not null default false,
  -- Configuration (selected product + options)
  product_id    uuid references public.products(id),
  shade_type    text,
  style         text,
  colour        text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint chk_positive_dims check (width_inches > 0 and height_inches > 0)
);

-- ============================================================
-- QUOTES
-- ============================================================
create table public.quotes (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.profiles(id) on delete cascade,
  property_id           uuid not null references public.properties(id) on delete cascade,
  status                quote_status not null default 'draft',
  currency              text not null default 'TTD',
  exchange_rate         numeric(10,4) not null default 7.0,
  markup_percent        numeric(5,2) not null default 20.0,
  discount_percent      numeric(5,2) not null default 0.0,
  duty_percent          numeric(5,2) not null default 5.0,
  shipping_fee_ttd      numeric(10,2) not null default 25.0,
  labor_cost_ttd        numeric(10,2) not null default 30.0,
  installation_cost_ttd numeric(10,2) not null default 60.0,
  subtotal_usd          numeric(12,2) not null default 0,
  total_ttd             numeric(12,2) not null default 0,
  created_at            timestamptz not null default now(),
  expires_at            timestamptz default (now() + interval '14 days')
);

-- ============================================================
-- QUOTE LINE ITEMS
-- ============================================================
create table public.quote_line_items (
  id              uuid primary key default gen_random_uuid(),
  quote_id        uuid not null references public.quotes(id) on delete cascade,
  window_id       uuid not null references public.windows(id) on delete cascade,
  product_id      uuid not null references public.products(id),
  room_name       text not null,
  window_name     text not null,
  blind_width     numeric(8,2) not null,
  blind_height    numeric(8,2) not null,
  fabric_area     numeric(12,2) not null,
  chain_length    numeric(8,2) not null,
  shade_type      text,
  style           text,
  colour          text,
  cassette_cost   numeric(10,2) not null default 0,
  tube_cost       numeric(10,2) not null default 0,
  bottom_rail_cost numeric(10,2) not null default 0,
  chain_cost      numeric(10,2) not null default 0,
  fabric_cost     numeric(10,2) not null default 0,
  fixed_costs     numeric(10,2) not null default 0,
  line_total_usd  numeric(10,2) not null default 0,
  created_at      timestamptz not null default now()
);

-- ============================================================
-- PRICING CONFIG (singleton)
-- ============================================================
create table public.pricing_config (
  id                      int primary key default 1 check (id = 1),
  exchange_rate           numeric(10,4) not null default 7.0,
  reseller_discount_pct   numeric(5,2) not null default 15.0,
  default_markup_pct      numeric(5,2) not null default 20.0,
  labor_cost_ttd          numeric(10,2) not null default 30.0,
  installation_cost_ttd   numeric(10,2) not null default 60.0,
  duty_percent            numeric(5,2) not null default 5.0,
  shipping_fee_ttd        numeric(10,2) not null default 25.0,
  max_window_width_in     numeric(8,2) not null default 180,
  max_window_height_in    numeric(8,2) not null default 120,
  min_window_size_in      numeric(8,2) not null default 6,
  quote_validity_days     int not null default 14,
  updated_at              timestamptz not null default now()
);

insert into public.pricing_config (id) values (1);

-- ============================================================
-- AUDIT LOGS
-- ============================================================
create table public.audit_logs (
  id              uuid primary key default gen_random_uuid(),
  admin_user_id   uuid not null references public.profiles(id),
  action_type     text not null,
  target_table    text,
  target_id       uuid,
  change_summary  jsonb,
  created_at      timestamptz not null default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- Helper function
create or replace function public.get_user_role()
returns user_role as $$
  select role from public.profiles where id = auth.uid();
$$ language sql security definer stable;

-- PROFILES
alter table public.profiles enable row level security;
create policy "profiles_select_own" on public.profiles for select using (id = auth.uid());
create policy "profiles_update_own" on public.profiles for update using (id = auth.uid());
create policy "profiles_select_admin" on public.profiles for select using (public.get_user_role() = 'administrator');

-- PROPERTIES
alter table public.properties enable row level security;
create policy "properties_select_own" on public.properties for select using (user_id = auth.uid());
create policy "properties_insert_own" on public.properties for insert with check (user_id = auth.uid());
create policy "properties_update_own" on public.properties for update using (user_id = auth.uid());
create policy "properties_delete_own" on public.properties for delete using (user_id = auth.uid());
create policy "properties_select_admin" on public.properties for select using (public.get_user_role() = 'administrator');

-- ROOMS
alter table public.rooms enable row level security;
create policy "rooms_select_own" on public.rooms for select using (
  exists (select 1 from public.properties where properties.id = rooms.property_id and properties.user_id = auth.uid())
);
create policy "rooms_insert_own" on public.rooms for insert with check (
  exists (select 1 from public.properties where properties.id = rooms.property_id and properties.user_id = auth.uid())
);
create policy "rooms_update_own" on public.rooms for update using (
  exists (select 1 from public.properties where properties.id = rooms.property_id and properties.user_id = auth.uid())
);
create policy "rooms_delete_own" on public.rooms for delete using (
  exists (select 1 from public.properties where properties.id = rooms.property_id and properties.user_id = auth.uid())
);

-- WINDOWS
alter table public.windows enable row level security;
create policy "windows_select_own" on public.windows for select using (
  exists (select 1 from public.rooms join public.properties on properties.id = rooms.property_id
    where rooms.id = windows.room_id and properties.user_id = auth.uid())
);
create policy "windows_insert_own" on public.windows for insert with check (
  exists (select 1 from public.rooms join public.properties on properties.id = rooms.property_id
    where rooms.id = windows.room_id and properties.user_id = auth.uid())
);
create policy "windows_update_own" on public.windows for update using (
  exists (select 1 from public.rooms join public.properties on properties.id = rooms.property_id
    where rooms.id = windows.room_id and properties.user_id = auth.uid())
);
create policy "windows_delete_own" on public.windows for delete using (
  exists (select 1 from public.rooms join public.properties on properties.id = rooms.property_id
    where rooms.id = windows.room_id and properties.user_id = auth.uid())
);

-- PRODUCTS (read: all auth, write: admin)
alter table public.products enable row level security;
create policy "products_select_auth" on public.products for select using (auth.uid() is not null);
create policy "products_insert_admin" on public.products for insert with check (public.get_user_role() = 'administrator');
create policy "products_update_admin" on public.products for update using (public.get_user_role() = 'administrator');
create policy "products_delete_admin" on public.products for delete using (public.get_user_role() = 'administrator');

-- COMPONENTS
alter table public.components enable row level security;
create policy "components_select_auth" on public.components for select using (auth.uid() is not null);
create policy "components_insert_admin" on public.components for insert with check (public.get_user_role() = 'administrator');
create policy "components_update_admin" on public.components for update using (public.get_user_role() = 'administrator');
create policy "components_delete_admin" on public.components for delete using (public.get_user_role() = 'administrator');

-- QUOTES
alter table public.quotes enable row level security;
create policy "quotes_select_own" on public.quotes for select using (user_id = auth.uid());
create policy "quotes_insert_own" on public.quotes for insert with check (user_id = auth.uid());
create policy "quotes_update_own" on public.quotes for update using (user_id = auth.uid());
create policy "quotes_select_admin" on public.quotes for select using (public.get_user_role() = 'administrator');

-- QUOTE LINE ITEMS
alter table public.quote_line_items enable row level security;
create policy "line_items_select_own" on public.quote_line_items for select using (
  exists (select 1 from public.quotes where quotes.id = quote_line_items.quote_id and quotes.user_id = auth.uid())
);
create policy "line_items_insert_own" on public.quote_line_items for insert with check (
  exists (select 1 from public.quotes where quotes.id = quote_line_items.quote_id and quotes.user_id = auth.uid())
);

-- PRICING CONFIG
alter table public.pricing_config enable row level security;
create policy "config_select_auth" on public.pricing_config for select using (auth.uid() is not null);
create policy "config_update_admin" on public.pricing_config for update using (public.get_user_role() = 'administrator');

-- AUDIT LOGS
alter table public.audit_logs enable row level security;
create policy "audit_select_admin" on public.audit_logs for select using (public.get_user_role() = 'administrator');
create policy "audit_insert_admin" on public.audit_logs for insert with check (public.get_user_role() = 'administrator');
